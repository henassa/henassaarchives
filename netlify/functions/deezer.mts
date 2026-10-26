import type { Config } from "@netlify/functions";
import { normaliser, correspond } from "../../components/blindtest/lib/texte.ts";
import type { Album, Artiste, Cible, Extrait, Playlist, Titre, TypeRecherche } from "../../components/blindtest/lib/types.ts";

/*
 * Le relais vers Deezer (et iTunes en secours).
 *
 * Le navigateur ne peut pas appeler l'API Deezer directement : il passe par ici.
 * Pour éviter que ce relais serve à n'importe quoi, il n'accepte qu'une liste fermée
 * d'opérations, vérifie chaque paramètre, et ne contacte que Deezer et iTunes.
 * Netlify limite en plus le nombre d'appels par visiteur (voir « config » en bas).
 */

const DEEZER = "https://api.deezer.com";
const ITUNES = "https://itunes.apple.com";
const LIENS_AUTORISES = new Set(["link.deezer.com", "deezer.page.link", "dzr.page.link", "www.deezer.com", "deezer.com"]);
const MAX_TITRES_PLAYLIST = 400;

class Erreur extends Error {
  statut: number;
  constructor(message: string, statut = 400) {
    super(message);
    this.statut = statut;
  }
}

const attendre = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Appel à l'API Deezer, avec un nouvel essai si Deezer dit « trop de demandes ». */
async function deezer(chemin: string, essai = 0): Promise<any> {
  let rep: Response;
  try {
    rep = await fetch(DEEZER + chemin, { signal: AbortSignal.timeout(7000), headers: { "Accept-Language": "fr" } });
  } catch {
    throw new Erreur("Deezer ne répond pas. Réessaie dans un instant.", 502);
  }
  if (!rep.ok) throw new Erreur("Deezer ne répond pas. Réessaie dans un instant.", 502);
  const json = await rep.json();
  if (json?.error) {
    const code = Number(json.error.code);
    if ((code === 4 || code === 700) && essai < 2) {
      await attendre(700 * (essai + 1));
      return deezer(chemin, essai + 1);
    }
    if (code === 800) throw new Erreur("Introuvable sur Deezer.", 404);
    throw new Erreur("Deezer a refusé la demande. Réessaie plus tard.", 502);
  }
  return json;
}

const texte = (v: unknown) => (typeof v === "string" ? v : "");

function versTitre(t: any, album?: { titre: string; pochette: string }): Titre {
  const principal = texte(t?.artist?.name);
  const autres = Array.isArray(t?.contributors) ? t.contributors.map((c: any) => texte(c?.name)) : [];
  return {
    id: String(t?.id ?? ""),
    titre: texte(t?.title_short) || texte(t?.title),
    artiste: principal,
    artistes: [...new Set([principal, ...autres].filter(Boolean))],
    album: texte(t?.album?.title) || album?.titre || "",
    pochette: texte(t?.album?.cover_medium) || album?.pochette || "",
    extrait: !!texte(t?.preview),
  };
}

const versArtiste = (a: any): Artiste => ({ id: String(a.id), nom: texte(a.name), image: texte(a.picture_medium), fans: Number(a.nb_fan) || 0 });
const versAlbum = (a: any): Album => ({
  id: String(a.id),
  titre: texte(a.title),
  artiste: texte(a?.artist?.name),
  pochette: texte(a.cover_medium),
  nb: Number(a.nb_tracks) || 0,
  annee: texte(a.release_date).slice(0, 4) || undefined,
});
const versPlaylist = (p: any): Playlist => ({
  id: String(p.id),
  titre: texte(p.title),
  auteur: texte(p?.user?.name) || texte(p?.creator?.name),
  pochette: texte(p.picture_medium),
  nb: Number(p.nb_tracks) || 0,
});

/* ---------- Vérification des paramètres ---------- */

function idDeezer(v: string | null) {
  if (!v || !/^\d{1,15}$/.test(v)) throw new Erreur("Identifiant invalide.");
  return v;
}

function requete(v: string | null) {
  const q = (v ?? "").replace(/[\p{Cc}]/gu, "").trim().slice(0, 100);
  if (q.length < 2) throw new Erreur("Tape au moins deux lettres.");
  return q;
}

/* ---------- Opérations ---------- */

const TYPES: Record<TypeRecherche, string> = { titre: "track", artiste: "artist", album: "album", playlist: "playlist" };

async function chercher(type: string | null, q: string) {
  if (!type || !(type in TYPES)) throw new Erreur("Type de recherche inconnu.");
  const t = type as TypeRecherche;
  const json = await deezer(`/search/${TYPES[t]}?q=${encodeURIComponent(q)}&limit=20`);
  const data: any[] = Array.isArray(json?.data) ? json.data : [];
  if (t === "titre") return { titres: data.map((d) => versTitre(d)) };
  if (t === "artiste") return { artistes: data.map(versArtiste) };
  if (t === "album") return { albums: data.map(versAlbum) };
  return { playlists: data.map(versPlaylist) };
}

async function top(id: string, n: number) {
  if (![10, 20, 50].includes(n)) throw new Erreur("Choisis 10, 20 ou 50 titres.");
  const [artiste, json] = await Promise.all([deezer(`/artist/${id}`), deezer(`/artist/${id}/top?limit=${n}`)]);
  return { artiste: versArtiste(artiste), titres: (json?.data ?? []).map((d: any) => versTitre(d)) };
}

async function album(id: string) {
  const a = await deezer(`/album/${id}`);
  const infos = { titre: texte(a.title), pochette: texte(a.cover_medium) };
  let pistes: any[] = Array.isArray(a?.tracks?.data) ? a.tracks.data : [];
  if (pistes.length < (Number(a.nb_tracks) || 0)) {
    const suite = await deezer(`/album/${id}/tracks?limit=200`);
    pistes = Array.isArray(suite?.data) ? suite.data : pistes;
  }
  return { album: versAlbum(a), titres: pistes.map((p) => versTitre(p, infos)) };
}

async function playlist(id: string) {
  const p = await deezer(`/playlist/${id}`);
  const total = Math.min(Number(p.nb_tracks) || 0, MAX_TITRES_PLAYLIST);
  let pistes: any[] = Array.isArray(p?.tracks?.data) ? p.tracks.data : [];
  // la première réponse ne contient pas toujours tout : on complète page par page
  while (pistes.length < total) {
    const page = await deezer(`/playlist/${id}/tracks?index=${pistes.length}&limit=100`);
    const data: any[] = Array.isArray(page?.data) ? page.data : [];
    if (!data.length) break;
    pistes = pistes.concat(data);
  }
  return { playlist: versPlaylist(p), titres: pistes.slice(0, MAX_TITRES_PLAYLIST).map((t) => versTitre(t)) };
}

async function unTitre(id: string) {
  return { titre: versTitre(await deezer(`/track/${id}`)) };
}

/** Lit un lien Deezer (complet ou court) et dit ce qu'il désigne. */
async function lien(brut: string | null): Promise<Cible> {
  const depart = (brut ?? "").trim().slice(0, 300);
  let url: URL;
  try {
    url = new URL(depart.startsWith("http") ? depart : `https://${depart}`);
  } catch {
    throw new Erreur("Ce lien n'est pas un lien Deezer.");
  }
  for (let saut = 0; saut < 5; saut++) {
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Erreur("Ce lien n'est pas un lien Deezer.");
    if (!LIENS_AUTORISES.has(url.hostname)) throw new Erreur("Ce lien n'est pas un lien Deezer.");
    const trouve = url.pathname.match(/^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(track|album|artist|playlist)\/(\d{1,15})/i);
    if (trouve) {
      const type = ({ track: "titre", album: "album", artist: "artiste", playlist: "playlist" } as const)[trouve[1].toLowerCase() as "track"];
      return { type, id: trouve[2] };
    }
    // lien court : on suit la redirection, sans jamais quitter les adresses Deezer
    let rep: Response;
    try {
      rep = await fetch(url.toString(), { redirect: "manual", signal: AbortSignal.timeout(6000) });
    } catch {
      throw new Erreur("Impossible d'ouvrir ce lien. Réessaie.", 502);
    }
    const suite = rep.headers.get("location");
    if (suite) {
      url = new URL(suite, url);
      continue;
    }
    // certaines pages de redirection mettent le lien dans le HTML
    const html = (await rep.text()).slice(0, 200_000);
    const dans = html.match(/https?:\/\/(?:www\.)?deezer\.com\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:track|album|artist|playlist)\/\d{1,15}/i);
    if (!dans) break;
    url = new URL(dans[0]);
  }
  throw new Erreur("Ce lien Deezer ne mène pas à un morceau, un album, un artiste ou une playlist.");
}

/** Le lien d'extrait d'un morceau, avec iTunes en secours. */
async function extrait(id: string): Promise<Extrait> {
  const t = await deezer(`/track/${id}`);
  const titre = versTitre(t);
  const grandePochette = texte(t?.album?.cover_big) || titre.pochette;
  const lienDeezer = texte(t?.link) || `https://www.deezer.com/track/${id}`;
  const url = texte(t?.preview);
  if (url.startsWith("https://")) return { url, source: "deezer", titre, grandePochette, lien: lienDeezer };

  // Pas d'extrait chez Deezer : on cherche le même morceau chez iTunes
  try {
    const terme = encodeURIComponent(`${titre.artiste} ${titre.titre}`.slice(0, 120));
    const rep = await fetch(`${ITUNES}/search?term=${terme}&entity=song&limit=10&country=FR`, { signal: AbortSignal.timeout(6000) });
    const json: any = await rep.json();
    const bon = (json?.results ?? []).find(
      (r: any) => typeof r?.previewUrl === "string" && r.previewUrl.startsWith("https://") && normaliser(texte(r.trackName)) === normaliser(titre.titre) && correspond(texte(r.artistName), titre.artistes)
    );
    if (bon) return { url: bon.previewUrl, source: "itunes", titre: { ...titre, extrait: true }, grandePochette, lien: lienDeezer };
  } catch {
    /* iTunes indisponible : on traite comme « pas d'extrait » */
  }
  throw new Erreur("Pas d'extrait disponible pour ce morceau.", 404);
}

/* ---------- Point d'entrée ---------- */

const UN_JOUR = 86400;

function repondre(corps: unknown, statut = 200, cacheCdn = 0) {
  const entetes: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": cacheCdn ? "public, max-age=300" : "no-store",
  };
  if (cacheCdn) {
    // le CDN de Netlify garde la réponse : les demandes suivantes ne réveillent pas la fonction
    entetes["Netlify-CDN-Cache-Control"] = `public, durable, s-maxage=${cacheCdn}, stale-while-revalidate=${cacheCdn}`;
    entetes["Netlify-Vary"] = "query";
  }
  return new Response(JSON.stringify(corps), { status: statut, headers: entetes });
}

export default async function relais(req: Request) {
  if (req.method !== "GET") return repondre({ erreur: "Méthode non autorisée." }, 405);
  const p = new URL(req.url).searchParams;
  try {
    switch (p.get("op")) {
      case "chercher":
        return repondre(await chercher(p.get("type"), requete(p.get("q"))), 200, UN_JOUR);
      case "top":
        return repondre(await top(idDeezer(p.get("id")), Number(p.get("n"))), 200, UN_JOUR);
      case "album":
        return repondre(await album(idDeezer(p.get("id"))), 200, UN_JOUR);
      case "playlist":
        return repondre(await playlist(idDeezer(p.get("id"))), 200, 3600);
      case "titre":
        return repondre(await unTitre(idDeezer(p.get("id"))), 200, UN_JOUR);
      case "lien":
        return repondre(await lien(p.get("url")), 200, UN_JOUR);
      case "extrait":
        // les liens d'extraits expirent : on ne les garde que 10 minutes
        return repondre(await extrait(idDeezer(p.get("id"))), 200, 600);
      default:
        return repondre({ erreur: "Opération inconnue." }, 400);
    }
  } catch (e) {
    if (e instanceof Erreur) return repondre({ erreur: e.message }, e.statut);
    return repondre({ erreur: "Erreur inattendue du relais." }, 500);
  }
}

export const config: Config = {
  path: "/api/deezer",
  method: "GET",
  // au-delà de 90 appels par minute depuis une même adresse, Netlify répond « trop de demandes »
  rateLimit: { windowLimit: 90, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
