import type { Joueur } from "@/components/blindtest/salon/useSalon";
import { correspond, cibleTitre } from "./texte";

/* L'état d'une partie, partagé par l'hôte avec tous les joueurs, et les règles de points. */

export type Cible = "les-deux" | "titre" | "artiste";
export type Reglages = { manches: number; duree: number; cible: Cible; mode: "tape" };

export const REGLAGES_DEFAUT: Reglages = { manches: 10, duree: 30, cible: "les-deux", mode: "tape" };
export const CHOIX_MANCHES = [5, 10, 15, 20];
export const CHOIX_DUREE = [15, 20, 30];
export const MAX_JOUEURS = 10;
/** Temps du décompte 3-2-1 avant que le son parte. */
export const DECOMPTE = 3600;
/** Temps laissé à tout le monde pour charger l'extrait avant de lancer sans les retardataires. */
export const ATTENTE_CHARGEMENT = 8000;
/** Durée de la révélation avant la manche suivante. */
export const DUREE_REVELATION = 10_000;

export type Revele = { titre: string; artiste: string; album: string; pochette: string; lien: string; source: "deezer" | "itunes" };

/** Pour chaque joueur, le moment (en ms après le début du son) où il a trouvé le titre ou l'artiste. */
export type Trouves = Record<string, { titre?: number; artiste?: number }>;

export type Manche = {
  n: number;
  total: number;
  /** Adresse de l'extrait (ne dit rien du morceau). */
  extrait: string;
  /** Heure de l'hôte où le son démarre (0 tant que tout le monde charge). */
  depart: number;
  fin: number;
  charges: string[];
  trouves: Trouves;
  revele?: Revele;
  gains?: Record<string, number>;
  /** Heure de l'hôte du passage automatique à la manche suivante. */
  suite?: number;
};

export type EtatJeu = {
  joueurs: Joueur[];
  phase: "lobby" | "preparation" | "ecoute" | "revelation" | "fin";
  reglages: Reglages;
  nbPanier: number;
  prets: string[];
  scores: Record<string, number>;
  manche: Manche | null;
  /** Le prochain extrait, pour que chacun le télécharge en avance. */
  prochain: string;
  historique: (Revele & { n: number })[];
  avis: string;
};

export const etatVide = (): EtatJeu => ({
  joueurs: [],
  phase: "lobby",
  reglages: REGLAGES_DEFAUT,
  nbPanier: 0,
  prets: [],
  scores: {},
  manche: null,
  prochain: "",
  historique: [],
  avis: "",
});

/** Messages des joueurs vers l'hôte. */
export type MsgJeu = { t: "pret" } | { t: "charge"; n: number; ok: boolean } | { t: "reponse"; n: number; texte: string };
/** Message de l'hôte à un seul joueur : le verdict de sa réponse. */
export type Verdict = { t: "verdict"; n: number; titre: boolean; artiste: boolean; deja: boolean };

export const demandeTitre = (c: Cible) => c !== "artiste";
export const demandeArtiste = (c: Cible) => c !== "titre";

/** Ce qu'un joueur trouve avec une réponse, compte tenu de ce qu'il avait déjà. */
export function verifier(texte: string, morceau: { titre: string; artistes: string[] }, cible: Cible, deja: { titre?: number; artiste?: number }) {
  return {
    titre: demandeTitre(cible) && deja.titre === undefined && correspond(texte, cibleTitre(morceau.titre)),
    artiste: demandeArtiste(cible) && deja.artiste === undefined && correspond(texte, morceau.artistes),
  };
}

/** 100 points par élément trouvé, plus jusqu'à 50 points selon la rapidité. */
export const POINTS_BASE = 100;
export const BONUS_MAX = 50;

export function pointsPour(ms: number | undefined, dureeMs: number) {
  if (ms === undefined) return 0;
  const reste = Math.min(1, Math.max(0, 1 - ms / dureeMs));
  return POINTS_BASE + Math.round(BONUS_MAX * reste);
}

export function gainsManche(trouves: Trouves, dureeMs: number) {
  const g: Record<string, number> = {};
  for (const [id, t] of Object.entries(trouves)) g[id] = pointsPour(t.titre, dureeMs) + pointsPour(t.artiste, dureeMs);
  return g;
}

/** A-t-il tout trouvé ? */
export function complet(t: { titre?: number; artiste?: number } | undefined, cible: Cible) {
  return !!t && (!demandeTitre(cible) || t.titre !== undefined) && (!demandeArtiste(cible) || t.artiste !== undefined);
}

/** Classement : points, puis ordre d'arrivée dans la room. */
export function classement(e: Pick<EtatJeu, "joueurs" | "scores">) {
  const l = e.joueurs.map((j, i) => ({ ...j, points: e.scores[j.id] ?? 0, i }));
  l.sort((a, b) => b.points - a.points || a.i - b.i);
  // ex æquo : même rang
  let rang = 0;
  return l.map((j, k) => {
    if (k === 0 || j.points !== l[k - 1].points) rang = k + 1;
    return { ...j, rang };
  });
}
