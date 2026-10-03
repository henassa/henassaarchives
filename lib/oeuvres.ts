import fs from "node:fs";
import path from "node:path";
import { assemblerLiens, calculerCandidats, type LienAuto } from "./liens-auto";
import { mediaRempli } from "./media";
import { isTypeOeuvre, type TypeOeuvre } from "./sections";

export const CONNEXIONS_FILE = path.join(process.cwd(), "content", "connexions.json");

/*
 * Format du fichier content/connexions.json :
 *
 * {
 *   "oeuvres": [
 *     {
 *       "id": "nas-illmatic",                 ← identifiant lisible, unique
 *       "titre": "Illmatic",
 *       "auteur": "Nas",
 *       "annee": 1994,
 *       "type": "album",
 *       "genre": "Hip-Hop",
 *       "sousGenres": ["Boom Bap", "Jazz Rap"],
 *       "liens": ["autre-id"],                ← facultatif : liens forcés à la main
 *       "pasDeLien": ["autre-id"]             ← facultatif : casse un lien automatique
 *     }
 *   ]
 * }
 *
 * Les connexions sont calculées automatiquement à partir des sous-genres
 * (réglages dans lib/liens-auto.ts). « liens » et « pasDeLien » n'ont besoin
 * d'être écrits que d'un seul côté.
 *
 * Dans le code, chaque œuvre reçoit en plus un numéro interne (id).
 */

export type Oeuvre = {
  /** Numéro interne, attribué au chargement. */
  id: number;
  /** Identifiant lisible utilisé dans le fichier et dans les adresses. */
  slug?: string;
  titre: string;
  auteur: string;
  annee?: number;
  type: TypeOeuvre;
  genre?: string;
  sousGenres?: string[];
  cover?: string;
  /** Lien YouTube, fichier audio (/audio/x.mp3) ou n'importe quelle URL. */
  media?: string;
  description?: string;
};

export type Lien = {
  a: number;
  b: number;
  /** true = calculé automatiquement, false/absent = écrit à la main. */
  auto?: boolean;
  score?: number;
  communs?: string[];
};

/** Ce qu'utilise le site : les œuvres et toutes leurs connexions. */
export type ConnexionsData = {
  oeuvres: Oeuvre[];
  liens: Lien[];
};

/** Ce qu'utilise l'admin : le contenu du fichier + les liens calculés. */
export type ConnexionsBrut = {
  oeuvres: Oeuvre[];
  /** Liens écrits à la main. */
  liens: Lien[];
  /** Liens automatiques cassés à la main. */
  exclus: Lien[];
};

export type ConnexionsAdmin = ConnexionsBrut & {
  /** Toutes les connexions finales (auto + manuelles − exclues). */
  finales: Lien[];
};

export function slugify(s: string) {
  return (
    s
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "oeuvre"
  );
}

function str(v: unknown) {
  return v === undefined || v === null || v === "" ? undefined : String(v);
}

function liste(v: unknown): string[] | undefined {
  if (typeof v === "string") v = v.split(",");
  if (!Array.isArray(v)) return undefined;
  const out = [...new Set(v.map((x) => String(x).trim()).filter(Boolean))];
  return out.length ? out : undefined;
}

const cle = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

/**
 * Pochette automatique : pas besoin d'écrire « cover » dans le fichier.
 * Il suffit de nommer l'image comme l'id de l'œuvre et de la poser dans
 * public/images/oeuvres (nas-illmatic.jpg pour l'id « nas-illmatic »).
 * Formats reconnus : jpg, jpeg, png, webp, avif, gif.
 */
const DOSSIER_POCHETTES = path.join(process.cwd(), "public", "images", "oeuvres");
const EXTENSIONS = ["jpg", "jpeg", "png", "webp", "avif", "gif"];

function pochettesPresentes(): Map<string, string> {
  const m = new Map<string, string>();
  if (!fs.existsSync(DOSSIER_POCHETTES)) return m;
  for (const f of fs.readdirSync(DOSSIER_POCHETTES)) {
    const point = f.lastIndexOf(".");
    if (point <= 0) continue;
    const nom = f.slice(0, point), ext = f.slice(point + 1).toLowerCase();
    const rang = EXTENSIONS.indexOf(ext);
    if (rang === -1) continue;
    // si deux formats existent pour le même id, on garde le premier de la liste
    const deja = m.get(nom);
    if (!deja || rang < EXTENSIONS.indexOf(deja.slice(deja.lastIndexOf(".") + 1).toLowerCase())) m.set(nom, f);
  }
  return m;
}

function pochetteAuto(slug: string, presentes: Map<string, string>): string | undefined {
  const f = presentes.get(slug);
  return f ? `/images/oeuvres/${f}` : undefined;
}

export function readBrut(): ConnexionsBrut {
  if (!fs.existsSync(CONNEXIONS_FILE)) return { oeuvres: [], liens: [], exclus: [] };
  const raw = JSON.parse(fs.readFileSync(CONNEXIONS_FILE, "utf8"));
  const rawOeuvres: Record<string, unknown>[] = Array.isArray(raw.oeuvres) ? raw.oeuvres : [];

  // Chaque œuvre reçoit un numéro interne ; on garde la correspondance
  // avec l'identifiant écrit dans le fichier.
  const byKey = new Map<string, number>();
  const presentes = pochettesPresentes();
  const oeuvres: Oeuvre[] = rawOeuvres.map((r, i) => {
    const id = i + 1;
    const slug = str(r.id) ?? slugify(String(r.titre ?? `oeuvre-${id}`));
    byKey.set(slug, id);
    return {
      id,
      slug,
      titre: String(r.titre ?? ""),
      auteur: String(r.auteur ?? ""),
      annee: r.annee ? Number(r.annee) : undefined,
      type: isTypeOeuvre(r.type) ? r.type : "autre",
      genre: str(r.genre),
      // Accepte aussi les variantes d'écriture du champ
      sousGenres: liste(r.sousGenres ?? r["sous-genres"] ?? r["sous-genre"] ?? r.sousGenre),
      // « cover » écrit dans le fichier = prioritaire ; sinon l'image qui porte le nom de l'id
      cover: str(r.cover) ?? pochetteAuto(slug, presentes),
      // Un lien pas encore rempli (watch?v=) est ignoré : pas de bouton cassé
      media: mediaRempli(str(r.media)),
      description: str(r.description),
    };
  });

  const paires = (champ: string) => {
    const seen = new Set<string>();
    const out: Lien[] = [];
    rawOeuvres.forEach((r, i) => {
      const cibles = Array.isArray(r[champ]) ? (r[champ] as unknown[]) : [];
      for (const t of cibles) {
        const a = i + 1;
        const b = byKey.get(String(t));
        if (!b || a === b || seen.has(cle(a, b))) continue;
        seen.add(cle(a, b));
        out.push({ a, b });
      }
    });
    return out;
  };

  return { oeuvres, liens: paires("liens"), exclus: paires("pasDeLien") };
}

/**
 * Les univers ne se mélangent pas : un album n'est jamais relié à un film ou
 * à un jeu, même si leurs tags se ressemblent ou si le lien est écrit à la main.
 */
function memeType(brut: ConnexionsBrut) {
  const type = new Map(brut.oeuvres.map((o) => [o.id, o.type]));
  return (l: { a: number; b: number }) => type.get(l.a) === type.get(l.b);
}

/** Liens automatiques possibles, sans les liens cassés. */
function candidats(brut: ConnexionsBrut): LienAuto[] {
  const exclus = new Set(brut.exclus.map((l) => cle(l.a, l.b)));
  // Chaque univers est calculé à part : la rareté d'un tag se mesure parmi les
  // œuvres du même type, ajouter des films ne change donc rien aux liens des albums.
  const parType = new Map<string, Oeuvre[]>();
  for (const o of brut.oeuvres) parType.set(o.type, [...(parType.get(o.type) ?? []), o]);
  return [...parType.values()].flatMap((groupe) => calculerCandidats(groupe)).filter((l) => !exclus.has(cle(l.a, l.b)));
}

/** Connexions finales : automatiques + manuelles − cassées. */
export function assembler(brut: ConnexionsBrut): Lien[] {
  return assemblerLiens(candidats(brut), brut.liens.filter(memeType(brut)));
}

export function readConnexions(): ConnexionsData {
  const brut = readBrut();
  return { oeuvres: brut.oeuvres, liens: assembler(brut) };
}

export function readAdmin(): ConnexionsAdmin {
  const brut = readBrut();
  return { ...brut, finales: assembler(brut) };
}

/**
 * Modèle affiché en haut du fichier, avec tous les champs possibles.
 * Il est ignoré par le site et réécrit à chaque enregistrement de l'admin.
 */
const MODELE = {
  _info: "Modèle : copie ce bloc dans « oeuvres » pour ajouter une œuvre. Ce bloc-ci n'est pas affiché sur le site.",
  id: "identifiant-unique (obligatoire, minuscules et tirets, ex : nas-illmatic)",
  titre: "Titre de l'œuvre (obligatoire)",
  auteur: "Artiste, réalisateur, studio, écrivain... (obligatoire)",
  annee: 1994,
  type: "album | film | jeu | livre | autre (obligatoire)",
  genre: "Hip-Hop",
  sousGenres: ["Boom Bap", "Jazz Rap", "... : c'est ce qui crée les connexions automatiques"],
  cover: "facultatif : inutile si l'image s'appelle comme l'id (public/images/oeuvres/identifiant-unique.jpg)",
  media: "https://www.youtube.com/watch?v=... (ou /audio/extrait.mp3)",
  description: "Une ou deux phrases, affichées dans la fiche de l'œuvre.",
  liens: ["facultatif : id d'une œuvre à relier de force"],
  pasDeLien: ["facultatif : id d'une œuvre à ne PAS relier"],
};

export function writeConnexions(data: ConnexionsBrut) {
  // Identifiants lisibles et uniques
  const used = new Set<string>();
  const slugOf = new Map<number, string>();
  for (const o of data.oeuvres) {
    const base = o.slug?.trim() ? slugify(o.slug) : slugify(`${o.auteur} ${o.titre}`);
    let s = base;
    let n = 2;
    while (used.has(s)) s = `${base}-${n++}`;
    used.add(s);
    slugOf.set(o.id, s);
  }
  const order = new Map(data.oeuvres.map((o, i) => [o.id, i]));

  // Un lien est écrit d'un seul côté (sur l'œuvre qui vient en premier)
  const versListe = (liens: Lien[]) => {
    const m = new Map<number, number[]>();
    for (const l of liens) {
      if (!slugOf.has(l.a) || !slugOf.has(l.b) || l.a === l.b) continue;
      const [x, y] = order.get(l.a)! < order.get(l.b)! ? [l.a, l.b] : [l.b, l.a];
      m.set(x, [...new Set([...(m.get(x) ?? []), y])]);
    }
    return m;
  };
  const manuels = versListe(data.liens);
  const exclus = versListe(data.exclus);

  const out = {
    _modele: MODELE,
    oeuvres: data.oeuvres.map((o) => {
      const r: Record<string, unknown> = { id: slugOf.get(o.id), titre: o.titre, auteur: o.auteur };
      if (o.annee) r.annee = o.annee;
      r.type = o.type;
      if (o.genre) r.genre = o.genre;
      if (o.sousGenres?.length) r.sousGenres = o.sousGenres;
      // la pochette n'est écrite que si elle ne porte pas le nom de l'id
      const auto = new RegExp(`^/images/oeuvres/${slugOf.get(o.id)}\\.(${EXTENSIONS.join("|")})$`, "i");
      if (o.cover && !auto.test(o.cover)) r.cover = o.cover;
      if (o.media) r.media = o.media;
      if (o.description) r.description = o.description;
      const l = manuels.get(o.id);
      if (l?.length) r.liens = l.map((id) => slugOf.get(id));
      const x = exclus.get(o.id);
      if (x?.length) r.pasDeLien = x.map((id) => slugOf.get(id));
      return r;
    }),
  };

  // Les listes tiennent sur une ligne pour rester lisibles.
  const json = JSON.stringify(out, null, 2).replace(/"(liens|pasDeLien|sousGenres)": \[([^\]]*)\]/g, (_m, k: string, inner: string) => {
    const items = inner
      .split(/,\s*\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    return `"${k}": [${items.join(", ")}]`;
  });
  fs.writeFileSync(CONNEXIONS_FILE, json + "\n");
}
