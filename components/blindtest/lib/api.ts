import type { Album, Artiste, Cible, Extrait, Playlist, Titre, TypeRecherche } from "./types";

/* Appels au relais Deezer (fonction Netlify « /api/deezer »). */

type Reponses = {
  chercher: { titres?: Titre[]; artistes?: Artiste[]; albums?: Album[]; playlists?: Playlist[] };
  top: { artiste: Artiste; titres: Titre[] };
  album: { album: Album; titres: Titre[] };
  playlist: { playlist: Playlist; titres: Titre[] };
  titre: { titre: Titre };
  lien: Cible;
  extrait: Extrait;
};

export class ErreurRelais extends Error {
  statut: number;
  constructor(message: string, statut: number) {
    super(message);
    this.statut = statut;
  }
}

export async function relais<K extends keyof Reponses>(op: K, params: Record<string, string | number>, signal?: AbortSignal): Promise<Reponses[K]> {
  const q = new URLSearchParams({ op, ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) });
  let rep: Response;
  try {
    rep = await fetch(`/api/deezer?${q}`, { signal: signal ?? AbortSignal.timeout(15_000) });
  } catch (e) {
    if ((e as Error).name === "AbortError" && signal?.aborted) throw e;
    throw new ErreurRelais("Pas de réponse. Vérifie ta connexion et réessaie.", 0);
  }
  if (rep.status === 429) throw new ErreurRelais("Trop de demandes d'un coup : attends quelques secondes.", 429);
  let json: unknown = null;
  try {
    json = await rep.json();
  } catch {}
  if (!rep.ok) {
    const msg = (json as { erreur?: string } | null)?.erreur;
    throw new ErreurRelais(msg || "Le relais Deezer ne répond pas. Réessaie dans un instant.", rep.status);
  }
  return json as Reponses[K];
}

export const chercher = (type: TypeRecherche, q: string, signal?: AbortSignal) => relais("chercher", { type, q }, signal);
