import fs from "node:fs";
import path from "node:path";
import { assemblerLiens, calculerCandidats, normTag, REGLAGES, type LienAuto } from "./liens-auto";
import { affinitesRacines, ancetres, creerFamilles, nomAffiche, nomRym, profondeur, type Familles } from "./familles";
import { isTypeOeuvre, type TypeOeuvre } from "./sections";
import { enListe, enTexte, lireTableur, type Cellule } from "./tableur";

export const CONNEXIONS_FILE = path.join(process.cwd(), "content", "connexions.json");
/**
 * Le tableur, s'il existe, remplace connexions.json : c'est lui que le site lit.
 * Onglets : « Œuvres » (une ligne par œuvre) et « Familles » (qui descend de qui).
 */
export const TABLEUR_FILE = path.join(process.cwd(), "content", "oeuvres.xlsx");
/**
 * Liste de référence des genres (tirée de RateYourMusic) : « Terme <tab> Parents ».
 * L'onglet Familles du tableur passe devant : une ligne là-bas remplace celle d'ici.
 */
export const GENRES_FILE = path.join(process.cwd(), "content", "genres-rym.tsv");

let cacheGenres: { mtime: number; lignes: [string, string[]][]; tous: Set<string> } | null = null;
function lireReference() {
  if (!fs.existsSync(GENRES_FILE)) {
    prevenir("content/genres-rym.tsv introuvable : sans la liste des genres RYM, les sphères de la carte et les familles ne peuvent pas être calculées.");
    return { lignes: [] as [string, string[]][], tous: new Set<string>() };
  }
  const mtime = fs.statSync(GENRES_FILE).mtimeMs;
  if (cacheGenres?.mtime !== mtime) {
    const lignes = fs
      .readFileSync(GENRES_FILE, "utf8")
      .split(/\r?\n/)
      .slice(1)
      .map((l) => l.split("\t"))
      .map(([t, p]) => [(t ?? "").trim(), (p ?? "").split(",").map((x) => x.trim()).filter(Boolean)] as [string, string[]]);
    // tous les noms connus, même ceux sans parent (grandes familles comme Hip Hop)
    const tous = new Set(lignes.flatMap(([t, p]) => [t, ...p]).map(normTag).filter(Boolean));
    cacheGenres = { mtime, lignes: lignes.filter(([t, p]) => t && p.length), tous };
  }
  return cacheGenres;
}
const genresDeReference = () => lireReference().lignes;

/** Familles finales : la liste de référence, puis tes lignes de l'onglet Familles par-dessus. */
function familles(aToi: [string, string[]][] = []): Familles {
  const m = creerFamilles(genresDeReference());
  for (const [t, p] of creerFamilles(aToi)) m.set(t, p); // ta ligne remplace celle de la référence
  return m;
}

/*
 * Format du fichier content/connexions.json :
 *
 * {
 *   "oeuvres": [
 *     {
 *       "id": "nas-illmatic",                 ← identifiant lisible, unique
 *       "titre": "Illmatic",
 *       "auteur": "Nas",
 *       "annee": 1994,
 *       "type": "album",
 *       "genre": "Hip-Hop",
 *       "sousGenres": ["Boom Bap", "Jazz Rap"],
 *       "liens": ["autre-id"],                ← facultatif : liens forcés à la main
 *       "pasDeLien": ["autre-id"]             ← facultatif : casse un lien automatique
 *     }
 *   ]
 * }
 *
 * Les connexions sont calculées automatiquement à partir des sous-genres
 * (réglages dans lib/liens-auto.ts). « liens » et « pasDeLien » n'ont besoin
 * d'être écrits que d'un seul côté.
 *
 * Dans le code, chaque œuvre reçoit en plus un numéro interne (id).
 */

export type Oeuvre = {
  /** Numéro interne, attribué au chargement. */
  id: number;
  /** Identifiant lisible utilisé dans le fichier et dans les adresses. */
  slug?: string;
  titre: string;
  auteur: string;
  annee?: number;
  type: TypeOeuvre;
  genre?: string;
  sousGenres?: string[];
  /**
   * Genres « parents » ajoutés en coulisse d'après l'onglet Familles
   * (Chicago Drill → Drill, Trap...). Servent aux liens, filtres et à la
   * recherche ; ne s'affichent pas dans la fiche.
   */
  parents?: string[];
  /** Grande famille RYM (Hip Hop, Electronic, R&B / Soul / Funk...) : la sphère de la carte. */
  racine?: string;
  /** Vrai si la colonne Genre était vide : le genre a été trouvé tout seul (il ne compte alors que comme famille). */
  genreAuto?: boolean;
  /** Penchant vers chaque grande famille, en % : [["Hip Hop", 71], ["R&B / Soul / Funk", 18]...] */
  affinites?: [string, number][];
  /** Genres secondaires et scènes RYM : comptent dans les connexions, pas affichés. */
  secondaires?: string[];
  /** Scènes RYM (West Coast Hip Hop...) : servent à comparer les régions dans les connexions. */
  scenes?: string[];
  /** Descripteurs RYM (dark, melancholic...) : comptent dans les connexions, pas affichés. */
  descripteurs?: string[];
  langues?: string[];
  producteurs?: string[];
  featurings?: string[];
  labels?: string[];
  cover?: string;
  /** Petite copie de la pochette (fabriquée par scripts/miniatures.mjs), si elle existe. */
  mini?: string;
  description?: string;
};

export type Lien = {
  a: number;
  b: number;
  /** true = calculé automatiquement, false/absent = écrit à la main. */
  auto?: boolean;
  score?: number;
  communs?: string[];
};

/** Ce qu'utilise le site : les œuvres et toutes leurs connexions. */
export type ConnexionsData = {
  oeuvres: Oeuvre[];
  liens: Lien[];
};

/** Ce qu'utilise l'admin : le contenu du fichier + les liens calculés. */
export type ConnexionsBrut = {
  oeuvres: Oeuvre[];
  /** Liens écrits à la main. */
  liens: Lien[];
  /** Liens automatiques cassés à la main. */
  exclus: Lien[];
};

export type ConnexionsAdmin = ConnexionsBrut & {
  /** Toutes les connexions finales (auto + manuelles − exclues). */
  finales: Lien[];
};

export function slugify(s: string) {
  return (
    s
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "oeuvre"
  );
}

function str(v: unknown) {
  return v === undefined || v === null || v === "" ? undefined : String(v);
}

function liste(v: unknown): string[] | undefined {
  if (typeof v === "string") v = v.split(",");
  if (!Array.isArray(v)) return undefined;
  const out = [...new Set(v.map((x) => String(x).trim()).filter(Boolean))];
  return out.length ? out : undefined;
}

const cle = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

/**
 * Pochette automatique : pas besoin d'écrire « cover » dans le fichier.
 * Il suffit de nommer l'image comme l'id de l'œuvre et de la poser dans
 * public/images/oeuvres (nas-illmatic.jpg pour l'id « nas-illmatic »).
 * Formats reconnus : jpg, jpeg, png, webp, avif, gif.
 */
const DOSSIER_POCHETTES = path.join(process.cwd(), "public", "images", "oeuvres");
const EXTENSIONS = ["jpg", "jpeg", "png", "webp", "avif", "gif"];

function pochettesPresentes(): Map<string, string> {
  const m = new Map<string, string>();
  if (!fs.existsSync(DOSSIER_POCHETTES)) return m;
  for (const f of fs.readdirSync(DOSSIER_POCHETTES)) {
    const point = f.lastIndexOf(".");
    if (point <= 0) continue;
    const nom = f.slice(0, point), ext = f.slice(point + 1).toLowerCase();
    const rang = EXTENSIONS.indexOf(ext);
    if (rang === -1) continue;
    // si deux formats existent pour le même id, on garde le premier de la liste
    const deja = m.get(nom);
    if (!deja || rang < EXTENSIONS.indexOf(deja.slice(deja.lastIndexOf(".") + 1).toLowerCase())) m.set(nom, f);
  }
  return m;
}

/**
 * Miniature d'une pochette : public/images/oeuvres/mini/<nom>.webp.
 * Absente (script pas lancé, image ailleurs que dans le dossier) = undefined,
 * et le site affiche la grande pochette.
 */
function miniaturesPresentes(): Set<string> {
  const d = path.join(DOSSIER_POCHETTES, "mini");
  return new Set(fs.existsSync(d) ? fs.readdirSync(d) : []);
}

function miniDe(cover: string | undefined, minis: Set<string>): string | undefined {
  const m = cover?.match(/^\/images\/oeuvres\/([^/]+)\.[a-z0-9]+$/i);
  if (!m) return undefined;
  const f = `${m[1]}.webp`;
  return minis.has(f) ? `/images/oeuvres/mini/${f}` : undefined;
}

function pochetteAuto(slug: string, presentes: Map<string, string>): string | undefined {
  const f = presentes.get(slug);
  return f ? `/images/oeuvres/${f}` : undefined;
}

/* ---------- Lecture du tableur ---------- */

const sansAccent = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** En-tête de colonne → champ. On regarde le début du titre : « Sous-genres (séparés par des virgules) » marche. */
const COLONNES: [string, string][] = [
  ["ne pas relier", "pasDeLien"],
  ["pas de lien", "pasDeLien"],
  ["relier", "liens"],
  ["liens", "liens"],
  ["sous genre", "sousGenres"],
  ["genres secondaires", "secondaires"],
  ["genre secondaire", "secondaires"],
  ["scene", "scenes"],
  ["descripteur", "descripteurs"],
  ["langue", "langues"],
  ["producteur", "producteurs"],
  ["featuring", "featurings"],
  ["label", "labels"],
  ["id", "id"],
  ["identifiant", "id"],
  ["titre", "titre"],
  ["artiste", "auteur"],
  ["auteur", "auteur"],
  ["annee", "annee"],
  ["type", "type"],
  ["univers", "type"],
  ["genre", "genre"],
  ["pochette", "cover"],
  ["cover", "cover"],
  ["description", "description"],
];
function champDe(entete: string) {
  const n = sansAccent(entete);
  // « Sous-genres », « Genres », « Liens »... : le pluriel passe aussi
  return COLONNES.find(([debut]) => [debut, debut + "s"].some((d) => n === d || n.startsWith(d + " ")))?.[1];
}

/** Colonnes qui contiennent une liste séparée par des virgules. */
const LISTES = new Set(["sousGenres", "secondaires", "scenes", "descripteurs", "langues", "producteurs", "featurings", "labels", "liens", "pasDeLien"]);

/** Ce qu'on accepte dans la colonne Type. */
const TYPES_TEXTE: Record<string, TypeOeuvre> = {
  album: "album", musique: "album", son: "album", ep: "album",
  film: "film", cinema: "film", serie: "film",
  jeu: "jeu", "jeu video": "jeu", jeux: "jeu",
  livre: "livre", bd: "livre",
  autre: "autre",
};

function onglet(onglets: Record<string, Cellule[][]>, ...noms: string[]) {
  const k = Object.keys(onglets).find((n) => noms.includes(sansAccent(n)));
  return k ? onglets[k]! : undefined;
}

/** Messages affichés une seule fois pendant npm run dev / build. */
const dejaDit = new Set<string>();
function prevenir(msg: string) {
  if (dejaDit.has(msg)) return;
  dejaDit.add(msg);
  console.warn(`[oeuvres.xlsx] ${msg}`);
}

type Source = { rawOeuvres: Record<string, unknown>[]; familles: Familles };
let cache: { mtime: number; source: Source } | null = null;

function lireDepuisTableur(): Source {
  // relu si le tableur OU la liste de référence a changé
  const mtime = fs.statSync(TABLEUR_FILE).mtimeMs + (fs.existsSync(GENRES_FILE) ? fs.statSync(GENRES_FILE).mtimeMs / 1e6 : 0);
  if (cache?.mtime === mtime) return cache.source;
  const onglets = lireTableur(TABLEUR_FILE);

  const lignes = onglet(onglets, "oeuvres", "œuvres") ?? Object.values(onglets)[0] ?? [];
  const entetes = (lignes[0] ?? []).map((c) => champDe(enTexte(c)));
  const rawOeuvres: Record<string, unknown>[] = [];
  lignes.slice(1).forEach((ligne, i) => {
    const r: Record<string, unknown> = {};
    entetes.forEach((champ, col) => {
      if (!champ) return;
      const c = ligne[col];
      if (LISTES.has(champ)) {
        const l = enListe(c);
        if (l.length) r[champ] = l;
      } else if (enTexte(c)) r[champ] = enTexte(c);
    });
    if (!Object.keys(r).length) return; // ligne vide
    const n = i + 2;
    if (!r.titre || !r.auteur) return prevenir(`ligne ${n} ignorée : il manque le titre ou l'artiste.`);
    const t = TYPES_TEXTE[sansAccent(String(r.type ?? ""))];
    if (!t) prevenir(`ligne ${n} (${r.titre}) : ${r.type ? `type « ${r.type} » inconnu` : "type vide"}, rangée dans « autre ». Types possibles : album, film, jeu, livre, autre.`);
    r.type = t ?? "autre";
    // id vide : fabriqué depuis l'artiste et le titre (nom de la pochette : nas-illmatic.jpg)
    if (!r.id) r.id = slugify(`${r.auteur} ${r.titre}`);
    rawOeuvres.push(r);
  });

  const fam = onglet(onglets, "familles", "famille") ?? [];
  const tesFamilles = familles(fam.slice(1).map((l) => [enTexte(l[0]), enListe(l[1])] as [string, string[]]).filter(([t, p]) => t && p.length));

  // Rappel : termes nouveaux, absents de l'onglet Familles (ni comme terme, ni comme parent)
  if (tesFamilles.size) {
    const connus = new Set([...lireReference().tous, ...tesFamilles.keys(), ...[...tesFamilles.values()].flat().map(normTag)]);
    const absents = new Set<string>();
    for (const r of rawOeuvres) for (const t of [String(r.genre ?? ""), ...((r.sousGenres as string[]) ?? [])]) if (t && !connus.has(normTag(t))) absents.add(t);
    if (absents.size) prevenir(`${absents.size} tag(s) qui ne sont pas des noms de genre RateYourMusic (vérifie l'orthographe, ou ajoute-les dans l'onglet Familles) : ${[...absents].sort().join(", ")}.`);
  }

  const source = { rawOeuvres, familles: tesFamilles };
  cache = { mtime, source };
  return source;
}

function lireSource(): Source {
  if (fs.existsSync(TABLEUR_FILE)) return lireDepuisTableur();
  if (!fs.existsSync(CONNEXIONS_FILE)) return { rawOeuvres: [], familles: familles() };
  const raw = JSON.parse(fs.readFileSync(CONNEXIONS_FILE, "utf8"));
  return { rawOeuvres: Array.isArray(raw.oeuvres) ? raw.oeuvres : [], familles: familles() };
}

/** Vrai si le site lit le tableur (l'admin passe alors en lecture seule). */
export const sourceEstTableur = () => fs.existsSync(TABLEUR_FILE);

export function readBrut(): ConnexionsBrut {
  const { rawOeuvres, familles: fams } = lireSource();

  // Chaque œuvre reçoit un numéro interne ; on garde la correspondance
  // avec l'identifiant écrit dans le fichier.
  const byKey = new Map<string, number>();
  const presentes = pochettesPresentes();
  const minis = miniaturesPresentes();
  const oeuvres: Oeuvre[] = rawOeuvres.map((r, i) => {
    const id = i + 1;
    let slug = str(r.id) ?? slugify(String(r.titre ?? `oeuvre-${id}`));
    if (byKey.has(slug)) {
      prevenir(`l'id « ${slug} » est utilisé deux fois, le second devient « ${slug}-${id} ».`);
      slug = `${slug}-${id}`;
    }
    byKey.set(slug, id);
    // genres principaux : les seuls affichés. Secondaires et scènes : seulement pour les connexions.
    const sousGenres = liste(r.sousGenres ?? r["sous-genres"] ?? r["sous-genre"] ?? r.sousGenre);
    const secondaires = liste([...(liste(r.secondaires) ?? []), ...(liste(r.scenes) ?? [])].filter((t) => !(sousGenres ?? []).includes(t)));
    // genre vide : la grande famille du premier sous-genre (Trap → Hip Hop)
    // grande famille : calculée sur tous les genres de l'album (voir affinitesRacines dans lib/familles.ts)
    const affinites = affinitesRacines([str(r.genre) ?? "", ...(sousGenres ?? [])].filter(Boolean), secondaires ?? [], fams);
    const genre = str(r.genre) ?? affinites[0]?.[0];
    // sphère de la carte : toujours une grande famille RYM, même si la colonne Genre dit autre chose
    const racine = affinites[0]?.[0] ?? genre;
    // genre trouvé tout seul : ce n'est qu'un ancêtre comme les autres, pas un genre écrit
    const genreAuto = !str(r.genre);
    const parents = ancetres([genreAuto ? "" : genre ?? "", ...(sousGenres ?? [])].filter(Boolean), fams);
    // « cover » écrit dans le fichier = prioritaire ; sinon l'image qui porte le nom de l'id
    const cover = str(r.cover) ?? pochetteAuto(slug, presentes);
    return {
      id,
      slug,
      titre: String(r.titre ?? ""),
      auteur: String(r.auteur ?? ""),
      annee: r.annee ? Number(r.annee) : undefined,
      type: isTypeOeuvre(r.type) ? r.type : "autre",
      // noms affichés (« R&B / Soul / Funk » → « Groove ») : le calcul ci-dessus a utilisé les noms RYM
      genre: genre && nomAffiche(genre),
      genreAuto: genreAuto || undefined,
      // Accepte aussi les variantes d'écriture du champ
      sousGenres: sousGenres?.map(nomAffiche),
      parents: parents.length ? parents.map(nomAffiche) : undefined,
      racine: racine && nomAffiche(racine),
      affinites: affinites.length ? affinites.map(([n, p]) => [nomAffiche(n), p] as [string, number]) : undefined,
      secondaires: secondaires?.map(nomAffiche),
      scenes: liste(r.scenes),
      descripteurs: liste(r.descripteurs),
      // « English, French » ou « French / Arabic »
      langues: liste((liste(r.langues) ?? []).flatMap((x) => x.split("/"))),
      producteurs: liste(r.producteurs),
      featurings: liste(r.featurings),
      labels: liste(r.labels),
      cover,
      mini: miniDe(cover, minis),
      // Un lien pas encore rempli (watch?v=) est ignoré : pas de bouton cassé
      description: str(r.description),
    };
  });

  const paires = (champ: string) => {
    const seen = new Set<string>();
    const out: Lien[] = [];
    rawOeuvres.forEach((r, i) => {
      const cibles = Array.isArray(r[champ]) ? (r[champ] as unknown[]) : [];
      for (const t of cibles) {
        const a = i + 1;
        const b = byKey.get(String(t));
        if (!b || a === b || seen.has(cle(a, b))) continue;
        seen.add(cle(a, b));
        out.push({ a, b });
      }
    });
    return out;
  };

  return { oeuvres, liens: paires("liens"), exclus: paires("pasDeLien") };
}

/**
 * Les univers ne se mélangent pas : un album n'est jamais relié à un film ou
 * à un jeu, même si leurs tags se ressemblent ou si le lien est écrit à la main.
 */
function memeType(brut: ConnexionsBrut) {
  const type = new Map(brut.oeuvres.map((o) => [o.id, o.type]));
  return (l: { a: number; b: number }) => type.get(l.a) === type.get(l.b);
}

/** Liens automatiques possibles, sans les liens cassés. */
function candidats(brut: ConnexionsBrut): LienAuto[] {
  const exclus = new Set(brut.exclus.map((l) => cle(l.a, l.b)));
  // Chaque univers est calculé à part : la rareté d'un tag se mesure parmi les
  // œuvres du même type, ajouter des films ne change donc rien aux liens des albums.
  const parType = new Map<string, Oeuvre[]>();
  for (const o of brut.oeuvres) parType.set(o.type, [...(parType.get(o.type) ?? []), o]);
  const fams = lireSource().familles;
  const memo = new Map<string, number | undefined>();
  const prof = (g: string) => {
    if (!memo.has(g)) memo.set(g, profondeur(nomRym(g), fams));
    return memo.get(g);
  };
  return [...parType.values()].flatMap((groupe) => calculerCandidats(groupe, REGLAGES, prof)).filter((l) => !exclus.has(cle(l.a, l.b)));
}

/** Connexions finales : automatiques + manuelles − cassées. */
export function assembler(brut: ConnexionsBrut): Lien[] {
  return assemblerLiens(candidats(brut), brut.liens.filter(memeType(brut)));
}

export function readConnexions(): ConnexionsData {
  const brut = readBrut();
  // Les infos qui ne servent qu'au calcul des liens ne partent pas dans les pages (moins lourd)
  // (les genres secondaires restent : ils s'affichent au survol sur la carte ; les scènes servent aux filtres des jeux)
  const oeuvres = brut.oeuvres.map(({ descripteurs, langues, producteurs, featurings, labels, ...o }) => o);
  return { oeuvres, liens: assembler(brut) };
}

export function readAdmin(): ConnexionsAdmin {
  const brut = readBrut();
  return { ...brut, finales: assembler(brut) };
}

/**
 * Modèle affiché en haut du fichier, avec tous les champs possibles.
 * Il est ignoré par le site et réécrit à chaque enregistrement de l'admin.
 */
const MODELE = {
  _info: "Modèle : copie ce bloc dans « oeuvres » pour ajouter une œuvre. Ce bloc-ci n'est pas affiché sur le site.",
  id: "identifiant-unique (obligatoire, minuscules et tirets, ex : nas-illmatic)",
  titre: "Titre de l'œuvre (obligatoire)",
  auteur: "Artiste, réalisateur, studio, écrivain... (obligatoire)",
  annee: 1994,
  type: "album | film | jeu | livre | autre (obligatoire)",
  genre: "Hip-Hop",
  sousGenres: ["Boom Bap", "Jazz Rap", "... : c'est ce qui crée les connexions automatiques"],
  cover: "facultatif : inutile si l'image s'appelle comme l'id (public/images/oeuvres/identifiant-unique.jpg)",
  description: "Une ou deux phrases, affichées dans la fiche de l'œuvre.",
  liens: ["facultatif : id d'une œuvre à relier de force"],
  pasDeLien: ["facultatif : id d'une œuvre à ne PAS relier"],
};

export function writeConnexions(data: ConnexionsBrut) {
  // Identifiants lisibles et uniques
  const used = new Set<string>();
  const slugOf = new Map<number, string>();
  for (const o of data.oeuvres) {
    const base = o.slug?.trim() ? slugify(o.slug) : slugify(`${o.auteur} ${o.titre}`);
    let s = base;
    let n = 2;
    while (used.has(s)) s = `${base}-${n++}`;
    used.add(s);
    slugOf.set(o.id, s);
  }
  const order = new Map(data.oeuvres.map((o, i) => [o.id, i]));

  // Un lien est écrit d'un seul côté (sur l'œuvre qui vient en premier)
  const versListe = (liens: Lien[]) => {
    const m = new Map<number, number[]>();
    for (const l of liens) {
      if (!slugOf.has(l.a) || !slugOf.has(l.b) || l.a === l.b) continue;
      const [x, y] = order.get(l.a)! < order.get(l.b)! ? [l.a, l.b] : [l.b, l.a];
      m.set(x, [...new Set([...(m.get(x) ?? []), y])]);
    }
    return m;
  };
  const manuels = versListe(data.liens);
  const exclus = versListe(data.exclus);

  const out = {
    _modele: MODELE,
    oeuvres: data.oeuvres.map((o) => {
      const r: Record<string, unknown> = { id: slugOf.get(o.id), titre: o.titre, auteur: o.auteur };
      if (o.annee) r.annee = o.annee;
      r.type = o.type;
      if (o.genre) r.genre = o.genre;
      if (o.sousGenres?.length) r.sousGenres = o.sousGenres;
      // la pochette n'est écrite que si elle ne porte pas le nom de l'id
      const auto = new RegExp(`^/images/oeuvres/${slugOf.get(o.id)}\\.(${EXTENSIONS.join("|")})$`, "i");
      if (o.cover && !auto.test(o.cover)) r.cover = o.cover;
      if (o.description) r.description = o.description;
      const l = manuels.get(o.id);
      if (l?.length) r.liens = l.map((id) => slugOf.get(id));
      const x = exclus.get(o.id);
      if (x?.length) r.pasDeLien = x.map((id) => slugOf.get(id));
      return r;
    }),
  };

  // Les listes tiennent sur une ligne pour rester lisibles.
  const json = JSON.stringify(out, null, 2).replace(/"(liens|pasDeLien|sousGenres)": \[([^\]]*)\]/g, (_m, k: string, inner: string) => {
    const items = inner
      .split(/,\s*\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    return `"${k}": [${items.join(", ")}]`;
  });
  fs.writeFileSync(CONNEXIONS_FILE, json + "\n");
}
