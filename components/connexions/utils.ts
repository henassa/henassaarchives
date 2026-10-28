import type { Lien, Oeuvre } from "@/lib/oeuvres";

export type Voisin = { id: number };
export type VoisinsMap = Map<number, Voisin[]>;

export function buildVoisins(liens: Lien[]): VoisinsMap {
  const map: VoisinsMap = new Map();
  for (const l of liens) {
    if (!map.has(l.a)) map.set(l.a, []);
    if (!map.has(l.b)) map.set(l.b, []);
    map.get(l.a)!.push({ id: l.b });
    map.get(l.b)!.push({ id: l.a });
  }
  return map;
}

/**
 * Format de la pochette : carré pour la musique (albums), portrait 2:3 pour le
 * reste (affiches de films, jaquettes de jeux, couvertures de livres).
 */
export const enPortrait = (type?: string) => !!type && type !== "album";

/** Format d'une jaquette de jeu vidéo (celui d'IGDB : 3:4, 528 × 704), un peu plus large qu'une affiche. */
export const RATIO_JEU = 3 / 4;

/** Largeur ÷ hauteur de la pochette : 1 pour un album, 3/4 pour un jeu, 2/3 pour le reste (films…). */
export const ratioPochette = (type?: string) => (!enPortrait(type) ? 1 : type === "jeu" ? RATIO_JEU : 2 / 3);

export function initiales(o: Pick<Oeuvre, "titre">): string {
  return o.titre
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";
}
