import { isPlayable } from "./media";
import { readConnexions } from "./oeuvres";
import type { TypeOeuvre } from "./sections";

/** Ce que les mini-jeux reçoivent pour chaque œuvre. */
export type OeuvreJeu = {
  cle: string;
  titre: string;
  auteur: string;
  annee?: number;
  type: TypeOeuvre;
  genre?: string;
  sousGenres: string[];
  cover?: string;
  /** Lien lisible (YouTube ou fichier audio), sinon absent. */
  media?: string;
  /** Clés des œuvres reliées, de la connexion la plus forte à la plus faible. */
  liees: string[];
};

/** Nombre d'œuvres reliées données en indice dans « Devine l'œuvre ». */
const NB_LIEES = 4;

export function oeuvresPourJeux(): OeuvreJeu[] {
  const { oeuvres, liens } = readConnexions();
  const cle = new Map(oeuvres.map((o) => [o.id, o.slug ?? String(o.id)]));
  const voisins = new Map<number, { id: number; score: number }[]>();
  for (const l of liens) {
    const s = l.score ?? 0;
    voisins.set(l.a, [...(voisins.get(l.a) ?? []), { id: l.b, score: s }]);
    voisins.set(l.b, [...(voisins.get(l.b) ?? []), { id: l.a, score: s }]);
  }
  return oeuvres.map((o) => ({
    cle: cle.get(o.id)!,
    titre: o.titre,
    auteur: o.auteur,
    annee: o.annee,
    type: o.type,
    genre: o.genre,
    sousGenres: o.sousGenres ?? [],
    cover: o.cover,
    media: isPlayable(o.media) ? o.media : undefined,
    liees: (voisins.get(o.id) ?? [])
      .sort((a, b) => b.score - a.score)
      .slice(0, NB_LIEES)
      .map((v) => cle.get(v.id)!)
      .filter(Boolean),
  }));
}
