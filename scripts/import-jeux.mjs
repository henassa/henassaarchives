/*
 * Import des jeux vidéo depuis IGDB, directement dans content/oeuvres.xlsx (onglet « Jeux »).
 *
 * Tu écris le titre (et l'année) d'un jeu dans l'onglet Jeux, ou juste son numéro IGDB, puis :
 *     node scripts/import-jeux.mjs
 * Le script remplit toutes les cases VIDES de la ligne : studio, éditeur, série,
 * genres, thèmes, perspective, modes, plateformes, moteur, mots-clés, date, résumé…
 * Il télécharge aussi la jaquette dans public/images/oeuvres (nommée comme l'id du jeu).
 *
 * Il ne remplace jamais une case déjà remplie : tu peux corriger à la main et relancer.
 *
 * Options :
 *     --essai     montre ce qui serait rempli, sans rien écrire
 *     --jaquettes retélécharge les jaquettes, même si elles existent
 *     --tout      revérifie aussi les jeux déjà importés (sinon ils sont sautés,
 *                 pour aller vite : un jeu est « importé » quand sa colonne IGDB est remplie)
 *
 * Clés IGDB (gratuites, via un compte développeur Twitch) : dans .env.local, deux lignes :
 *     IGDB_CLIENT_ID=...
 *     IGDB_CLIENT_SECRET=...
 *
 * Avant d'écrire, une copie du tableur est gardée dans content/oeuvres.avant-import.xlsx.
 * Ferme le fichier dans Excel avant de lancer le script.
 *
 * Données : IGDB.com.
 */

import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";

const RACINE = process.cwd();
const TABLEUR = path.join(RACINE, "content", "oeuvres.xlsx");
const SAUVEGARDE = path.join(RACINE, "content", "oeuvres.avant-import.xlsx");
const DOSSIER_IMAGES = path.join(RACINE, "public", "images", "oeuvres");
const API = process.env.IGDB_BASE || "https://api.igdb.com/v4";
const JETONS = process.env.TWITCH_TOKEN_URL || "https://id.twitch.tv/oauth2/token";
/** Jaquette en 528 × 748 (format « cover_big_2x » d'IGDB). */
const IMAGE = (id) => `${process.env.IGDB_IMAGES || "https://images.igdb.com/igdb/image/upload"}/t_cover_big_2x/${id}.jpg`;
const ESSAI = process.argv.includes("--essai");
const JAQUETTES = process.argv.includes("--jaquettes");
const TOUT = process.argv.includes("--tout") || JAQUETTES;

/** Nombre de mots-clés gardés (IGDB en donne parfois des dizaines). */
const NB_MOTS_CLES = 12;

/* ---------- Colonnes de l'onglet Jeux (dans cet ordre si l'onglet est créé) ---------- */

const COLONNES = [
  ["id", "id", 26],
  ["titre", "Titre", 30],
  ["studio", "Studio (développeur)", 24],
  ["annee", "Année", 8],
  ["editeur", "Éditeur", 22],
  ["serie", "Série", 22],
  ["genres", "Genres", 28],
  ["themes", "Thèmes", 24],
  ["descripteurs", "Descripteurs", 30],
  ["perspective", "Perspective", 18],
  ["modes", "Modes", 20],
  ["plateformes", "Plateformes", 28],
  ["moteur", "Moteur", 16],
  ["motsCles", "Mots-clés (IGDB)", 36],
  ["date", "Date de sortie", 13],
  ["description", "Description", 40],
  ["synopsis", "Résumé (IGDB, pour t'aider)", 50],
  ["jaquette", "Jaquette (seulement si son nom n'est pas l'id)", 20],
  ["liens", "Relier à (id, séparés par des virgules)", 24],
  ["pasDeLien", "Ne pas relier à (id)", 20],
  ["igdb", "IGDB (numéro, rempli tout seul)", 14],
];

const sansAccent = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Reconnaît une colonne par le début de son titre (« Studio (développeur) » → studio). */
const DEBUTS = [
  ["ne pas relier", "pasDeLien"],
  ["relier", "liens"],
  ["titre", "titre"],
  ["identifiant", "id"],
  ["id", "id"],
  ["studio", "studio"],
  ["developpeur", "studio"],
  ["annee", "annee"],
  ["editeur", "editeur"],
  ["serie", "serie"],
  ["genre", "genres"],
  ["theme", "themes"],
  ["descripteur", "descripteurs"],
  ["perspective", "perspective"],
  ["mode", "modes"],
  ["plateforme", "plateformes"],
  ["moteur", "moteur"],
  ["mots cles", "motsCles"],
  ["mot cle", "motsCles"],
  ["date", "date"],
  ["description", "description"],
  ["resume", "synopsis"],
  ["synopsis", "synopsis"],
  ["jaquette", "jaquette"],
  ["igdb", "igdb"],
];
function champDe(entete) {
  const n = sansAccent(entete);
  return DEBUTS.find(([d]) => [d, d + "s"].some((x) => n === x || n.startsWith(x + " ")))?.[1];
}

/** Même fabrication d'id que le site (lib/oeuvres.ts) : studio + titre. */
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

/* ---------- Clés IGDB ---------- */

function lireEnv() {
  const env = { ...process.env };
  for (const f of [".env.local", ".env"]) {
    const p = path.join(RACINE, f);
    if (!fs.existsSync(p)) continue;
    for (const l of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = /^\s*(IGDB_CLIENT_ID|IGDB_CLIENT_SECRET)\s*=\s*"?([^"\s]+)"?\s*$/.exec(l);
      if (m && !env[m[1]]) env[m[1]] = m[2];
    }
  }
  return env;
}

const env = lireEnv();
const CLIENT = env.IGDB_CLIENT_ID;
const SECRET = env.IGDB_CLIENT_SECRET;
let jeton = "";

/** Jeton d'accès Twitch (valable environ deux mois ; on en demande un à chaque lancement). */
async function connexion() {
  const url = new URL(JETONS);
  url.searchParams.set("client_id", CLIENT);
  url.searchParams.set("client_secret", SECRET);
  url.searchParams.set("grant_type", "client_credentials");
  const rep = await fetch(url, { method: "POST" });
  if (!rep.ok) throw new Error("Twitch refuse les clés : vérifie IGDB_CLIENT_ID et IGDB_CLIENT_SECRET dans .env.local.");
  jeton = (await rep.json()).access_token;
  if (!jeton) throw new Error("Twitch n'a pas donné de jeton d'accès.");
}

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

/** Une requête IGDB (langage « Apicalypse », envoyé dans le corps). 4 requêtes par seconde au plus. */
async function igdb(quoi, requete, essai = 0) {
  const rep = await fetch(`${API}/${quoi}`, {
    method: "POST",
    headers: { "Client-ID": CLIENT, Authorization: `Bearer ${jeton}`, Accept: "application/json" },
    body: requete,
  });
  if (rep.status === 429 && essai < 4) {
    await attendre(1000 * (essai + 1));
    return igdb(quoi, requete, essai + 1);
  }
  if (rep.status === 401 || rep.status === 403) throw new Error("IGDB refuse l'accès : vérifie IGDB_CLIENT_ID et IGDB_CLIENT_SECRET dans .env.local.");
  if (!rep.ok) throw new Error(`IGDB a répondu ${rep.status}.`);
  await attendre(280);
  return rep.json();
}

const echapper = (s) => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
const anneeDe = (ts) => (typeof ts === "number" && ts > 0 ? new Date(ts * 1000).getUTCFullYear() : undefined);

/** Trouve le jeu : le plus pertinent, à un an près si l'année est connue. Les éditions spéciales sont écartées. */
async function trouver(titre, annee) {
  const res = await igdb("games", `search "${echapper(titre)}"; fields id,name,first_release_date; where version_parent = null; limit 15;`);
  let liste = Array.isArray(res) ? res : [];
  if (annee) {
    const bonnes = liste.filter((g) => Math.abs((anneeDe(g.first_release_date) ?? 0) - annee) <= 1);
    if (!bonnes.length) return { trouve: null, autres: liste.slice(0, 3) };
    liste = bonnes;
  }
  if (!liste.length) return { trouve: null, autres: [] };
  return { trouve: liste[0], autres: liste.slice(1, 3) };
}

const noms = (l) => [...new Set((l ?? []).map((x) => x?.name).filter(Boolean))];

/** « Role-playing (RPG) » → « RPG », « Turn-based strategy (TBS) » → « Turn-based strategy », « 4X (explore, …) » → « 4X ». */
const SIGLES = new Set(["RPG", "RTS", "MMO", "MOBA", "FPS"]);
const propre = (t) => {
  const sigle = /\(([A-Z0-9]{2,5})\)\s*$/.exec(t)?.[1];
  if (sigle && SIGLES.has(sigle)) return sigle;
  return t.replace(/\s*\([^)]*\)?/g, "").replace(/\s*\/\s*/g, " / ").trim();
};
const termes = (l) => [...new Set(noms(l).map(propre).filter(Boolean))];
const dateIso = (ts) => (typeof ts === "number" && ts > 0 ? new Date(ts * 1000).toISOString().slice(0, 10) : undefined);

const CHAMPS = [
  "name", "first_release_date", "summary", "cover.image_id",
  "genres.name", "themes.name", "keywords.name", "player_perspectives.name", "game_modes.name",
  "platforms.abbreviation", "platforms.name", "franchises.name", "collections.name", "game_engines.name",
  "involved_companies.developer", "involved_companies.publisher", "involved_companies.company.name",
].join(",");

/** Toutes les infos d'un jeu, rangées comme les colonnes de l'onglet. */
async function details(id) {
  const res = await igdb("games", `fields ${CHAMPS}; where id = ${Number(id)};`);
  const g = Array.isArray(res) ? res[0] : null;
  if (!g) return null;
  const societes = (filtre) => [...new Set((g.involved_companies ?? []).filter(filtre).map((c) => c?.company?.name).filter(Boolean))];
  const studios = societes((c) => c.developer);
  return {
    igdb: g.id,
    titre: g.name,
    studio: studios.slice(0, 3).join(", "),
    annee: anneeDe(g.first_release_date),
    editeur: societes((c) => c.publisher && !c.developer).slice(0, 3),
    // série : la « collection » IGDB (The Legend of Zelda), et la franchise si elle est différente
    serie: [...new Set([...noms(g.collections), ...noms(g.franchises)])].slice(0, 2),
    genres: termes(g.genres),
    themes: termes(g.themes),
    perspective: termes(g.player_perspectives),
    modes: termes(g.game_modes),
    plateformes: [...new Set((g.platforms ?? []).map((p) => p?.abbreviation || p?.name).filter(Boolean))],
    moteur: noms(g.game_engines).slice(0, 2),
    motsCles: noms(g.keywords).slice(0, NB_MOTS_CLES),
    date: dateIso(g.first_release_date),
    synopsis: g.summary || undefined,
    jaquette: g.cover?.image_id,
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
  let ws = wb.worksheets.find((w) => sansAccent(w.name) === "jeux");
  if (ws) return { ws, cree: false };
  // nouvel onglet, rangé après « Films » (ou « Œuvres »), avec le même style d'en-tête
  const oeuvres = wb.worksheets.find((w) => sansAccent(w.name) === "oeuvres");
  const avant = wb.worksheets.find((w) => sansAccent(w.name) === "films") ?? oeuvres;
  ws = wb.addWorksheet("Jeux", { views: [{ state: "frozen", ySplit: 1 }] });
  const modele = oeuvres?.getRow(1).getCell(1);
  COLONNES.forEach(([, titre, largeur], i) => {
    const c = ws.getRow(1).getCell(i + 1);
    c.value = titre;
    if (modele?.style) c.style = JSON.parse(JSON.stringify(modele.style));
    else c.font = { bold: true };
    ws.getColumn(i + 1).width = largeur;
  });
  if (avant) {
    const ordre = wb.worksheets.filter((w) => w !== ws);
    ordre.splice(ordre.indexOf(avant) + 1, 0, ws);
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

function imageExiste(id) {
  if (!fs.existsSync(DOSSIER_IMAGES)) return false;
  return fs.readdirSync(DOSSIER_IMAGES).some((f) => f.slice(0, f.lastIndexOf(".")) === id);
}

async function telechargerJaquette(imageId, id) {
  if (!imageId || (imageExiste(id) && !JAQUETTES)) return false;
  const rep = await fetch(IMAGE(imageId));
  if (!rep.ok) return false;
  fs.mkdirSync(DOSSIER_IMAGES, { recursive: true });
  fs.writeFileSync(path.join(DOSSIER_IMAGES, `${id}.jpg`), Buffer.from(await rep.arrayBuffer()));
  return true;
}

/* ---------- Programme ---------- */

async function main() {
  if (!CLIENT || !SECRET) {
    console.error("Pas de clés IGDB. Ajoute dans .env.local deux lignes : IGDB_CLIENT_ID=... et IGDB_CLIENT_SECRET=...");
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
  if (cree) console.log("Onglet « Jeux » créé. Écris-y tes jeux (titre + année, ou numéro IGDB), puis relance le script.");

  const ids = new Set();
  let remplis = 0, jaquettes = 0, introuvables = 0, lignesVues = 0, dejaFaits = 0, connecte = false;

  for (let n = 2; n <= ws.rowCount; n++) {
    const ligne = ws.getRow(n);
    const lire = (ch) => (cols[ch] ? texte(ligne.getCell(cols[ch])) : "");
    const titre = lire("titre");
    const igdbId = lire("igdb");
    if (!titre && !igdbId) continue;
    lignesVues++;
    const annee = Number(lire("annee")) || undefined;

    let id = igdbId && /^\d+$/.test(igdbId) ? Number(igdbId) : undefined;
    // déjà importé (numéro IGDB, id et jaquette en place) : on passe, sauf avec --tout
    const dejaId = lire("id");
    if (id && dejaId && !TOUT && (lire("jaquette") || imageExiste(dejaId))) {
      ids.add(dejaId);
      dejaFaits++;
      continue;
    }
    try {
      if (!connecte) {
        await connexion();
        connecte = true;
      }
      let doute = "";
      if (!id) {
        const { trouve, autres } = await trouver(titre, annee);
        if (!trouve) {
          introuvables++;
          const pistes = autres.length ? ` Résultats proches : ${autres.map((a) => `${a.name} (${anneeDe(a.first_release_date) ?? "?"})`).join(", ")}.` : "";
          console.log(`  ✗ ligne ${n} « ${titre} »${annee ? ` (${annee})` : ""} : introuvable sur IGDB.${pistes} Vérifie le titre, ou mets son numéro IGDB dans la colonne IGDB.`);
          continue;
        }
        id = trouve.id;
        if (!annee && autres.length) doute = ` — sans année, vérifie que c'est le bon (autres possibles : ${autres.map((a) => `${a.name} ${anneeDe(a.first_release_date) ?? "?"}`).join(", ")})`;
      }
      const d = await details(id);
      if (!d) {
        introuvables++;
        console.log(`  ✗ ligne ${n} « ${titre || igdbId} » : numéro IGDB ${id} introuvable.`);
        continue;
      }

      // on ne remplit que les cases vides
      const ecrits = [];
      const poser = (ch, v) => {
        if (!cols[ch] || v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length)) return;
        const c = ligne.getCell(cols[ch]);
        if (texte(c)) return;
        if (!ESSAI) c.value = Array.isArray(v) ? v.join(", ") : v;
        ecrits.push(ch);
      };
      for (const ch of ["titre", "studio", "annee", "editeur", "serie", "genres", "themes", "perspective", "modes", "plateformes", "moteur", "motsCles", "date", "synopsis", "igdb"]) poser(ch, d[ch]);

      // l'id, fabriqué comme sur le site (studio + titre) : c'est aussi le nom de la jaquette
      let slug = lire("id");
      if (!slug) {
        const base = slugify(`${lire("studio") || d.studio || ""} ${lire("titre") || d.titre}`);
        slug = base;
        let k = 2;
        while (ids.has(slug)) slug = `${base}-${k++}`;
        poser("id", slug);
      }
      ids.add(slug);

      let image = false;
      if (!lire("jaquette") && !ESSAI) image = await telechargerJaquette(d.jaquette, slug);
      else if (!lire("jaquette") && d.jaquette && (JAQUETTES || !imageExiste(slug))) image = true;
      if (image) jaquettes++;

      if (ecrits.length || image) remplis++;
      const quoi = [ecrits.length ? `${ecrits.length} case${ecrits.length > 1 ? "s" : ""}` : "", image ? "jaquette" : ""].filter(Boolean).join(" + ");
      console.log(`  ${ecrits.length || image ? "✓" : "·"} ligne ${n} « ${d.titre} » (${d.annee ?? "?"}, ${d.studio || "?"})${quoi ? ` : ${quoi}` : " : déjà complet"}${doute}`);
    } catch (e) {
      console.log(`  ✗ ligne ${n} « ${titre} » : ${e.message}`);
      if (/refuse/.test(e.message)) break;
    }
  }

  if (!lignesVues && !cree) console.log("L'onglet Jeux est vide : écris-y des titres (et l'année), puis relance.");

  if (ESSAI) {
    console.log(`\nEssai : ${remplis} jeu(x) seraient complétés, ${jaquettes} jaquette(s) téléchargées. Rien n'a été écrit.`);
    return;
  }
  const deja = dejaFaits ? ` ${dejaFaits} jeu(x) déjà importé(s), sautés (--tout pour les revérifier).` : "";
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
  console.log(`\n${remplis} jeu(x) complété(s), ${jaquettes} jaquette(s) téléchargée(s)${introuvables ? `, ${introuvables} introuvable(s)` : ""}.${deja}`);
  console.log("Copie de l'ancien tableur : content/oeuvres.avant-import.xlsx");
  if (jaquettes) console.log("Pense à relancer le script des miniatures pour les nouvelles jaquettes.");
}

main().catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});
