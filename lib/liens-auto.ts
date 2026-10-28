/*
 * Connexions automatiques entre œuvres.
 *
 * Pour chaque paire d'œuvres d'un même univers, on additionne des points :
 *
 *  1. GENRES (le cœur du score)
 *     - genres principaux en commun (colonne Sous-genres) : poids plein ;
 *     - genres secondaires et scènes en commun : poids réduit ;
 *     - « parents » ajoutés en coulisse d'après les familles RYM : poids réduit.
 *     Un terme rare compte plus qu'un terme répandu, et le premier de la liste
 *     compte plus que les suivants.
 *  2. DESCRIPTEURS RYM (dark, melancholic, conscious...) en commun : petits points,
 *     plus forts si le descripteur est rare et bien classé chez les deux. Plafonnés.
 *  3. LANGUE commune : bonus, d'autant plus fort que la langue est rare dans le
 *     catalogue (deux albums en français ressortent si presque tout est en anglais).
 *  4. CRÉDITS : même artiste, producteur en commun, featuring en commun, même label.
 *
 * Les films et les jeux vidéo ont leurs propres réglages (REGLAGES_FILMS et
 * REGLAGES_JEUX, plus bas) : même calcul, avec leurs colonnes à eux.
 *
 * Les comparaisons se font au mot près, seuls les majuscules, accents et tirets
 * sont ignorés (« boom bap » = « Boom Bap »).
 *
 * Deux œuvres sont reliées si leur score atteint le SEUIL, et chaque œuvre
 * garde au plus ses maxParOeuvre liens les plus forts.
 */

export const REGLAGES = {
  /*
   * Score sur 100 environ (genres 50 + scènes 25 + descripteurs 15 + petits bonus). Genres, scènes et descripteurs mesurent à quel point les deux
   * profils se RESSEMBLENT (0 = rien en commun, max = profils identiques),
   * peu importe le nombre de tags : un album avec 12 genres n'est plus
   * avantagé par rapport à un album qui en a 3.
   */

  // --- 1. Genres (le cœur du score) ---
  /** Points pour deux albums aux genres identiques. */
  maxGenres: 50,
  /**
   * Baisse du poids selon la position dans la liste : poids = 1 / (1 + ordre × position).
   * Avec 0.35 : 1er = 100 %, 2e = 74 %, 3e = 59 %, 4e = 49 %, 5e = 42 %.
   */
  ordre: 0.35,
  /** Un terme rare peut compter jusqu'à ce multiple. */
  rareteMax: 3,
  /**
   * Force de la rareté. 1 = normale ; plus haut, les tags que tout le monde a
   * (Gangsta Rap dans un catalogue rap) comptent beaucoup moins que les tags
   * qui distinguent vraiment (Dirty South, Crunk, Chipmunk Soul).
   */
  rareteExposant: 2,
  /** Genres secondaires et scènes, par rapport à un genre principal. 0 = ignorés. */
  poidsSecondaires: 0.8,
  /** Genres « parents » (familles RYM), par rapport à un genre principal. 0 = ignorés. */
  poidsParents: 0.5,
  /**
   * Un genre large dit moins de choses qu'un genre précis. Poids selon la distance
   * à la grande famille : [grande famille, 1 cran, 2 crans et plus].
   * Hip Hop ×0.4, Hardcore Hip Hop ×0.7, Gangsta Rap ou Chicago Drill ×1.
   */
  precision: [0.4, 0.7, 1] as number[],

  // --- 2. Descripteurs ---
  /** Points pour deux albums aux descripteurs identiques. */
  maxDescripteurs: 15,
  /** Baisse selon le rang du descripteur (RYM les classe par votes). 0.05 : le 20e compte moitié. */
  ordreDescripteurs: 0.05,
  /** Descripteurs trop vagues pour rapprocher deux albums : ignorés. */
  descripteursIgnores: ["male vocalist", "female vocalist", "androgynous vocals", "vocal group", "rhythmic", "melodic", "sampling", "boastful"] as string[],

  // --- Scènes et mouvements ---
  /**
   * Points pour deux albums aux scènes identiques (West Coast Hip Hop, Memphis Rap,
   * French Hip Hop...). Une scène dit beaucoup : un son, une ville, une époque.
   * Elles sont comptées ici, à part des genres, avec leur propre poids.
   */
  maxScenes: 25,
  /**
   * Deux albums rattachés à des scènes différentes et sans scène commune
   * (Southern Hip Hop contre West Coast Hip Hop) : le score est multiplié par ceci.
   * 1 = pas d'effet.
   */
  scenesDifferentes: 0.75,

  // --- Époque ---
  /**
   * Deux albums éloignés dans le temps se ressemblent moins, même avec les mêmes tags
   * (DMX 1998 et Chief Keef 2021 sont tous les deux « Hardcore Hip Hop »).
   * Écart toléré sans perte, en années :
   */
  epoqueTolerance: 4,
  /** Puis le score perd ce pourcentage par année d'écart en plus... */
  epoquePerteParAn: 0.03,
  /** ...sans descendre sous ce multiple (un classique peut rester relié à un album récent). */
  epoqueMin: 0.5,

  // --- 3. Langue ---
  /**
   * Bonus pour une langue commune RARE dans le catalogue. Une langue que presque
   * tout le monde partage (l'anglais) ne rapporte quasiment rien ; deux albums
   * en français au milieu d'albums anglais gagnent jusqu'à ce bonus.
   */
  bonusLangue: 6,

  // --- 4. Crédits ---
  /** Bonus si même artiste / auteur. 0 = aucun bonus (leurs genres les rapprochent déjà assez). */
  bonusArtiste: 0,
  /**
   * Au plus ce nombre de liens vers d'autres albums du MÊME artiste, par album.
   * Sinon un artiste à grosse discographie remplit tous ses liens avec lui-même.
   */
  maxMemeArtiste: 2,
  /**
   * L'artiste du projet ne compte pas comme « producteur en commun » ou
   * « featuring en commun » entre ses propres albums (il se produit souvent
   * lui-même). false = l'artiste compte comme les autres.
   */
  ignorerArtisteDansCredits: true,
  /** Par producteur en commun (2 au plus comptés). */
  bonusProducteur: 4,
  /** Par featuring en commun (3 au plus comptés). */
  bonusFeaturing: 2,
  /** Même label, multiplié par la rareté du label (un gros label compte peu). */
  bonusLabel: 1,

  // --- Seuil ---
  /** Score minimum (sur 100) pour créer un lien. Monte-le pour moins de liens, baisse-le pour plus. */
  seuil: 80,
  /**
   * Un lien n'est gardé que s'il vaut au moins ce pourcentage du MEILLEUR lien de
   * chacun des deux albums. Dans un coin dense (le gangsta rap), un album ne garde
   * que ses vrais proches ; un album de niche garde ses liens même plus faibles.
   * 0 = désactivé.
   */
  relatif: 0,
  /**
   * Filet de sécurité : un album qui n'a aucun lien au-dessus du seuil garde quand même
   * son meilleur voisin, si celui-ci dépasse seuilSecours. Utile pour les niches
   * (un seul album d'un style). En dessous, l'album reste seul : rien ne lui ressemble vraiment.
   */
  seuilSecours: 80,
  /**
   * Nombre max de liens automatiques par œuvre : on garde les plus forts.
   * Garde la carte lisible quand le catalogue grossit. null = illimité.
   * Les liens ajoutés à la main ne comptent pas dans ce plafond.
   */
  maxParOeuvre: 16 as number | null,

  /** Mots affichés dans l'admin devant chaque point commun. */
  libelles: { scene: "scène", prod: "prod", feat: "feat", label: "label", memeArtiste: "même artiste" },
};

/**
 * Les films et les jeux prennent le SEUIL, le filet de sécurité (seuilSecours), la règle
 * « relatif » et le nombre max de liens par œuvre (maxParOeuvre) de la musique, plus haut :
 * change-les là-haut, ça change pour les trois univers.
 *
 * Leurs points (genres, crédits…) sont réglés sur une échelle où le seuil vaudrait « base » :
 * ils sont agrandis pour que le seuil de la musique ait le même sens chez eux.
 */
const POINTS = ["maxGenres", "maxDescripteurs", "maxScenes", "bonusLangue", "bonusArtiste", "bonusProducteur", "bonusFeaturing", "bonusLabel"] as const;
function memeSeuilQueLaMusique(r: typeof REGLAGES, base: number): typeof REGLAGES {
  const k = REGLAGES.seuil / base;
  const out = { ...r };
  for (const p of POINTS) out[p] = r[p] * k;
  return { ...out, seuil: REGLAGES.seuil, seuilSecours: REGLAGES.seuilSecours, relatif: REGLAGES.relatif, maxParOeuvre: REGLAGES.maxParOeuvre };
}

/*
 * Réglages des FILMS (onglet « Films » du tableur).
 * Le même calcul que pour les albums, avec les colonnes des films à la place :
 *   genres        ← Genres (ceux de TMDB et les tiens)
 *   descripteurs  ← Descripteurs (les tiens)
 *   scènes        ← Pays
 *   producteurs   ← l'équipe : Scénario, Musique, Image, Montage
 *   featurings    ← Casting
 *   labels        ← Studios
 *   artiste       ← Réalisation
 * Les genres de cinéma sont larges (Drame, Thriller…) : ce sont surtout les
 * personnes en commun qui relient deux films.
 */
export const REGLAGES_FILMS: typeof REGLAGES = memeSeuilQueLaMusique({
  ...REGLAGES,
  // genres : moins de poids, et pas de familles RYM
  maxGenres: 30,
  rareteExposant: 1,
  poidsParents: 0,
  precision: [1, 1, 1],
  // tes descripteurs à toi
  maxDescripteurs: 20,
  ordreDescripteurs: 0.1,
  descripteursIgnores: [],
  // pays : petit bonus, et deux pays différents n'éloignent pas deux films
  maxScenes: 6,
  scenesDifferentes: 1,
  // époque : un peu plus tolérant que pour la musique
  epoqueTolerance: 6,
  epoquePerteParAn: 0.02,
  epoqueMin: 0.6,
  bonusLangue: 8,
  // même réalisateur : gros bonus (au plus 3 liens vers ses autres films)
  bonusArtiste: 25,
  maxMemeArtiste: 3,
  // un réalisateur qui écrit ou compose pour un autre film, ça compte (Ladj Ly scénariste d'Athena)
  ignorerArtisteDansCredits: false,
  /** Par membre de l'équipe en commun : scénario, musique, image, montage (2 au plus comptés). */
  bonusProducteur: 12,
  /** Par acteur en commun (3 au plus comptés). */
  bonusFeaturing: 10,
  /** Même studio, multiplié par sa rareté. */
  bonusLabel: 3,
  libelles: { scene: "pays", prod: "équipe", feat: "casting", label: "studio", memeArtiste: "même réalisateur" },
  // points ci-dessus pensés pour un seuil de 42 (agrandis pour le seuil de la musique)
}, 42);

/*
 * Réglages des JEUX VIDÉO (onglet « Jeux » du tableur, rempli depuis IGDB).
 * Même calcul, avec les colonnes des jeux :
 *   genres        ← Genres (et les Thèmes, avec un peu moins de poids)
 *   descripteurs  ← Descripteurs (les tiens), Perspective, Modes et Mots-clés
 *   scènes        ← Série (Zelda, Dark Souls…) : un lien fort
 *   labels        ← Éditeur
 *   producteurs   ← Moteur (petit bonus)
 *   artiste       ← Studio (développeur)
 */
export const REGLAGES_JEUX: typeof REGLAGES = memeSeuilQueLaMusique({
  ...REGLAGES,
  maxGenres: 30,
  rareteExposant: 1,
  poidsSecondaires: 0.6,
  poidsParents: 0,
  precision: [1, 1, 1],
  maxDescripteurs: 25,
  ordreDescripteurs: 0.05,
  descripteursIgnores: ["single player"],
  // même série : gros bonus, et deux séries différentes n'éloignent pas deux jeux
  maxScenes: 35,
  scenesDifferentes: 1,
  epoqueTolerance: 5,
  epoquePerteParAn: 0.02,
  epoqueMin: 0.6,
  bonusLangue: 0,
  // même studio : gros bonus (au plus 3 liens vers ses autres jeux)
  bonusArtiste: 22,
  maxMemeArtiste: 3,
  /** Même moteur de jeu (2 au plus comptés). */
  bonusProducteur: 3,
  bonusFeaturing: 0,
  /** Même éditeur, multiplié par sa rareté (un gros éditeur compte peu). */
  bonusLabel: 6,
  libelles: { scene: "série", prod: "moteur", feat: "", label: "éditeur", memeArtiste: "même studio" },
  // points ci-dessus pensés pour un seuil de 40 (agrandis pour le seuil de la musique)
}, 40);

export type OeuvreTags = {
  id: number;
  auteur: string;
  annee?: number;
  genre?: string;
  /** Genre trouvé tout seul (colonne vide) : il ne compte pas comme genre principal. */
  genreAuto?: boolean;
  /** Genres principaux. */
  sousGenres?: string[];
  /** Genres secondaires et scènes. */
  secondaires?: string[];
  /** Scènes seules (pour comparer les régions). */
  scenes?: string[];
  /** Ancêtres ajoutés d'après les familles. */
  parents?: string[];
  descripteurs?: string[];
  langues?: string[];
  producteurs?: string[];
  featurings?: string[];
  labels?: string[];
};

export type LienAuto = {
  a: number;
  b: number;
  score: number;
  /** Ce que les deux œuvres ont en commun (pour l'admin). */
  communs: string[];
  /** Les deux œuvres sont du même artiste. */
  memeArtiste?: boolean;
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

/** « Freddie Gibbs & The Alchemist » → ["freddie gibbs", "the alchemist"] */
const memoArtistes = new Map<string, string[]>();
function artistesDe(auteur: string) {
  if (!memoArtistes.has(auteur)) memoArtistes.set(auteur, auteur.split(/\s*(?:&|,|\/| x | feat\.? | and )\s*/i).map(normTag).filter(Boolean));
  return memoArtistes.get(auteur)!;
}

/** Labels qui veulent dire « sans label » sur RYM. */
const PAS_DE_LABEL = new Set(["n a", "na", "self released", "no label", "none", "independent", "unknown"]);

/** Toutes les paires d'œuvres dont le score atteint le seuil. */
export function calculerCandidats(oeuvres: OeuvreTags[], r = REGLAGES, profondeurDe?: (genre: string) => number | undefined): LienAuto[] {
  const N = oeuvres.length;
  if (N < 2) return [];

  type Tag = { label: string; poids: number };
  /** Rareté : log2(1 + N / nombre d'œuvres qui ont ce terme), plafonnée. */
  const rareteDe = (freq: Map<string, number>) => (k: string) => Math.min(r.rareteMax, Math.log2(1 + N / (freq.get(k) ?? N))) ** r.rareteExposant;
  /** Une famille de termes (genres, descripteurs, langues...) : terme → poids, et fréquences. */
  const famille = (termes: (o: OeuvreTags) => [string, number][]) => {
    const parOeuvre = new Map<number, Map<string, Tag>>();
    const freq = new Map<string, number>();
    for (const o of oeuvres) {
      const m = new Map<string, Tag>();
      for (const [t, poids] of termes(o)) {
        const k = normTag(t);
        if (k && !m.has(k) && poids > 0) m.set(k, { label: t.trim(), poids });
      }
      parOeuvre.set(o.id, m);
      for (const k of m.keys()) freq.set(k, (freq.get(k) ?? 0) + 1);
    }
    return { parOeuvre, rarete: rareteDe(freq) };
  };
  const rang = (liste: string[] | undefined, pente: number, facteur = 1) => (liste ?? []).map((t, i) => [t, facteur / (1 + pente * i)] as [string, number]);

  // 1. Genres : principaux, puis secondaires/scènes, puis parents (la position continue)
  // précision : un genre large (Hip Hop, Hardcore Hip Hop) pèse moins qu'un genre précis
  const precision = (t: string) => {
    const d = profondeurDe?.(t);
    return d === undefined ? 1 : r.precision[Math.min(d, r.precision.length - 1)] ?? 1;
  };
  const genres = famille((o) => {
    const l: [string, number][] = [];
    const ajouter = (ts: string[], facteur: number) => ts.forEach((t) => l.push([t, (facteur * precision(t)) / (1 + r.ordre * l.length)]));
    // le genre écrit à la main compte comme 1er genre principal ; trouvé tout seul, il est déjà dans les parents
    ajouter([o.genreAuto ? "" : o.genre ?? "", ...(o.sousGenres ?? [])].filter(Boolean), 1);
    // les scènes ont leur propre critère : on ne les compte pas deux fois dans les genres
    const sc = new Set((o.scenes ?? []).map(normTag));
    ajouter((o.secondaires ?? []).filter((t) => !sc.has(normTag(t))), r.poidsSecondaires);
    ajouter(o.parents ?? [], r.poidsParents);
    return l;
  });
  const scenes = famille((o) => rang(o.scenes, r.ordre));
  const ignores = new Set(r.descripteursIgnores.map(normTag));
  const descr = famille((o) => rang((o.descripteurs ?? []).filter((d) => !ignores.has(normTag(d))), r.ordreDescripteurs));
  const langues = famille((o) => rang(o.langues, 0));
  const labels = famille((o) => rang(o.labels, 0));
  const prods = famille((o) => rang(o.producteurs, 0));
  const feats = famille((o) => rang(o.featurings, 0));

  /**
   * Ressemblance de deux profils (cosinus) : chaque terme pèse sa position × sa rareté.
   * 1 = mêmes termes avec les mêmes poids, 0 = rien en commun.
   */
  const normes = new Map<object, Map<number, number>>();
  const norme = (f: ReturnType<typeof famille>, id: number) => {
    if (!normes.has(f)) normes.set(f, new Map());
    const m = normes.get(f)!;
    if (!m.has(id)) {
      let n = 0;
      for (const [k, x] of f.parOeuvre.get(id)!) n += (x.poids * f.rarete(k)) ** 2;
      m.set(id, Math.sqrt(n));
    }
    return m.get(id)!;
  };
  const ressemblance = (f: ReturnType<typeof famille>, a: number, b: number) => {
    const ta = f.parOeuvre.get(a)!, tb = f.parOeuvre.get(b)!;
    let dot = 0;
    const communs: { label: string; part: number }[] = [];
    for (const [k, x] of ta) {
      const y = tb.get(k);
      if (!y) continue;
      const v = x.poids * y.poids * f.rarete(k) ** 2;
      dot += v;
      communs.push({ label: x.label, part: v });
    }
    const n = norme(f, a) * norme(f, b);
    return { sim: n ? dot / n : 0, communs: communs.sort((p, q) => q.part - p.part).map((c) => c.label) };
  };

  /** Termes en commun entre a et b dans une famille : [libellé, points de base]. */
  const communsDe = (f: ReturnType<typeof famille>, a: number, b: number) => {
    const ta = f.parOeuvre.get(a)!, tb = f.parOeuvre.get(b)!;
    const [petit, grand] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
    const out: { label: string; k: string; poids: number }[] = [];
    for (const [k, x] of petit) {
      const y = grand.get(k);
      if (y) out.push({ label: x.label, k, poids: Math.sqrt(x.poids * y.poids) });
    }
    return out;
  };

  const out: LienAuto[] = [];
  for (let i = 0; i < N; i++) {
    const a = oeuvres[i]!;
    for (let j = i + 1; j < N; j++) {
      const b = oeuvres[j]!;
      let score = 0;
      const communs: string[] = [];

      // Scènes en commun : un critère fort, à part
      const sc = ressemblance(scenes, a.id, b.id);
      if (sc.sim > 0) {
        score += r.maxScenes * sc.sim;
        communs.push(...sc.communs.map((c) => `${r.libelles.scene} : ${c}`));
      }

      const g = ressemblance(genres, a.id, b.id);
      score += r.maxGenres * g.sim;
      communs.push(...g.communs);

      const ds = ressemblance(descr, a.id, b.id);
      score += r.maxDescripteurs * ds.sim;
      communs.push(...ds.communs.slice(0, 5).map((c) => `« ${c} »`));

      // langue : seulement ce qu'elle a de rare (rareté 1 ≈ partagée par tous → 0 point)
      for (const c of communsDe(langues, a.id, b.id)) {
        const bonus = (r.bonusLangue * Math.max(0, langues.rarete(c.k) - 1)) / (r.rareteMax - 1);
        if (bonus < 0.5) continue;
        score += bonus;
        communs.push(`langue : ${c.label}`);
      }
      // l'artiste lui-même ne compte pas dans les crédits communs (voir ignorerArtisteDansCredits)
      const artistes = r.ignorerArtisteDansCredits ? [...artistesDe(a.auteur), ...artistesDe(b.auteur)] : [];
      const pasArtiste = (c: { k: string }) => !artistes.includes(c.k);
      for (const c of communsDe(prods, a.id, b.id).filter(pasArtiste).slice(0, 2)) {
        score += r.bonusProducteur;
        communs.push(`${r.libelles.prod} : ${c.label}`);
      }
      for (const c of communsDe(feats, a.id, b.id).filter(pasArtiste).slice(0, 3)) {
        score += r.bonusFeaturing;
        communs.push(`${r.libelles.feat} : ${c.label}`);
      }
      // « n/a » ou « self-released » sur RYM = pas de label : ce n'est pas un point commun
      for (const c of communsDe(labels, a.id, b.id).filter((c) => !PAS_DE_LABEL.has(c.k)).slice(0, 1)) {
        score += r.bonusLabel * labels.rarete(c.k);
        communs.push(`${r.libelles.label} : ${c.label}`);
      }

      // Scènes : deux régions différentes, sans scène commune, éloignent les albums
      if (a.scenes?.length && b.scenes?.length) {
        const sb = new Set(b.scenes.map(normTag));
        if (!a.scenes.some((x) => sb.has(normTag(x)))) {
          score *= r.scenesDifferentes;
          if (r.scenesDifferentes < 1) communs.push("scènes différentes");
        }
      }

      // Époque : au-delà de la tolérance, le score baisse avec l'écart (jusqu'à epoqueMin)
      if (a.annee && b.annee) {
        const ecart = Math.abs(a.annee - b.annee) - r.epoqueTolerance;
        if (ecart > 0) score *= Math.max(r.epoqueMin, 1 - r.epoquePerteParAn * ecart);
      }

      // Même artiste
      // « Chief Keef » et « Chief Keef & Zaytoven » comptent comme le même artiste
      const memeArtiste = !!a.auteur && (normTag(a.auteur) === normTag(b.auteur) || artistesDe(a.auteur).some((x) => artistesDe(b.auteur).includes(x)));
      if (memeArtiste) {
        score += r.bonusArtiste;
        communs.push(r.libelles.memeArtiste);
      }

      if (score >= r.seuil) {
        out.push({ a: a.id, b: b.id, score: Math.round(score * 10) / 10, communs, memeArtiste: memeArtiste || undefined });
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
  // meilleur score de chaque album avec un AUTRE artiste (pour la règle « relatif ») :
  // ses propres albums se ressemblent toujours beaucoup, ils ne doivent pas placer la barre
  const meilleur = new Map<number, number>();
  for (const l of candidats) {
    if (l.memeArtiste) continue;
    if (l.score > (meilleur.get(l.a) ?? 0)) meilleur.set(l.a, l.score);
    if (l.score > (meilleur.get(l.b) ?? 0)) meilleur.set(l.b, l.score);
  }
  const nb = new Map<number, number>();
  const nbArtiste = new Map<number, number>();
  const out: LienAuto[] = [];
  for (const l of [...candidats].sort((x, y) => y.score - x.score)) {
    if (l.score < seuil) break;
    if ((nb.get(l.a) ?? 0) >= max || (nb.get(l.b) ?? 0) >= max) continue;
    if (l.score < r.relatif * (meilleur.get(l.a) ?? 0) || l.score < r.relatif * (meilleur.get(l.b) ?? 0)) continue;
    if (l.memeArtiste) {
      if ((nbArtiste.get(l.a) ?? 0) >= r.maxMemeArtiste || (nbArtiste.get(l.b) ?? 0) >= r.maxMemeArtiste) continue;
      nbArtiste.set(l.a, (nbArtiste.get(l.a) ?? 0) + 1);
      nbArtiste.set(l.b, (nbArtiste.get(l.b) ?? 0) + 1);
    }
    nb.set(l.a, (nb.get(l.a) ?? 0) + 1);
    nb.set(l.b, (nb.get(l.b) ?? 0) + 1);
    out.push(l);
  }
  // filet de sécurité : les albums restés seuls gardent leur meilleur voisin s'il est assez proche
  const tries = [...candidats].sort((x, y) => y.score - x.score);
  for (const l of tries) {
    if (l.score < r.seuilSecours) break;
    if ((nb.get(l.a) ?? 0) > 0 && (nb.get(l.b) ?? 0) > 0) continue;
    if (out.includes(l)) continue;
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
