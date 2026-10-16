// Convertit content/connexions.json en tableur Excel : content/oeuvres.xlsx
//
// À lancer UNE fois, depuis le dossier du projet :   node scripts/vers-tableur.mjs
//
// Ensuite le site lit le tableur (connexions.json est ignoré, garde-le comme sauvegarde).
// Le fichier s'ouvre avec Excel, LibreOffice ou Numbers. Enregistre-le toujours en .xlsx.
//
// Onglets créés :
//   Œuvres        une ligne par œuvre
//   Familles      tes ajouts et corrections de genres (la liste complète RYM est dans content/genres-rym.tsv)
//   Mode d'emploi
//
// Si oeuvres.xlsx existe déjà, le script s'arrête pour ne rien écraser.
// Pour le refaire quand même :   node scripts/vers-tableur.mjs --ecraser
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const racine = process.cwd();
const SOURCE = path.join(racine, "content", "connexions.json");
const CIBLE = path.join(racine, "content", "oeuvres.xlsx");
const REFERENCE = path.join(racine, "content", "genres-rym.tsv");

/*
 * Les genres viennent tels quels de RateYourMusic : content/genres-rym.tsv (noms et parents exacts).
 * Le site lit cette liste directement. L'onglet Familles ne sert qu'à tes ajouts et corrections.
 */
const FAMILLES = {};

const TYPES = ["album", "film", "jeu", "livre", "autre"];

/* ---------- Petits outils ---------- */

const norm = (s) => String(s).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const esc = (s) =>
  String(s)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const lettre = (i) => {
  let s = "";
  for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
  return s;
};

/* ---------- Écriture d'un .xlsx (c'est un zip de fichiers XML) ---------- */

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zipper(fichiers) {
  const locaux = [], central = [];
  let pos = 0;
  for (const [nom, contenu] of fichiers) {
    const brut = Buffer.from(contenu, "utf8");
    const comp = zlib.deflateRawSync(brut, { level: 9 });
    const n = Buffer.from(nom, "utf8");
    const crc = crc32(brut);
    const l = Buffer.alloc(30);
    l.writeUInt32LE(0x04034b50, 0);
    l.writeUInt16LE(20, 4);
    l.writeUInt16LE(0x0800, 6); // noms en UTF-8
    l.writeUInt16LE(8, 8);
    l.writeUInt16LE(0, 10);
    l.writeUInt16LE(0x21, 12);
    l.writeUInt32LE(crc, 14);
    l.writeUInt32LE(comp.length, 18);
    l.writeUInt32LE(brut.length, 22);
    l.writeUInt16LE(n.length, 26);
    locaux.push(l, n, comp);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x0800, 8);
    c.writeUInt16LE(8, 10);
    c.writeUInt16LE(0, 12);
    c.writeUInt16LE(0x21, 14);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(comp.length, 20);
    c.writeUInt32LE(brut.length, 24);
    c.writeUInt16LE(n.length, 28);
    c.writeUInt32LE(pos, 42);
    central.push(c, n);
    pos += 30 + n.length + comp.length;
  }
  const tailleCentral = central.reduce((t, b) => t + b.length, 0);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(fichiers.length, 8);
  fin.writeUInt16LE(fichiers.length, 10);
  fin.writeUInt32LE(tailleCentral, 12);
  fin.writeUInt32LE(pos, 16);
  return Buffer.concat([...locaux, ...central, fin]);
}

// Styles : 0 normal, 1 en-tête (blanc sur noir), 2 titre, 3 texte qui revient à la ligne, 4 bandeau « à compléter »
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="4"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><b/><sz val="16"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0A0A0A"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFE7A3"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="0" fontId="3" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/**
 * Une feuille. lignes = [[cellule, ...], ...], une cellule = texte, nombre, null,
 * ou { v, s } pour imposer un style.
 */
function feuille({ lignes, largeurs, entete = true, filtre = true, validations = "" }) {
  const xml = [];
  lignes.forEach((ligne, i) => {
    const cellules = ligne
      .map((c, j) => {
        const { v, s } = c !== null && typeof c === "object" ? c : { v: c, s: i === 0 && entete ? 1 : 0 };
        if (v === null || v === undefined || v === "") return s ? `<c r="${lettre(j)}${i + 1}" s="${s}"/>` : "";
        const st = s ? ` s="${s}"` : "";
        if (typeof v === "number") return `<c r="${lettre(j)}${i + 1}"${st}><v>${v}</v></c>`;
        return `<c r="${lettre(j)}${i + 1}"${st} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
      })
      .join("");
    xml.push(`<row r="${i + 1}"${i === 0 && entete ? ' ht="22" customHeight="1"' : ""}>${cellules}</row>`);
  });
  const nbCol = Math.max(...lignes.map((l) => l.length));
  const vue = entete ? `<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0">${vue}</sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${largeurs.map((w, j) => `<col min="${j + 1}" max="${j + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>
<sheetData>${xml.join("\n")}</sheetData>
${filtre ? `<autoFilter ref="A1:${lettre(nbCol - 1)}${lignes.length}"/>` : ""}
${validations}
</worksheet>`;
}

function classeur(onglets) {
  const fichiers = [];
  const ct = onglets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("");
  fichiers.push([
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${ct}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
  ]);
  fichiers.push([
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  ]);
  // le filtre automatique a besoin d'un nom caché par onglet pour Excel
  const noms = onglets
    .map((o, i) => (o.filtre !== false ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${esc(o.nom).replace(/'/g, "''")}'!$A$1:$${lettre(Math.max(...o.lignes.map((l) => l.length)) - 1)}$${o.lignes.length}</definedName>` : ""))
    .join("");
  fichiers.push([
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>${onglets.map((o, i) => `<sheet name="${esc(o.nom)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>${noms ? `<definedNames>${noms}</definedNames>` : ""}</workbook>`,
  ]);
  fichiers.push([
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${onglets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${onglets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  ]);
  fichiers.push(["xl/styles.xml", STYLES]);
  onglets.forEach((o, i) => fichiers.push([`xl/worksheets/sheet${i + 1}.xml`, feuille(o)]));
  return zipper(fichiers);
}

/* ---------- Conversion ---------- */

// --vide : un tableur neuf, sans aucune œuvre (pour repartir de zéro)
const VIDE = process.argv.includes("--vide");
if (!VIDE && !fs.existsSync(SOURCE)) {
  console.error("content/connexions.json introuvable : lance le script depuis le dossier du projet (ou ajoute --vide pour un tableur vide).");
  process.exit(1);
}
if (fs.existsSync(CIBLE) && !process.argv.includes("--ecraser")) {
  console.error("content/oeuvres.xlsx existe déjà, je n'y touche pas. Pour le remplacer, ajoute --ecraser à la commande.");
  process.exit(1);
}

const data = VIDE ? { oeuvres: [] } : JSON.parse(fs.readFileSync(SOURCE, "utf8"));
const oeuvres = Array.isArray(data.oeuvres) ? data.oeuvres : [];
const liste = (v) => (Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : []).map((x) => String(x).trim()).filter(Boolean);

// --- Onglet Œuvres ---
// Mêmes colonnes, dans le même ordre, que l'extension « HENASSA · Albums RYM » (colonnes.js) :
// ses lignes se collent telles quelles.
const ENTETES = [
  "id", "Titre", "Artiste / auteur", "Année", "Type", "Genre (vide = trouvé tout seul)", "Sous-genres", "Genres secondaires", "Scènes", "Descripteurs",
  "Pochette (seulement si son nom n'est pas l'id)", "Description", "Relier à (id, séparés par des virgules)", "Ne pas relier à (id)",
  "Format", "Date de sortie", "Enregistrement", "Langue", "Labels", "Featurings", "Producteurs", "Production exécutive", "Musiciens", "Mixage / mastering", "Visuels (DA, photo)",
  "Durée", "Nombre de titres",
];
const lignesOeuvres = [ENTETES];
for (const o of oeuvres) {
  lignesOeuvres.push([
    o.id ?? "",
    o.titre ?? "",
    o.auteur ?? "",
    o.annee ? Number(o.annee) : null,
    o.type ?? "",
    o.genre ?? "",
    liste(o.sousGenres ?? o["sous-genres"]).join(", "),
    "",
    "",
    "",
    o.cover ?? "",
    o.description ?? "",
    liste(o.liens).join(", "),
    liste(o.pasDeLien).join(", "),
    ...Array(ENTETES.length - 14).fill(null),
  ]);
}
const validationType = `<dataValidations count="1"><dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="1" errorTitle="Type inconnu" error="Choisis album, film, jeu, livre ou autre." sqref="E2:E10000"><formula1>"${TYPES.join(",")}"</formula1></dataValidation></dataValidations>`;

// --- Onglet Familles ---
// termes utilisés par tes œuvres
const utilises = new Map();
for (const o of oeuvres) for (const t of [o.genre, ...liste(o.sousGenres ?? o["sous-genres"])]) if (t && !utilises.has(norm(t))) utilises.set(norm(t), String(t).trim());
// termes déjà connus de la liste de référence (comme terme ou comme parent) : rien à écrire pour eux
const reference = new Set();
if (fs.existsSync(REFERENCE))
  for (const l of fs.readFileSync(REFERENCE, "utf8").split(/\r?\n/).slice(1)) {
    const [t, p = ""] = l.split("\t");
    if (t?.trim()) reference.add(norm(t));
    for (const x of p.split(",")) if (x.trim()) reference.add(norm(x));
  }
for (const k of [...utilises.keys()]) if (reference.has(k)) utilises.delete(k);
const fam = new Map(Object.entries(FAMILLES).map(([t, p]) => [norm(t), { terme: t, parents: p }]));
// secours pour les termes inconnus de la référence (sans remonter : la référence connaît les parents)
const garder = new Set([...utilises.keys()].filter((k) => fam.has(k)));
const connus = [...garder].map((k) => fam.get(k)).sort((a, b) => a.terme.localeCompare(b.terme, "fr"));
// termes sans famille connue (ni terme, ni parent d'un autre) : à compléter
const parentsConnus = new Set(connus.flatMap((f) => f.parents.split(",").map(norm)));
const aCompleter = [...utilises].filter(([k]) => !garder.has(k) && !parentsConnus.has(k)).map(([, t]) => t).sort((a, b) => a.localeCompare(b, "fr"));

const lignesFamilles = [["Terme", "Parents (séparés par des virgules)"], ...connus.map((f) => [f.terme, f.parents])];
// rappel en bas de l'onglet
const RAPPEL = fs.existsSync(REFERENCE)
  ? "La liste complète des genres (RateYourMusic) est déjà prise en compte, inutile de la recopier ici. Ajoute seulement tes genres à toi, ou une ligne pour corriger un genre : elle remplace celle de la liste."
  : "";
if (RAPPEL) lignesFamilles.push([null, null], [{ v: RAPPEL, s: 3 }, null]);
if (aCompleter.length) {
  lignesFamilles.push([null, null]);
  lignesFamilles.push([{ v: "À VÉRIFIER : tags de tes œuvres qui ne sont pas des noms de genre RYM. Corrige le nom dans l'onglet Œuvres, ou donne-leur des parents ici.", s: 4 }, { v: "", s: 4 }]);
  for (const t of aCompleter) lignesFamilles.push([t, ""]);
}

// --- Onglet Mode d'emploi ---
const AIDE = [
  [{ v: "Comment remplir ce tableur", s: 2 }],
  [null],
  [{ v: "ŒUVRES", s: 4 }],
  ["Une ligne = une œuvre. Seuls Titre, Artiste / auteur et Type sont obligatoires."],
  ["id : identifiant unique (minuscules et tirets, ex. nas-illmatic). Laisse vide et il est fabriqué depuis l'artiste et le titre. Attention : il sert aux liens et au nom de la pochette, ne le change plus une fois choisi."],
  ["Type : album, film, jeu, livre ou autre (menu déroulant)."],
  ["Sous-genres : séparés par des virgules, du plus important au moins important. C'est ce qui crée les connexions automatiques."],
  ["Genre et sous-genres : utilise les noms exacts de RateYourMusic (ex. « Hip Hop », « R&B / Soul / Funk », « Contemporary R&B »). Le site te prévient dans le terminal si un tag n'en est pas un."],
  ["Genres secondaires et Scènes : comptent aussi, après les sous-genres. Genre : laisse vide, le site prend la grande famille du premier sous-genre (Trap → Hip Hop)."],
  [null],
  [{ v: "EXTENSION « HENASSA · ALBUMS RYM »", s: 4 }],
  ["Sur une page d'album RYM, clique « + HENASSA » : l'album est noté et sa pochette téléchargée en JPEG dans Téléchargements/henassa-pochettes (déjà nommée comme l'id : glisse-la dans public/images/oeuvres)."],
  ["Puis clique l'icône de l'extension → « Copier les nouveaux pour Excel », et colle dans l'onglet Œuvres, colonne A, sur la première ligne vide (Ctrl+V)."],
  ["Les colonnes après « Ne pas relier à » (format, dates, labels, featurings, producteurs, musiciens, mixage, visuels, durée...) sont gardées pour plus tard : le site ne les affiche pas encore."],
  ["Écris toujours un terme pareil (« Boom Bap » partout). Majuscules, accents et tirets ne comptent pas."],
  ["Pochette : rien à mettre si l'image s'appelle comme l'id (public/images/oeuvres/nas-illmatic.jpg)."],
  ["Relier à / Ne pas relier à : id d'autres œuvres, pour forcer ou casser une connexion. Un seul côté suffit."],
  [null],
  [{ v: "FAMILLES", s: 4 }],
  ["La liste complète des genres de RateYourMusic (environ 2 900, avec leurs parents) est dans content/genres-rym.tsv : le site la lit tout seul, tu n'as rien à faire. Taper « Persian Pop » donne déjà Pop et Persian Music."],
  ["L'onglet Familles sert à tes ajouts : un genre à toi qui n'existe pas sur RYM, ou une correction (ta ligne remplace celle de RYM pour ce genre)."],
  ["Dis qui descend de qui. Ex. : Drill FR → Drill, French Hip Hop."],
  ["Une œuvre taguée « Chicago Drill » reçoit alors en coulisse Drill, Trap, Southern Hip Hop, Hip Hop... (les parents des parents aussi)."],
  ["Ces parents servent aux connexions, aux filtres des mini-jeux et à la recherche : chercher « Drill » trouve aussi Chicago Drill et UK Drill."],
  ["Ils ne s'affichent pas dans la fiche de l'œuvre : seuls les termes que tu as écrits s'y voient."],
  ["Un nouveau sous-genre sans famille marche quand même ; le site te le rappelle dans le terminal au lancement."],
  [null],
  [{ v: "ENREGISTRER", s: 4 }],
  ["Garde le nom content/oeuvres.xlsx et le format .xlsx (Classeur Excel). Puis relance npm run dev ou npm run build."],
  ["Tu peux ajouter des colonnes pour toi (notes, date d'ajout...) : le site ignore celles qu'il ne connaît pas. Ne renomme pas les en-têtes existants."],
];

const xlsx = classeur([
  { nom: "Œuvres", lignes: lignesOeuvres, largeurs: [34, 30, 24, 8, 10, 18, 44, 40, 24, 40, 22, 40, 26, 22, 10, 13, 24, 12, 26, 40, 50, 30, 60, 40, 40, 9, 9], validations: validationType },
  { nom: "Familles", lignes: lignesFamilles, largeurs: [34, 50] },
  { nom: "Mode d'emploi", lignes: AIDE.map((l) => l.map((c) => (c && typeof c === "object" ? c : { v: c, s: 3 }))), largeurs: [120], entete: false, filtre: false },
]);
fs.writeFileSync(CIBLE, xlsx);

console.log(`content/oeuvres.xlsx créé : ${oeuvres.length} œuvres.${reference.size ? " Genres : liste RateYourMusic (content/genres-rym.tsv)." : ""}`);
if (aCompleter.length) console.log(`${aCompleter.length} terme(s) à ranger toi-même (en bas de l'onglet Familles) : ${aCompleter.join(", ")}`);
console.log("Le site lit maintenant le tableur. Garde connexions.json comme sauvegarde, il est ignoré.");
