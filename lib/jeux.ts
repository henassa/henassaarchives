import { readAdmin, readConnexions } from "./oeuvres";
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
  /** Genres parents ajoutés en coulisse (familles), pour les filtres. */
  parents?: string[];
  /** Scènes / mouvements (RYM), pour les filtres. */
  scenes?: string[];
  cover?: string;
  /** Petite copie de la pochette, pour les vignettes. */
  mini?: string;
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
    parents: o.parents,
    scenes: o.scenes,
    cover: o.cover,
    mini: o.mini,
    liees: (voisins.get(o.id) ?? [])
      .sort((a, b) => b.score - a.score)
      .slice(0, NB_LIEES)
      .map((v) => cle.get(v.id)!)
      .filter(Boolean),
  }));
}

/* ---------- Le Parcours : la suite d'épreuves ---------- */

/** Une œuvre telle que la reçoit le Parcours (avec les crédits, pour l'épreuve « Les crédits »). */
export type OeuvreParcours = OeuvreJeu & {
  scenes?: string[];
  producteurs?: string[];
  featurings?: string[];
  labels?: string[];
};

export type DonneesParcours = {
  oeuvres: OeuvreParcours[];
  /** Les connexions de la Toile, en positions dans « oeuvres » : [a, b]. Pour « Le chemin ». */
  liens: [number, number][];
};

export function donneesParcours(): DonneesParcours {
  const { oeuvres: brutes, finales } = readAdmin();
  const jeu = oeuvresPourJeux();
  const parCle = new Map(brutes.map((o) => [o.slug ?? String(o.id), o]));
  const oeuvres: OeuvreParcours[] = jeu.map((o) => {
    const b = parCle.get(o.cle);
    return { ...o, scenes: b?.scenes, producteurs: b?.producteurs, featurings: b?.featurings, labels: b?.labels };
  });
  const position = new Map(brutes.map((o) => [o.id, oeuvres.findIndex((x) => x.cle === (o.slug ?? String(o.id)))]));
  const liens: [number, number][] = [];
  for (const l of finales) {
    const a = position.get(l.a), b = position.get(l.b);
    if (a !== undefined && b !== undefined && a >= 0 && b >= 0) liens.push([a, b]);
  }
  return { oeuvres, liens };
}
