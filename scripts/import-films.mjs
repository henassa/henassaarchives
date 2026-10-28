/*
 * Import des films depuis TMDB, directement dans content/oeuvres.xlsx (onglet « Films »).
 *
 * Tu écris le titre et l'année d'un film dans l'onglet Films, tu lances :
 *     node scripts/import-films.mjs
 * et le script remplit toutes les cases VIDES de la ligne : réalisation, casting,
 * scénario, musique, image, montage, studios, pays, langue, durée, date, genres,
 * synopsis… Il télécharge aussi l'affiche dans public/images/oeuvres (nommée
 * comme l'id du film, comme tes pochettes d'albums).
 *
 * Il ne remplace jamais une case déjà remplie : tu peux corriger à la main et relancer.
 *
 * Options :
 *     --essai     montre ce qui serait rempli, sans rien écrire
 *     --titres    remplace les titres déjà écrits par le titre américain / anglais
 *     --affiches  retélécharge les affiches (version américaine / anglaise), même si elles existent
 *     --tout      revérifie aussi les films déjà importés (sinon ils sont sautés,
 *                 pour aller vite : un film est « importé » quand sa colonne TMDB est remplie)
 *
 * Clé TMDB : dans .env.local, une de ces deux lignes (gratuit sur themoviedb.org) :
 *     TMDB_TOKEN=eyJ...        (« jeton d'accès en lecture », le plus long)
 *     TMDB_API_KEY=abc123...   (« clé d'API », la courte)
 *
 * Avant d'écrire, une copie du tableur est gardée dans content/oeuvres.avant-import.xlsx.
 * Ferme le fichier dans Excel avant de lancer le script.
 *
 * Ce produit utilise l'API TMDB mais n'est ni approuvé ni certifié par TMDB.
 */

import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";

const RACINE = process.cwd();
const TABLEUR = path.join(RACINE, "content", "oeuvres.xlsx");
const SAUVEGARDE = path.join(RACINE, "content", "oeuvres.avant-import.xlsx");
const DOSSIER_IMAGES = path.join(RACINE, "public", "images", "oeuvres");
const API = process.env.TMDB_BASE || "https://api.themoviedb.org/3";
const IMAGES = process.env.TMDB_IMAGES || "https://image.tmdb.org/t/p/w780";
const ESSAI = process.argv.includes("--essai");
/** Réécrit les titres et retélécharge les affiches déjà présentes (pour un import fait avec l'ancienne version). */
const TITRES = process.argv.includes("--titres");
const AFFICHES = process.argv.includes("--affiches");
const TOUT = process.argv.includes("--tout") || TITRES || AFFICHES;

/** Nombre d'acteurs gardés (les premiers du générique). Au-delà, tout finit relié à tout. */
const NB_ACTEURS = 5;
/** Nombre de studios gardés. */
const NB_STUDIOS = 3;

/* ---------- Colonnes de l'onglet Films (dans cet ordre si l'onglet est créé) ---------- */

const COLONNES = [
  ["id", "id", 26],
  ["titre", "Titre", 30],
  ["titreOriginal", "Titre original", 26],
  ["realisation", "Réalisation", 24],
  ["annee", "Année", 8],
  ["format", "Format (Film, Série, Documentaire…)", 14],
  ["genres", "Genres", 28],
  ["descripteurs", "Descripteurs", 30],
  ["scenario", "Scénario", 28],
  ["casting", "Casting", 40],
  ["musique", "Musique", 22],
  ["image", "Image (chef opérateur)", 22],
  ["montage", "Montage", 22],
  ["studios", "Studios", 30],
  ["pays", "Pays", 18],
  ["langue", "Langue", 12],
  ["duree", "Durée", 10],
  ["date", "Date de sortie", 13],
  ["description", "Description", 40],
  ["synopsis", "Synopsis (TMDB, pour t'aider)", 50],
  ["affiche", "Affiche (seulement si son nom n'est pas l'id)", 20],
  ["liens", "Relier à (id, séparés par des virgules)", 24],
  ["pasDeLien", "Ne pas relier à (id)", 20],
  ["tmdb", "TMDB (numéro, rempli tout seul)", 14],
];

const sansAccent = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Reconnaît une colonne par le début de son titre (« Image (chef opérateur) » → image). */
const DEBUTS = [
  ["ne pas relier", "pasDeLien"],
  ["relier", "liens"],
  ["titre original", "titreOriginal"],
  ["titre", "titre"],
  ["identifiant", "id"],
  ["id", "id"],
  ["realisation", "realisation"],
  ["realisateur", "realisation"],
  ["annee", "annee"],
  ["format", "format"],
  ["genre", "genres"],
  ["descripteur", "descripteurs"],
  ["scenario", "scenario"],
  ["casting", "casting"],
  ["acteur", "casting"],
  ["musique", "musique"],
  ["image", "image"],
  ["montage", "montage"],
  ["studio", "studios"],
  ["pays", "pays"],
  ["langue", "langue"],
  ["duree", "duree"],
  ["date", "date"],
  ["description", "description"],
  ["synopsis", "synopsis"],
  ["affiche", "affiche"],
  ["tmdb", "tmdb"],
];
function champDe(entete) {
  const n = sansAccent(entete);
  return DEBUTS.find(([d]) => [d, d + "s"].some((x) => n === x || n.startsWith(x + " ")))?.[1];
}

/** Même fabrication d'id que le site (lib/oeuvres.ts) : réalisateur + titre. */
function slugify(s) {
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

/* ---------- Clé TMDB ---------- */

function lireEnv() {
  const env = { ...process.env };
  for (const f of [".env.local", ".env"]) {
    const p = path.join(RACINE, f);
    if (!fs.existsSync(p)) continue;
    for (const l of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = /^\s*(TMDB_TOKEN|TMDB_API_KEY)\s*=\s*"?([^"\s]+)"?\s*$/.exec(l);
      if (m && !env[m[1]]) env[m[1]] = m[2];
    }
  }
  return env;
}

const env = lireEnv();
const JETON = env.TMDB_TOKEN;
const CLE = env.TMDB_API_KEY;

/* ---------- Appels TMDB ---------- */

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

async function tmdb(chemin, params = {}, essai = 0) {
  const url = new URL(API + chemin);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  if (!JETON && CLE) url.searchParams.set("api_key", CLE);
  const rep = await fetch(url, { headers: { Accept: "application/json", ...(JETON ? { Authorization: `Bearer ${JETON}` } : {}) } });
  if (rep.status === 429 && essai < 4) {
    await attendre(1500 * (essai + 1));
    return tmdb(chemin, params, essai + 1);
  }
  if (rep.status === 401) throw new Error("TMDB refuse la clé : vérifie TMDB_TOKEN ou TMDB_API_KEY dans .env.local.");
  if (rep.status === 404) return null;
  if (!rep.ok) throw new Error(`TMDB a répondu ${rep.status}.`);
  await attendre(120); // on reste poli avec TMDB
  return rep.json();
}

const anneeDe = (date) => (/^\d{4}/.test(date ?? "") ? Number(date.slice(0, 4)) : undefined);

/** Trouve le film (ou la série) : d'abord avec l'année, puis sans. */
async function trouver(titre, annee, serie) {
  const quoi = serie ? "tv" : "movie";
  const avecAnnee = annee ? { [serie ? "first_air_date_year" : "primary_release_year"]: annee } : {};
  let r = await tmdb(`/search/${quoi}`, { query: titre, language: "en-US", include_adult: "false", ...avecAnnee });
  let res = r?.results ?? [];
  if (!res.length && annee) {
    r = await tmdb(`/search/${quoi}`, { query: titre, language: "en-US", include_adult: "false" });
    res = r?.results ?? [];
    // sans l'année, on n'accepte qu'un résultat à un an près (les dates varient selon les pays)
    res = res.filter((x) => Math.abs((anneeDe(x.release_date ?? x.first_air_date) ?? 0) - annee) <= 1);
  }
  if (!res.length) return { trouve: null, autres: [] };
  return { trouve: res[0], autres: res.slice(1, 3) };
}

const noms = (l) => [...new Set(l.map((x) => x?.name).filter(Boolean))];
const regionFr = new Intl.DisplayNames(["fr"], { type: "region" });
const langueEn = new Intl.DisplayNames(["en"], { type: "language" });
const nomPays = (code) => {
  try {
    return regionFr.of(code) ?? code;
  } catch {
    return code;
  }
};
const nomLangue = (code) => {
  try {
    return code ? (langueEn.of(code) ?? code) : undefined;
  } catch {
    return code;
  }
};
const duree = (min) => (min > 0 ? `${min} min` : undefined);

/**
 * Le titre affiché : le titre américain / anglais (« Hate » pour La Haine, « Parasite »).
 * Le titre d'origine, s'il est différent, va dans « Titre original ».
 */
function titres(original, anglais) {
  const titre = anglais || original;
  return { titre, titreOriginal: original && original !== titre ? original : undefined };
}

/** Le synopsis en français s'il existe (pour t'aider à écrire ta description), sinon en anglais. */
function synopsisFr(x) {
  const fr = (x.translations?.translations ?? []).find((t) => t.iso_639_1 === "fr")?.data?.overview;
  return fr || x.overview || undefined;
}

/**
 * L'affiche américaine / anglaise (comme le titre), sinon celle dans la langue du film,
 * sinon une sans texte. (TMDB donne sinon l'affiche française quand elle existe.)
 */
async function afficheOrigine(chemin, langue, parDefaut) {
  const img = await tmdb(`${chemin}/images`, { include_image_language: [langue, "en", "null"].filter(Boolean).join(",") }).catch(() => null);
  const posters = img?.posters ?? [];
  for (const l of ["en", langue, null]) {
    const choix = posters.filter((p) => p.iso_639_1 === l).sort((a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0) || (b.vote_count ?? 0) - (a.vote_count ?? 0));
    if (choix[0]?.file_path) return choix[0].file_path;
  }
  return parDefaut;
}

/** Toutes les infos d'un film, rangées comme les colonnes de l'onglet. */
async function details(id, serie) {
  if (serie) {
    const t = await tmdb(`/tv/${id}`, { language: "en-US", append_to_response: "aggregate_credits,translations" });
    if (!t) return null;
    const crew = t.aggregate_credits?.crew ?? [];
    const job = (...jobs) => noms(crew.filter((c) => (c.jobs ?? []).some((j) => jobs.includes(j.job))));
    return {
      tmdb: id,
      ...titres(t.original_name, t.name),
      realisation: noms(t.created_by ?? []).join(", ") || job("Director").slice(0, 3).join(", "),
      annee: anneeDe(t.first_air_date),
      format: "Série",
      genres: noms(t.genres ?? []),
      scenario: job("Screenplay", "Writer").slice(0, 4),
      casting: noms([...(t.aggregate_credits?.cast ?? [])].sort((a, b) => (a.order ?? 99) - (b.order ?? 99))).slice(0, NB_ACTEURS),
      musique: job("Original Music Composer", "Music", "Composer").slice(0, 3),
      image: job("Director of Photography").slice(0, 3),
      montage: job("Editor").slice(0, 3),
      studios: noms(t.production_companies ?? []).slice(0, NB_STUDIOS),
      pays: [...new Set((t.origin_country ?? []).map(nomPays))],
      langue: nomLangue(t.original_language),
      duree: duree(t.episode_run_time?.[0]) && `${t.episode_run_time[0]} min / épisode`,
      date: t.first_air_date || undefined,
      synopsis: synopsisFr(t),
      poster: await afficheOrigine(`/tv/${id}`, t.original_language, t.poster_path),
    };
  }
  const f = await tmdb(`/movie/${id}`, { language: "en-US", append_to_response: "credits,translations" });
  if (!f) return null;
  const crew = f.credits?.crew ?? [];
  const job = (...jobs) => noms(crew.filter((c) => jobs.includes(c.job)));
  const scenario = job("Screenplay", "Writer");
  return {
    tmdb: id,
    ...titres(f.original_title, f.title),
    realisation: job("Director").join(", "),
    annee: anneeDe(f.release_date),
    format: (f.genres ?? []).some((g) => g.id === 99) ? "Documentaire" : "Film",
    genres: noms(f.genres ?? []),
    scenario: (scenario.length ? scenario : job("Story", "Novel", "Author")).slice(0, 4),
    casting: noms([...(f.credits?.cast ?? [])].sort((a, b) => (a.order ?? 99) - (b.order ?? 99))).slice(0, NB_ACTEURS),
    musique: job("Original Music Composer", "Music", "Composer").slice(0, 3),
    image: job("Director of Photography").slice(0, 3),
    montage: job("Editor").slice(0, 3),
    studios: noms(f.production_companies ?? []).slice(0, NB_STUDIOS),
    pays: [...new Set((f.production_countries ?? []).map((p) => nomPays(p.iso_3166_1)))],
    langue: nomLangue(f.original_language),
    duree: duree(f.runtime),
    date: f.release_date || undefined,
    synopsis: synopsisFr(f),
    poster: await afficheOrigine(`/movie/${id}`, f.original_language, f.poster_path),
  };
}

/* ---------- Le tableur ---------- */

const texte = (cell) => {
  const v = cell?.value;
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && "result" in v) return String(v.result ?? "").trim();
  return String(cell.text ?? v).trim();
};

function preparerOnglet(wb) {
  let ws = wb.worksheets.find((w) => sansAccent(w.name) === "films");
  if (ws) return { ws, cree: false };
  // nouvel onglet, rangé juste après « Œuvres », avec le même style d'en-tête
  const oeuvres = wb.worksheets.find((w) => sansAccent(w.name) === "oeuvres");
  ws = wb.addWorksheet("Films", { views: [{ state: "frozen", ySplit: 1 }] });
  const modele = oeuvres?.getRow(1).getCell(1);
  COLONNES.forEach(([, titre, largeur], i) => {
    const c = ws.getRow(1).getCell(i + 1);
    c.value = titre;
    if (modele?.style) c.style = JSON.parse(JSON.stringify(modele.style));
    else c.font = { bold: true };
    ws.getColumn(i + 1).width = largeur;
  });
  if (oeuvres) {
    // l'onglet Films vient juste après Œuvres
    const ordre = wb.worksheets.filter((w) => w !== ws);
    ordre.splice(ordre.indexOf(oeuvres) + 1, 0, ws);
    ordre.forEach((w, i) => (w.orderNo = i));
  }
  return { ws, cree: true };
}

/** Colonnes présentes (champ → numéro) ; ajoute en bout de ligne celles qui manquent. */
function colonnesDe(ws) {
  const cols = {};
  ws.getRow(1).eachCell({ includeEmpty: false }, (c, n) => {
    const ch = champDe(texte(c));
    if (ch && !cols[ch]) cols[ch] = n;
  });
  let fin = ws.getRow(1).cellCount;
  const style = ws.getRow(1).getCell(1).style;
  for (const [ch, titre, largeur] of COLONNES) {
    if (cols[ch]) continue;
    fin++;
    const c = ws.getRow(1).getCell(fin);
    c.value = titre;
    if (style) c.style = JSON.parse(JSON.stringify(style));
    ws.getColumn(fin).width = largeur;
    cols[ch] = fin;
  }
  return cols;
}

function afficheExiste(id) {
  if (!fs.existsSync(DOSSIER_IMAGES)) return false;
  return fs.readdirSync(DOSSIER_IMAGES).some((f) => f.slice(0, f.lastIndexOf(".")) === id);
}

async function telechargerAffiche(poster, id) {
  if (!poster || (afficheExiste(id) && !AFFICHES)) return false;
  const rep = await fetch(IMAGES + poster);
  if (!rep.ok) return false;
  fs.mkdirSync(DOSSIER_IMAGES, { recursive: true });
  fs.writeFileSync(path.join(DOSSIER_IMAGES, `${id}.jpg`), Buffer.from(await rep.arrayBuffer()));
  return true;
}

/* ---------- Programme ---------- */

async function main() {
  if (!JETON && !CLE) {
    console.error("Pas de clé TMDB. Ajoute dans .env.local une ligne TMDB_TOKEN=... (ou TMDB_API_KEY=...).");
    process.exit(1);
  }
  if (!fs.existsSync(TABLEUR)) {
    console.error("content/oeuvres.xlsx introuvable : lance le script depuis le dossier du site.");
    process.exit(1);
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TABLEUR);
  const { ws, cree } = preparerOnglet(wb);
  const cols = colonnesDe(ws);

  if (cree) console.log("Onglet « Films » créé. Écris-y tes films (titre + année), puis relance le script.");

  const ids = new Set();
  let remplis = 0, affiches = 0, introuvables = 0, lignesVues = 0, dejaFaits = 0;

  for (let n = 2; n <= ws.rowCount; n++) {
    const ligne = ws.getRow(n);
    const lire = (ch) => (cols[ch] ? texte(ligne.getCell(cols[ch])) : "");
    const titre = lire("titre");
    const tmdbId = lire("tmdb");
    if (!titre && !tmdbId) continue;
    lignesVues++;
    const annee = Number(lire("annee")) || undefined;
    const serie = /s[eé]rie/i.test(lire("format"));

    let id = tmdbId && /^\d+$/.test(tmdbId) ? Number(tmdbId) : undefined;
    // déjà importé (numéro TMDB, id et affiche en place) : on passe, sauf avec --tout
    const dejaId = lire("id");
    if (id && dejaId && !TOUT && (lire("affiche") || afficheExiste(dejaId))) {
      ids.add(dejaId);
      dejaFaits++;
      continue;
    }
    let doute = "";
    try {
      if (!id) {
        const { trouve, autres } = await trouver(titre, annee, serie);
        if (!trouve) {
          introuvables++;
          console.log(`  ✗ ligne ${n} « ${titre} »${annee ? ` (${annee})` : ""} : introuvable sur TMDB. Vérifie le titre, ou mets son numéro TMDB dans la colonne TMDB.`);
          continue;
        }
        id = trouve.id;
        if (!annee && autres.length) doute = ` — sans année, vérifie que c'est le bon (autres possibles : ${autres.map((a) => `${a.title ?? a.name} ${anneeDe(a.release_date ?? a.first_air_date) ?? "?"}`).join(", ")})`;
      }
      const d = await details(id, serie);
      if (!d) {
        introuvables++;
        console.log(`  ✗ ligne ${n} « ${titre || tmdbId} » : numéro TMDB ${id} introuvable.`);
        continue;
      }

      // on ne remplit que les cases vides
      const ecrits = [];
      const poser = (ch, v) => {
        if (!cols[ch] || v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length)) return;
        const c = ligne.getCell(cols[ch]);
        const remplacer = TITRES && (ch === "titre" || ch === "titreOriginal") && texte(c) !== String(v);
        if (texte(c) && !remplacer) return;
        if (!ESSAI) c.value = Array.isArray(v) ? v.join(", ") : v;
        ecrits.push(ch);
      };
      for (const ch of ["titre", "titreOriginal", "realisation", "annee", "format", "genres", "scenario", "casting", "musique", "image", "montage", "studios", "pays", "langue", "duree", "date", "synopsis", "tmdb"]) poser(ch, d[ch]);

      // l'id, fabriqué comme sur le site (réalisateur + titre) : c'est aussi le nom de l'affiche
      let slug = lire("id");
      if (!slug) {
        const real = lire("realisation") || d.realisation || "";
        slug = slugify(`${real} ${lire("titre") || d.titre}`);
        let k = 2;
        while (ids.has(slug)) slug = `${slugify(`${real} ${lire("titre") || d.titre}`)}-${k++}`;
        poser("id", slug);
      }
      ids.add(slug);

      let image = false;
      if (!lire("affiche") && !ESSAI) image = await telechargerAffiche(d.poster, slug);
      else if (!lire("affiche") && d.poster && (AFFICHES || !afficheExiste(slug))) image = true;
      if (image) affiches++;

      if (ecrits.length || image) remplis++;
      const quoi = [ecrits.length ? `${ecrits.length} case${ecrits.length > 1 ? "s" : ""}` : "", image ? "affiche" : ""].filter(Boolean).join(" + ");
      console.log(`  ${ecrits.length || image ? "✓" : "·"} ligne ${n} « ${d.titre} » (${d.annee ?? "?"}, ${d.realisation || "?"})${quoi ? ` : ${quoi}` : " : déjà complet"}${doute}`);
    } catch (e) {
      console.log(`  ✗ ligne ${n} « ${titre} » : ${e.message}`);
      if (/refuse la clé/.test(e.message)) break;
    }
  }

  if (!lignesVues && !cree) console.log("L'onglet Films est vide : écris-y des titres (et l'année), puis relance.");

  if (ESSAI) {
    console.log(`\nEssai : ${remplis} film(s) seraient complétés, ${affiches} affiche(s) téléchargées. Rien n'a été écrit.`);
    return;
  }
  const deja = dejaFaits ? ` ${dejaFaits} film(s) déjà importé(s), sautés (--tout pour les revérifier).` : "";
  if (!remplis && !cree) {
    console.log(`\nRien à compléter.${introuvables ? ` ${introuvables} introuvable(s).` : ""}${deja}`);
    return;
  }
  fs.copyFileSync(TABLEUR, SAUVEGARDE);
  try {
    await wb.xlsx.writeFile(TABLEUR);
  } catch (e) {
    if (/EBUSY|EPERM/.test(String(e?.code ?? e))) {
      console.error("\nImpossible d'écrire : le tableur est ouvert dans Excel. Ferme-le et relance.");
      process.exit(1);
    }
    throw e;
  }
  if (cree && !remplis) return;
  console.log(`\n${remplis} film(s) complété(s), ${affiches} affiche(s) téléchargée(s)${introuvables ? `, ${introuvables} introuvable(s)` : ""}.${deja}`);
  console.log("Copie de l'ancien tableur : content/oeuvres.avant-import.xlsx");
  if (affiches) console.log("Pense à relancer le script des miniatures pour les nouvelles affiches.");
}

main().catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});
