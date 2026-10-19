import type { DonneesParcours, OeuvreParcours } from "@/lib/jeux";

/*
 * Le Parcours : une suite d'épreuves sur les œuvres de Henassa.
 * Ici : les épreuves, leur tirage et leur barème. Rien d'affichage.
 *
 * Une manche est décrite par quelques clés d'œuvres seulement : en multijoueur,
 * l'hôte tire les manches et les envoie telles quelles à tout le monde.
 */

export type Epreuve = "mot" | "devine" | "chrono" | "chemin" | "grille" | "credits";

export const EPREUVES: { id: Epreuve; nom: string; echo: string; consigne: string }[] = [
  { id: "mot", nom: "Le mot", echo: "Mot", consigne: "Trouve le titre. La pochette se dévoile au fil du temps et à chaque essai." },
  { id: "devine", nom: "Devine l'œuvre", echo: "Devine", consigne: "Les indices s'ouvrent au fil du temps et à chaque essai raté : genre, sous-genres, connexions, année, pochette." },
  { id: "chrono", nom: "Chronologie", echo: "Chrono", consigne: "Remets ces œuvres dans l'ordre de sortie, de la plus ancienne à la plus récente." },
  { id: "chemin", nom: "Le chemin", echo: "Chemin", consigne: "Va de la première œuvre à la seconde en passant par les connexions de la Toile, en le moins d'étapes possible." },
  { id: "grille", nom: "La grille", echo: "Grille", consigne: "Une œuvre par case, qui coche la ligne et la colonne. Chaque œuvre ne sert qu'une fois." },
  { id: "credits", nom: "Les crédits", echo: "Crédits", consigne: "Retrouve l'œuvre à partir de ses producteurs, de ses invités et de son label." },
];
export const infoEpreuve = (e: Epreuve) => EPREUVES.find((x) => x.id === e)!;

/* ---------- Difficulté et temps ---------- */

export type Niveau = "facile" | "normal" | "difficile";
export const NIVEAUX: { id: Niveau; nom: string; resume: string }[] = [
  { id: "facile", nom: "Facile", resume: "Des indices qui arrivent vite, des lettres offertes, des chemins courts, des cases larges." },
  { id: "normal", nom: "Normal", resume: "Les indices arrivent aussi avec le temps, quelques lettres offertes en cours de manche." },
  { id: "difficile", nom: "Difficile", resume: "Un indice seulement à chaque erreur, rien d'offert, plus d'œuvres à classer." },
];

/** Ce que change la difficulté, épreuve par épreuve. */
export const REGLES = {
  facile: {
    mot: { essais: 8, lettresMax: 0.5, lettresDes: 0.15, nettete: [6, 44], netteteJusqua: 0.7, artiste: 0 },
    indices: { auDepart: 2, parTemps: true, essaisEnPlus: 2 },
    chrono: { nombre: 4, ecart: 5 },
    chemin: { distances: [[2], [3]], marge: 10, aideDes: 0 },
    grille: { reponsesMin: 5, essais: 15, comptes: true },
  },
  normal: {
    mot: { essais: 6, lettresMax: 0.3, lettresDes: 0.35, nettete: [5, 28], netteteJusqua: 1, artiste: 0.5 },
    indices: { auDepart: 1, parTemps: true, essaisEnPlus: 1 },
    chrono: { nombre: 5, ecart: 2 },
    chemin: { distances: [[3], [2]], marge: 8, aideDes: 0.5 },
    grille: { reponsesMin: 3, essais: 12, comptes: false },
  },
  difficile: {
    mot: { essais: 6, lettresMax: 0, lettresDes: 1, nettete: [0, 0], netteteJusqua: 1, artiste: -1 },
    indices: { auDepart: 1, parTemps: false, essaisEnPlus: 0 },
    chrono: { nombre: 6, ecart: 1 },
    chemin: { distances: [[3, 4], [2]], marge: 5, aideDes: -1 },
    grille: { reponsesMin: 2, essais: 10, comptes: false },
  },
} as const;

/** Temps proposés pour une manche (secondes). La grille a moitié plus de temps : il y a neuf cases. */
export const TEMPS_MANCHE = [45, 60, 90];
export const dureeManche = (e: Epreuve, base: number) => (e === "grille" ? Math.round(base * 1.5) : base);

/** Un critère de « La grille ». */
export type Critere = { k: "terme" | "scene" | "decennie"; v: string };
export type Manche =
  | { e: "mot"; cible: string }
  | { e: "devine"; cible: string }
  | { e: "credits"; cible: string }
  | { e: "chrono"; ordre: string[] }
  | { e: "chemin"; depart: string; arrivee: string; min: number }
  | { e: "grille"; lignes: Critere[]; colonnes: Critere[] };

/** Ce qu'une épreuve renvoie à la fin : un score sur 1000 et de quoi le raconter. */
export type Resultat = { score: number; resume: string };
export const SCORE_MAX = 1000;

/* ---------- Hasard (reproductible si besoin) ---------- */

export type Hasard = () => number;
/** Un tirage qui donne toujours la même suite pour la même graine. */
export function hasardGraine(graine: string): Hasard {
  let h = 1779033703 ^ graine.length;
  for (let i = 0; i < graine.length; i++) {
    h = Math.imul(h ^ graine.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const unParmi = <T>(l: T[], r: Hasard) => l[Math.floor(r() * l.length)]!;
export function melangerAvec<T>(l: T[], r: Hasard) {
  const a = [...l];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/* ---------- Outils sur les œuvres ---------- */

/** « Awaken, My Love! » → AWAKEN, MY LOVE! (sans accents) */
export function normaliserTitre(titre: string) {
  return titre
    .replace(/œ/gi, "oe")
    .replace(/æ/gi, "ae")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
export const estLettre = (c: string) => /[A-Z0-9]/.test(c);
export const lettresDe = (t: string) => [...normaliserTitre(t)].filter(estLettre);

export function sansAccents(s: string) {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** Genre, sous-genres et leurs familles : « Drill » couvre aussi « Chicago Drill ». */
export const termesDe = (o: OeuvreParcours) => [...new Set([...(o.genre ? [o.genre] : []), ...o.sousGenres, ...(o.parents ?? [])])];
export const decennie = (annee: number) => `${Math.floor(annee / 10) * 10}`;
export function nomCritere(c: Critere) {
  if (c.k === "decennie") return `Années ${+c.v >= 2000 ? c.v : c.v.slice(2)}`;
  return c.v;
}
export function respecte(o: OeuvreParcours, c: Critere) {
  if (c.k === "decennie") return !!o.annee && decennie(o.annee) === c.v;
  if (c.k === "scene") return (o.scenes ?? []).includes(c.v);
  return termesDe(o).includes(c.v);
}

/** Les noms d'artistes d'une œuvre : « Curren$y & The Alchemist » → curren$y, the alchemist. */
function artistesDe(auteur: string) {
  return auteur
    .split(/\s+(?:x|&|and|et|feat\.?|ft\.?|with)\s+|,\s*|\s*\/\s*/i)
    .map((s) => sansAccents(s.trim()))
    .filter(Boolean);
}
/** Les crédits utiles pour l'épreuve, sans l'artiste lui-même (sinon la réponse est donnée). */
export function creditsDe(o: OeuvreParcours) {
  const moi = artistesDe(o.auteur);
  // « M. Ali producer1 » : RYM colle parfois le rôle et un numéro au nom
  // le même nom, ou l'un dans l'autre pour les noms assez longs (« Kanye West » / « Ye » ne se recoupent pas)
  const pareil = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 5 && (a.includes(b) || b.includes(a)));
  const propre = (l?: string[]) => [...new Set((l ?? []).map((s) => s.replace(/\s+(producer|featured|feat|vocals?|guest)\s*\d+$/i, "").trim()).filter((s) => s && !moi.some((a) => pareil(sansAccents(s), a))))];
  return { producteurs: propre(o.producteurs), featurings: propre(o.featurings), labels: propre(o.labels).filter((l) => !/^(self-released|n\/a|none|aucun)$/i.test(l)) };
}

/* ---------- Ce qui rend une œuvre jouable dans chaque épreuve ---------- */

const MIN_LETTRES = 3, MAX_LETTRES = 18;
export const jouableMot = (o: OeuvreParcours) => {
  const n = lettresDe(o.titre).length;
  return n >= MIN_LETTRES && n <= MAX_LETTRES;
};
export const jouableDevine = (o: OeuvreParcours) => !!o.genre;
export const jouableCredits = (o: OeuvreParcours) => {
  const c = creditsDe(o);
  // au moins un producteur, et assez de noms pour que ce soit jouable
  return c.producteurs.length >= 1 && c.producteurs.length + c.featurings.length >= 3;
};

/* ---------- Le graphe de la Toile, pour « Le chemin » ---------- */

export type Graphe = { voisins: number[][]; index: Map<string, number> };
export function faireGraphe(d: DonneesParcours): Graphe {
  const voisins: number[][] = d.oeuvres.map(() => []);
  for (const [a, b] of d.liens) {
    voisins[a]!.push(b);
    voisins[b]!.push(a);
  }
  return { voisins, index: new Map(d.oeuvres.map((o, i) => [o.cle, i])) };
}
/** Distances depuis une œuvre (parcours en largeur). */
export function distancesDepuis(g: Graphe, depart: number) {
  const dist = new Map<number, number>([[depart, 0]]);
  const file = [depart];
  for (let i = 0; i < file.length; i++) {
    const n = file[i]!;
    for (const v of g.voisins[n]!) if (!dist.has(v)) {
      dist.set(v, dist.get(n)! + 1);
      file.push(v);
    }
  }
  return dist;
}

/* ---------- Le tirage des manches ---------- */

export type Contexte = {
  niveau: Niveau;
  d: DonneesParcours;
  g: Graphe;
  /** Les œuvres qui passent les filtres choisis. */
  vivier: OeuvreParcours[];
  r: Hasard;
  /** Œuvres déjà tombées dans la partie : on évite de les reprendre. */
  deja: Set<string>;
};

function cibleParmi(ctx: Contexte, ok: (o: OeuvreParcours) => boolean) {
  const l = ctx.vivier.filter((o) => ok(o) && !ctx.deja.has(o.cle));
  const l2 = l.length ? l : ctx.vivier.filter(ok);
  if (!l2.length) return null;
  const o = unParmi(l2, ctx.r);
  ctx.deja.add(o.cle);
  return o.cle;
}

function tirerChrono(ctx: Contexte): Manche | null {
  // des œuvres d'années toutes différentes, plus ou moins espacées selon la difficulté
  const { nombre, ecart } = REGLES[ctx.niveau].chrono;
  const parAnnee = new Map<number, OeuvreParcours[]>();
  for (const o of ctx.vivier) if (o.annee && !ctx.deja.has(o.cle)) parAnnee.set(o.annee, [...(parAnnee.get(o.annee) ?? []), o]);
  const annees = [...parAnnee.keys()];
  if (annees.length < nombre) return null;
  for (let essai = 0; essai < 120; essai++) {
    const choix = melangerAvec(annees, ctx.r).slice(0, nombre).sort((a, b) => a - b);
    if (choix.some((a, i) => i > 0 && a - choix[i - 1]! < ecart)) continue;
    const oeuvres = choix.map((a) => unParmi(parAnnee.get(a)!, ctx.r));
    oeuvres.forEach((o) => ctx.deja.add(o.cle));
    let ordre = melangerAvec(oeuvres.map((o) => o.cle), ctx.r);
    // jamais déjà dans le bon ordre
    if (ordre.every((c, i) => c === oeuvres[i]!.cle)) ordre = [...ordre.slice(1), ordre[0]!];
    return { e: "chrono", ordre };
  }
  return null;
}

function tirerChemin(ctx: Contexte): Manche | null {
  const departs = melangerAvec(ctx.vivier.filter((o) => !ctx.deja.has(o.cle)), ctx.r);
  const dansVivier = new Set(ctx.vivier.map((o) => o.cle));
  for (const o of departs.slice(0, 60)) {
    const i = ctx.g.index.get(o.cle);
    if (i === undefined || ctx.g.voisins[i]!.length < 2) continue;
    const dist = distancesDepuis(ctx.g, i);
    // une arrivée plus ou moins loin selon la difficulté, elle aussi dans les filtres
    for (const voulu of REGLES[ctx.niveau].chemin.distances as readonly (readonly number[])[]) {
      const loin = [...dist].filter(([n, k]) => voulu.includes(k) && dansVivier.has(ctx.d.oeuvres[n]!.cle) && !ctx.deja.has(ctx.d.oeuvres[n]!.cle));
      if (loin.length) {
        const [n, k] = unParmi(loin, ctx.r);
        const arrivee = ctx.d.oeuvres[n]!.cle;
        ctx.deja.add(o.cle);
        ctx.deja.add(arrivee);
        return { e: "chemin", depart: o.cle, arrivee, min: k };
      }
    }
  }
  return null;
}

/** Les œuvres de l'univers qui cochent les deux critères d'une case. */
export function reponsesCase(oeuvres: OeuvreParcours[], a: Critere, b: Critere) {
  return oeuvres.filter((o) => respecte(o, a) && respecte(o, b));
}

function tirerGrille(ctx: Contexte): Manche | null {
  const v = ctx.vivier;
  if (v.length < 20) return null;
  // les critères viennent du vivier (les filtres donnent le thème de la grille),
  // mais toute œuvre de l'univers peut remplir une case
  const univers = ctx.d.oeuvres.filter((o) => o.type === v[0]!.type);
  // les critères assez fréquents dans le vivier
  const compte = new Map<string, number>();
  const cle = (c: Critere) => `${c.k}:${c.v}`;
  for (const o of v) {
    for (const t of termesDe(o)) compte.set(`terme:${t}`, (compte.get(`terme:${t}`) ?? 0) + 1);
    for (const s of o.scenes ?? []) compte.set(`scene:${s}`, (compte.get(`scene:${s}`) ?? 0) + 1);
    if (o.annee) compte.set(`decennie:${decennie(o.annee)}`, (compte.get(`decennie:${decennie(o.annee)}`) ?? 0) + 1);
  }
  const total = v.length;
  const criteres: Critere[] = [...compte]
    // ni trop rare, ni presque tout le vivier (« Hip Hop » partout ne sert à rien)
    .filter(([, n]) => n >= 4 && n <= total * 0.75)
    .map(([k]) => ({ k: k.slice(0, k.indexOf(":")) as Critere["k"], v: k.slice(k.indexOf(":") + 1) }));
  const genres = criteres.filter((c) => c.k !== "decennie");
  const decs = criteres.filter((c) => c.k === "decennie");
  const ensemble = new Map(criteres.map((c) => [cle(c), new Set(univers.filter((o) => respecte(o, c)).map((o) => o.cle))]));
  // deux critères qui disent presque la même chose (Trap et Hip Hop) : case trop facile, on évite
  const communs = (a: Critere, b: Critere) => {
    const A = ensemble.get(cle(a))!, B = ensemble.get(cle(b))!;
    let n = 0;
    for (const x of A) if (B.has(x)) n++;
    return { n, inclus: n >= Math.min(A.size, B.size) * 0.85 };
  };
  const distincts = (l: Critere[]) => l.every((a, i) => l.every((b, j) => j <= i || !communs(a, b).inclus));
  // chaque case doit avoir assez de réponses possibles (plus en facile)
  const min = REGLES[ctx.niveau].grille.reponsesMin;
  const va = (l: Critere, c: Critere) => {
    const x = communs(l, c);
    return x.n >= min && !x.inclus;
  };
  // les lignes parmi les critères les plus présents, puis les colonnes qui marchent avec les trois
  const frequents = genres.sort((a, b) => ensemble.get(cle(b))!.size - ensemble.get(cle(a))!.size).slice(0, 40);
  for (let essai = 0; essai < 400; essai++) {
    const lignes = melangerAvec(frequents, ctx.r).slice(0, 3);
    if (lignes.length < 3) return null;
    if (!distincts(lignes)) continue;
    const avecDecennies = decs.length >= 3 && ctx.r() < 0.5;
    const candidates = (avecDecennies ? decs : genres.filter((c) => !lignes.some((l) => cle(l) === cle(c)))).filter((c) => lignes.every((l) => va(l, c)));
    const colonnes: Critere[] = [];
    for (const c of melangerAvec(candidates, ctx.r)) {
      if (colonnes.length < 3 && colonnes.every((x) => !communs(x, c).inclus)) colonnes.push(c);
    }
    if (colonnes.length < 3) continue;
    if (avecDecennies) colonnes.sort((a, b) => +a.v - +b.v);
    return { e: "grille", lignes, colonnes };
  }
  return null;
}

/** Tire une manche de l'épreuve demandée ; null si les filtres ne le permettent pas. */
export function tirerManche(e: Epreuve, ctx: Contexte): Manche | null {
  switch (e) {
    case "mot": {
      // en facile, des titres plus courts
      const max = ctx.niveau === "facile" ? 14 : ctx.niveau === "normal" ? 16 : 18;
      const c = cibleParmi(ctx, (o) => jouableMot(o) && lettresDe(o.titre).length <= max);
      return c ? { e, cible: c } : null;
    }
    case "devine": {
      const c = cibleParmi(ctx, jouableDevine);
      return c ? { e, cible: c } : null;
    }
    case "credits": {
      const c = cibleParmi(ctx, jouableCredits);
      return c ? { e, cible: c } : null;
    }
    case "chrono":
      return tirerChrono(ctx);
    case "chemin":
      return tirerChemin(ctx);
    case "grille":
      return tirerGrille(ctx);
  }
}

/** Les épreuves possibles avec ce vivier (essai à blanc, sans rien retenir). */
export function epreuvesPossibles(d: DonneesParcours, g: Graphe, vivier: OeuvreParcours[], niveau: Niveau) {
  const ok = new Set<Epreuve>();
  for (const { id } of EPREUVES) {
    const ctx: Contexte = { niveau, d, g, vivier, r: hasardGraine(`essai-${id}-${vivier.length}-${niveau}`), deja: new Set() };
    if (tirerManche(id, ctx)) ok.add(id);
  }
  return ok;
}

/**
 * Tire toute une partie : les épreuves choisies, mélangées et répétées jusqu'au
 * nombre de manches voulu (pour que la même ne revienne pas deux fois de suite).
 */
export function tirerPartie(d: DonneesParcours, g: Graphe, vivier: OeuvreParcours[], epreuves: Epreuve[], nombre: number, r: Hasard, niveau: Niveau = "normal", ordreFixe = false) {
  const ctx: Contexte = { niveau, d, g, vivier, r, deja: new Set() };
  const manches: Manche[] = [];
  let serie: Epreuve[] = [];
  let ratees = 0;
  while (manches.length < nombre && ratees < nombre * 3 + 6) {
    if (!serie.length) serie = ordreFixe ? [...epreuves] : melangerAvec(epreuves, r);
    // pas deux fois de suite la même épreuve
    if (!ordreFixe && serie.length > 1 && manches.length && serie[0] === manches[manches.length - 1]!.e) serie.push(serie.shift()!);
    const e = serie.shift()!;
    const m = tirerManche(e, ctx);
    if (m) manches.push(m);
    else ratees++;
    if (ordreFixe && !serie.length && manches.length < nombre) break;
  }
  return manches;
}

/* ---------- Barème ---------- */

/** Points d'une manche en multijoueur : la justesse, plus un bonus de rapidité (jusqu'à 25 %). */
export function pointsAvecTemps(score: number, restant: number, duree: number) {
  if (score <= 0) return 0;
  const vite = Math.max(0, Math.min(1, restant / Math.max(1, duree)));
  return Math.round(score * (0.75 + 0.25 * vite));
}

/** Pastille de partage : 🟩 très bien, 🟨 moyen, 🟧 un peu, 🟥 rien. */
export function pastille(score: number) {
  return score >= 800 ? "🟩" : score >= 450 ? "🟨" : score > 0 ? "🟧" : "🟥";
}
