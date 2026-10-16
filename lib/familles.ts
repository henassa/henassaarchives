import { normTag } from "./liens-auto";

/*
 * Familles de genres : qui descend de qui.
 * Rempli dans l'onglet « Familles » du tableur :
 *
 *   Terme            Parents
 *   Chicago Drill    Drill, Midwest Hip Hop
 *   Drill            Trap
 *   Trap             Southern Hip Hop
 *
 * Une œuvre taguée « Chicago Drill » reçoit en coulisse Drill, Midwest Hip Hop,
 * Trap, Southern Hip Hop, Hip Hop... (les parents des parents aussi).
 * Ils servent aux connexions, aux filtres et à la recherche, mais ne
 * s'affichent pas dans la fiche : seuls les termes que tu as écrits s'y voient.
 */

export type Familles = Map<string, string[]>;

export function creerFamilles(lignes: [string, string[]][]): Familles {
  const m: Familles = new Map();
  for (const [terme, parents] of lignes) {
    const k = normTag(terme);
    if (!k) continue;
    m.set(k, [...new Set([...(m.get(k) ?? []), ...parents])]);
  }
  return m;
}

/**
 * Tous les ancêtres des termes donnés, du plus proche au plus lointain,
 * sans les termes eux-mêmes et sans doublon.
 */
export function ancetres(termes: string[], familles: Familles): string[] {
  const vus = new Set(termes.map(normTag));
  const out: string[] = [];
  let niveau = termes;
  // parcours niveau par niveau : les parents directs d'abord
  while (niveau.length) {
    const suivant: string[] = [];
    for (const t of niveau) {
      for (const p of familles.get(normTag(t)) ?? []) {
        const k = normTag(p);
        if (!k || vus.has(k)) continue; // vus = protège aussi des boucles (A parent de B parent de A)
        vus.add(k);
        out.push(p);
        suivant.push(p);
      }
    }
    niveau = suivant;
  }
  return out;
}

/** Rangements de RateYourMusic qui ne sont pas de vrais genres. */
const RANGEMENTS = new Set(["scenes movements", "regional music"]);

/**
 * Les grandes familles de RateYourMusic : celles affichées en tête de leur page
 * des genres. Ce sont les seules « racines » : les sphères de la carte et la
 * colonne Genre quand elle est vide.
 */
export const RACINES = [
  "Ambient", "Blues", "Classical Music", "Country", "Dance", "Easy Listening", "Electronic", "Experimental", "Folk",
  "Hip Hop", "Industrial / Noise", "Jazz", "Metal", "Musical Theatre and Entertainment", "New Age", "Pop", "Psychedelia",
  "Punk / Post-Punk / Hardcore", "R&B / Soul / Funk", "Reggae / Ska / Dancehall", "Rock", "Singer-Songwriter", "Spoken Word",
];
const RACINES_N = new Map(RACINES.map((r) => [normTag(r), r]));

/** Réglages du calcul de la grande famille (sphère de la carte). */
export const REGLAGES_RACINE = {
  /** Baisse du poids selon la position du genre : 1er = 100 %, 2e = 74 %, 3e = 59 %... */
  ordre: 0.35,
  /** Poids d'un genre secondaire ou d'une scène, par rapport à un genre principal. */
  poidsSecondaires: 0.5,
  /** Chaque cran de parenté en plus garde ce pourcentage (Drill → Trap → Hip Hop : 2 crans). */
  attenuation: 0.85,
};

/** Grandes familles atteintes par un genre, avec leur distance (0 = le genre est lui-même une racine). */
function racinesDe(g: string, familles: Familles): { racines: Map<string, number>; regional: boolean } {
  const racines = new Map<string, number>();
  let regional = false;
  const vus = new Set<string>();
  let niveau = [g];
  for (let d = 0; niveau.length && d < 12; d++) {
    const suivant: string[] = [];
    for (const t of niveau) {
      const k = normTag(t);
      if (vus.has(k)) continue;
      vus.add(k);
      const r = RACINES_N.get(k);
      if (r) {
        if (!racines.has(r)) racines.set(r, d);
        continue; // on ne remonte pas au-dessus d'une grande famille (Metal reste Metal, pas Rock)
      }
      for (const p of familles.get(k) ?? []) {
        if (normTag(p) === "regional music") regional = true;
        if (!RANGEMENTS.has(normTag(p))) suivant.push(p);
      }
    }
    niveau = suivant;
  }
  // scènes (West Coast Hip Hop, French Hip Hop...) : RYM ne les range que dans « Scenes & Movements »,
  // on lit alors leur nom. Seulement pour les vraies scènes : « New Jazz » n'est pas du jazz.
  const ps = familles.get(normTag(g)) ?? [];
  const scene = ps.length > 0 && ps.every((p) => RANGEMENTS.has(normTag(p)));
  if (!racines.size && scene) {
    const n = normTag(g);
    const r = RACINES.find((x) => n.endsWith(" " + normTag(x)));
    if (r) racines.set(r, 1);
  }
  return { racines, regional };
}

/**
 * À quel point une œuvre penche vers chaque grande famille, en pourcentage.
 * Chaque genre « vote » : plus il est haut dans la liste, plus sa voix compte ;
 * les genres secondaires et scènes votent moitié moins ; un genre lointain
 * (beaucoup de crans de parenté) vote un peu moins. Un genre qui mène à deux
 * familles (Trip Hop → Electronic et Hip Hop) partage sa voix entre elles.
 *
 * To Pimp a Butterfly → Hip Hop 71 %, R&B / Soul / Funk 18 %, Jazz 11 %...
 */
export function affinitesRacines(principaux: string[], secondaires: string[], familles: Familles, r = REGLAGES_RACINE): [string, number][] {
  const voix = new Map<string, number>();
  let regional = 0;
  const voter = (genres: string[], facteur: number, depart: number) =>
    genres.forEach((g, i) => {
      const poids = facteur / (1 + r.ordre * (depart + i));
      const { racines, regional: reg } = racinesDe(g, familles);
      if (!racines.size) {
        if (reg) regional += poids;
        return;
      }
      const parts = [...racines].map(([nom, d]) => [nom, r.attenuation ** d] as const);
      const total = parts.reduce((a, [, x]) => a + x, 0);
      for (const [nom, x] of parts) voix.set(nom, (voix.get(nom) ?? 0) + (poids * x) / total);
    });
  voter(principaux, 1, 0);
  voter(secondaires, r.poidsSecondaires, principaux.length);
  // les genres régionaux sans grande famille ne comptent que s'il n'y a rien d'autre
  if (!voix.size && regional) voix.set("Regional Music", regional);
  const somme = [...voix.values()].reduce((a, b) => a + b, 0);
  return [...voix]
    .map(([nom, v]) => [nom, Math.round((v / somme) * 100)] as [string, number])
    .sort((a, b) => b[1] - a[1] || RACINES.indexOf(a[0]) - RACINES.indexOf(b[0]));
}

/** La grande famille qui l'emporte (voir affinitesRacines). */
export function famillePrincipale(principaux: string[], familles: Familles, secondaires: string[] = []): string | undefined {
  return affinitesRacines(principaux, secondaires, familles)[0]?.[0];
}

/**
 * Noms affichés sur le site à la place des noms RYM. Le calcul utilise
 * toujours les noms RYM : ceci ne change que ce qu'on lit à l'écran.
 * Ajoute une ligne pour renommer une autre famille.
 */
export const NOMS_AFFICHES: Record<string, string> = {
  "R&B / Soul / Funk": "Groove",
};
const NOMS_N = new Map(Object.entries(NOMS_AFFICHES).map(([k, v]) => [normTag(k), v]));
/** Nom à afficher pour un genre. */
export const nomAffiche = (g: string) => NOMS_N.get(normTag(g)) ?? g;

/**
 * À combien de crans un genre est de sa grande famille : 0 = c'est une grande famille
 * (Hip Hop), 1 = juste en dessous (Hardcore Hip Hop, Trap), 2 et plus = précis
 * (Gangsta Rap, Chicago Drill). undefined = inconnu.
 */
export function profondeur(g: string, familles: Familles): number | undefined {
  const { racines } = racinesDe(g, familles);
  return racines.size ? Math.min(...racines.values()) : undefined;
}

/** Nom RYM d'un genre affiché (« Groove » → « R&B / Soul / Funk »). */
const RYM_N = new Map(Object.entries(NOMS_AFFICHES).map(([k, v]) => [normTag(v), k]));
export const nomRym = (g: string) => RYM_N.get(normTag(g)) ?? g;
