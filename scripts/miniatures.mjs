// Fabrique une petite copie de chaque pochette, pour la mosaïque, la carte,
// la recherche et les mini-jeux. La grande pochette reste pour la fiche.
//
// Se lance tout seul avant « npm run dev » et « npm run build ».
// À la main :   node scripts/miniatures.mjs          (seulement ce qui a changé)
//               node scripts/miniatures.mjs --tout   (tout refaire)
//
// public/images/oeuvres/nas-illmatic.jpg  →  public/images/oeuvres/mini/nas-illmatic.webp
//
// Rien à faire de ton côté : tu déposes tes pochettes comme d'habitude.
// Si une miniature manque, le site affiche simplement la grande pochette.
import fs from "node:fs";
import path from "node:path";

/** Côté de la miniature en pixels (carrée, recadrée au centre). */
const TAILLE = 300;
/** Qualité WebP, de 1 à 100. */
const QUALITE = 76;

const EXTENSIONS = ["jpg", "jpeg", "png", "webp", "avif", "gif"];
const dossier = path.join(process.cwd(), "public", "images", "oeuvres");
const sortie = path.join(dossier, "mini");
const tout = process.argv.includes("--tout");

async function main() {
  if (!fs.existsSync(dossier)) return console.log("Miniatures : pas de dossier public/images/oeuvres, rien à faire.");

  let sharp;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    // Pas bloquant : sans miniatures, le site utilise les grandes pochettes.
    return console.log("Miniatures : l'outil « sharp » est absent (npm install sharp). Le site utilisera les grandes pochettes.");
  }

  fs.mkdirSync(sortie, { recursive: true });
  const sources = fs.readdirSync(dossier).filter((f) => EXTENSIONS.includes(path.extname(f).slice(1).toLowerCase()));
  const attendues = new Set();
  let faites = 0, avant = 0, apres = 0;
  const ratees = [];

  for (const f of sources) {
    const nom = f.slice(0, f.lastIndexOf("."));
    const src = path.join(dossier, f);
    const dst = path.join(sortie, nom + ".webp");
    attendues.add(nom + ".webp");
    // déjà faite et plus récente que la pochette : on passe
    if (!tout && fs.existsSync(dst) && fs.statSync(dst).mtimeMs >= fs.statSync(src).mtimeMs) continue;
    try {
      await sharp(src).rotate().resize(TAILLE, TAILLE, { fit: "cover", withoutEnlargement: true }).webp({ quality: QUALITE }).toFile(dst);
      faites++;
      avant += fs.statSync(src).size;
      apres += fs.statSync(dst).size;
    } catch (e) {
      ratees.push(`${f} (${e.message})`);
      fs.rmSync(dst, { force: true });
    }
  }

  // Miniatures dont la pochette a été supprimée ou renommée
  let retirees = 0;
  for (const f of fs.readdirSync(sortie)) {
    if (f.endsWith(".webp") && !attendues.has(f)) {
      fs.unlinkSync(path.join(sortie, f));
      retirees++;
    }
  }

  const ko = (n) => Math.round(n / 1024);
  if (faites) console.log(`Miniatures : ${faites} fabriquée(s), ${ko(apres / faites)} Ko en moyenne au lieu de ${ko(avant / faites)} Ko.`);
  else console.log(`Miniatures : à jour (${attendues.size}).`);
  if (retirees) console.log(`Miniatures : ${retirees} retirée(s), leur pochette n'existe plus.`);
  for (const r of ratees) console.log(`Miniatures : image illisible, ignorée : ${r}`);
}

// Quoi qu'il arrive, on ne bloque jamais le lancement du site.
main().catch((e) => console.log("Miniatures : ignorées (" + e.message + ")."));
