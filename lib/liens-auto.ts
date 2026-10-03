/*
 * Connexions automatiques entre œuvres.
 *
 * Pour chaque paire d'œuvres, on calcule un score de cohérence :
 *  - même artiste / auteur ;
 *  - genres et sous-genres en commun, tous mélangés : le genre est traité
 *    comme un terme de plus, placé en tête de la liste des sous-genres.
 *    Le « Alt-Pop » en genre chez l'un et en sous-genre chez l'autre, c'est
 *    le même terme. Un terme rare compte plus qu'un terme répandu.
 *
 * Les comparaisons se font au mot près : « Hip-Hop » et « Trip-Hop » ne sont
 * pas liés. Seules les majuscules, accents et tirets sont ignorés
 * (« boom bap » = « Boom Bap »). Garde donc la même orthographe partout.
 *
 * Liste utilisée pour chaque œuvre : [genre, sous-genre 1, sous-genre 2, ...].
 * Du plus significatif au moins significatif : le premier terme compte
 * pleinement, les suivants de moins en moins.
 *
 * Deux œuvres sont reliées si leur score atteint le SEUIL (réglage plus bas).
 */

export const REGLAGES = {
  // --- Poids des critères ---
  /** Points par terme (genre ou sous-genre) en commun, avant rareté et ordre. */
  poidsSousGenre: 3,
  /**
   * Baisse du poids selon la position dans la liste : poids = 1 / (1 + ordre × position).
   * Avec 0.35 : 1er = 100 %, 2e = 74 %, 3e = 59 %, 4e = 49 %, 5e = 42 %.
   * 0 = tous les sous-genres comptent pareil.
   */
  ordre: 0.3,
  /** Un sous-genre rare peut compter jusqu'à ce multiple. */
  rareteMax: 3,
  /** Bonus si même artiste / auteur. */
  bonusArtiste: 6,

  // --- Seuil ---
  /** Score minimum pour créer un lien. Monte-le pour moins de liens, baisse-le pour plus. */
  seuil: 17,
  /**
   * Nombre max de liens automatiques par œuvre. null = illimité :
   * seul le score décide. Mets un nombre (ex. 5) pour limiter.
   */
  maxParOeuvre: null as number | null,
};

export type OeuvreTags = {
  id: number;
  auteur: string;
  genre?: string;
  sousGenres?: string[];
};

export type LienAuto = {
  a: number;
  b: number;
  score: number;
  /** Sous-genres partagés (pour l'admin). */
  communs: string[];
};

export type LienManuel = { a: number; b: number };

export type LienFinal = {
  a: number;
  b: number;
  auto: boolean;
  score?: number;
  communs?: string[];
};

export function normTag(s: string) {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Toutes les paires d'œuvres dont le score atteint le seuil. */
export function calculerCandidats(oeuvres: OeuvreTags[], r = REGLAGES): LienAuto[] {
  const N = oeuvres.length;
  if (N < 2) return [];

  // Pour chaque œuvre : terme → libellé + poids selon sa position.
  // Les termes sont [genre, ...sousGenres], sans distinction.
  type Tag = { label: string; poids: number };
  const tags = new Map<number, Map<string, Tag>>();
  const freq = new Map<string, number>();
  for (const o of oeuvres) {
    const m = new Map<string, Tag>();
    for (const t of [o.genre ?? "", ...(o.sousGenres ?? [])]) {
      const k = normTag(t);
      if (k && !m.has(k)) m.set(k, { label: t.trim(), poids: 1 / (1 + r.ordre * m.size) });
    }
    tags.set(o.id, m);
    for (const k of m.keys()) freq.set(k, (freq.get(k) ?? 0) + 1);
  }
  const rarete = (k: string) => Math.min(r.rareteMax, Math.log2(1 + N / (freq.get(k) ?? N)));

  const out: LienAuto[] = [];
  for (let i = 0; i < N; i++) {
    const a = oeuvres[i]!;
    const ta = tags.get(a.id)!;
    for (let j = i + 1; j < N; j++) {
      const b = oeuvres[j]!;
      const tb = tags.get(b.id)!;
      let score = 0;
      const communs: string[] = [];

      // Termes en commun. Le poids combine la position du terme
      // chez les deux œuvres (moyenne géométrique).
      for (const [k, tagA] of ta) {
        const tagB = tb.get(k);
        if (!tagB) continue;
        communs.push(tagA.label);
        score += r.poidsSousGenre * rarete(k) * Math.sqrt(tagA.poids * tagB.poids);
      }

      // Même artiste
      if (a.auteur && normTag(a.auteur) === normTag(b.auteur)) score += r.bonusArtiste;

      if (score >= r.seuil) {
        out.push({ a: a.id, b: b.id, score: Math.round(score * 10) / 10, communs });
      }
    }
  }
  return out.sort((x, y) => y.score - x.score);
}

/**
 * Garde les liens au-dessus du seuil, avec au plus `max` liens par œuvre.
 * Le max est strict : on prend les liens du plus fort au plus faible, et un
 * lien n'est accepté que si AUCUNE des deux œuvres n'a déjà atteint son max.
 * Résultat : pas d'œuvre « hub » reliée à tout.
 */
export function selectionner(candidats: LienAuto[], r = REGLAGES): LienAuto[] {
  const seuil = r.seuil;
  const max = r.maxParOeuvre ?? Infinity;
  const nb = new Map<number, number>();
  const out: LienAuto[] = [];
  for (const l of [...candidats].sort((x, y) => y.score - x.score)) {
    if (l.score < seuil) break;
    if ((nb.get(l.a) ?? 0) >= max || (nb.get(l.b) ?? 0) >= max) continue;
    nb.set(l.a, (nb.get(l.a) ?? 0) + 1);
    nb.set(l.b, (nb.get(l.b) ?? 0) + 1);
    out.push(l);
  }
  return out;
}

/** Connexions finales : automatiques + manuelles. */
export function assemblerLiens(candidats: LienAuto[], manuels: LienManuel[], r = REGLAGES): LienFinal[] {
  const cle = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const out = new Map<string, LienFinal>();
  for (const l of selectionner(candidats, r)) out.set(cle(l.a, l.b), { ...l, auto: true });
  const parCle = new Map(candidats.map((l) => [cle(l.a, l.b), l]));
  for (const l of manuels) {
    const k = cle(l.a, l.b);
    const c = parCle.get(k);
    out.set(k, { a: l.a, b: l.b, auto: false, score: c?.score, communs: c?.communs });
  }
  return [...out.values()];
}
