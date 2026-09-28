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

export function initiales(o: Pick<Oeuvre, "titre">): string {
  return o.titre
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";
}
