import fs from "node:fs";
import zlib from "node:zlib";

/*
 * Lecture d'un fichier Excel (.xlsx), sans rien installer.
 * Marche avec les fichiers enregistrés par Excel, LibreOffice ou Numbers
 * (format « Classeur Excel .xlsx »).
 *
 * lireTableur("content/oeuvres.xlsx") → { "Œuvres": [[...], [...]], "Familles": [...] }
 * Chaque onglet est une liste de lignes, chaque ligne une liste de cellules (texte ou nombre).
 */

export type Cellule = string | number | boolean | null;
export type Onglets = Record<string, Cellule[][]>;

/** Fichiers contenus dans le .xlsx (c'est un zip). */
function dezipper(buf: Buffer): Map<string, Buffer> {
  // fin du répertoire central : signature 0x06054b50, cherchée en partant de la fin
  let fin = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw new Error("ce n'est pas un fichier .xlsx valide");
  const nb = buf.readUInt16LE(fin + 10);
  let p = buf.readUInt32LE(fin + 16);
  const out = new Map<string, Buffer>();
  for (let k = 0; k < nb; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const methode = buf.readUInt16LE(p + 10);
    const taille = buf.readUInt32LE(p + 20);
    const lNom = buf.readUInt16LE(p + 28), lExtra = buf.readUInt16LE(p + 30), lCom = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const nom = buf.toString("utf8", p + 46, p + 46 + lNom);
    p += 46 + lNom + lExtra + lCom;
    const debut = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const brut = buf.subarray(debut, debut + taille);
    if (methode === 0) out.set(nom, brut);
    else if (methode === 8) out.set(nom, zlib.inflateRawSync(brut));
  }
  return out;
}

function entites(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_m, e: string) => {
    if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[e.toLowerCase()] ?? "";
  });
}

/** Texte d'un bloc <si> ou <is> : tous les <t>, sans les annotations phonétiques. */
function texte(xml: string) {
  const sans = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let t = "";
  for (const m of sans.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) t += m[1];
  return entites(t);
}

const attr = (balise: string, nom: string) => balise.match(new RegExp(`\\s${nom}="([^"]*)"`))?.[1];

/** « C12 » → colonne 2 (0 = A). */
function colonne(ref: string) {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, "")) n = n * 26 + (ch.toUpperCase().charCodeAt(0) - 64);
  return n - 1;
}

export function lireTableur(fichier: string): Onglets {
  const z = dezipper(fs.readFileSync(fichier));
  const lire = (n: string) => z.get(n)?.toString("utf8") ?? "";

  const partages = [...lire("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texte(m[1]!));

  // nom de l'onglet → fichier de la feuille
  const cibles = new Map<string, string>();
  for (const m of lire("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], "Id"), cible = attr(m[0], "Target");
    if (id && cible) cibles.set(id, cible.startsWith("/") ? cible.slice(1) : `xl/${cible}`);
  }

  const out: Onglets = {};
  for (const m of lire("xl/workbook.xml").matchAll(/<sheet\b[^>]*>/g)) {
    const nom = entites(attr(m[0], "name") ?? "");
    const chemin = cibles.get(attr(m[0], "r:id") ?? "");
    if (!nom || !chemin) continue;
    const lignes: Cellule[][] = [];
    for (const l of lire(chemin).matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const num = Number(attr(l[0], "r")) || lignes.length + 1;
      const ligne: Cellule[] = [];
      let auto = 0;
      for (const c of (l[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = attr(c[0], "r");
        const col = ref ? colonne(ref) : auto;
        auto = col + 1;
        const corps = c[2] ?? "";
        const t = attr(`<c${c[1]}>`, "t");
        const v = corps.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        let val: Cellule = null;
        if (t === "s") val = v !== undefined ? partages[Number(v)] ?? null : null;
        else if (t === "inlineStr") val = texte(corps.match(/<is>([\s\S]*?)<\/is>/)?.[1] ?? "");
        else if (t === "str") val = v !== undefined ? entites(v) : null;
        else if (t === "b") val = v === "1";
        else if (t === "e") val = null;
        else if (v !== undefined) val = Number(v);
        ligne[col] = val;
      }
      for (let i = 0; i < ligne.length; i++) if (ligne[i] === undefined) ligne[i] = null;
      lignes[num - 1] = ligne;
    }
    for (let i = 0; i < lignes.length; i++) if (!lignes[i]) lignes[i] = [];
    out[nom] = lignes;
  }
  return out;
}

/** Texte propre d'une cellule (les nombres entiers sans « .0 »). */
export function enTexte(c: Cellule | undefined): string {
  if (c === null || c === undefined) return "";
  if (typeof c === "number") return Number.isInteger(c) ? String(c) : String(c);
  return String(c).trim();
}

/** « Boom Bap, Jazz Rap ; Trap » → ["Boom Bap", "Jazz Rap", "Trap"]. Retours à la ligne acceptés aussi. */
export function enListe(c: Cellule | undefined): string[] {
  return enTexte(c)
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
