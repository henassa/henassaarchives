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

/** Largeur de la miniature en pixels. */
const TAILLE = 300;
/**
 * Format de la miniature : carrée pour une pochette (300 × 300) ; une affiche de film
 * ou une jaquette de jeu garde son format (300 × 450, 300 × 425…). Une image nettement
 * plus haute que large est une affiche.
 */
const SEUIL_PORTRAIT = 1.2;
// une affiche ou une jaquette garde son format exact (2:3 pour un film, 264:374 pour un jeu…), jusqu'à 1:2 au plus
const formatDe = (l, h) => (h / l >= SEUIL_PORTRAIT ? { l: TAILLE, h: Math.round(TAILLE * Math.min(2, h / l)) } : { l: TAILLE, h: TAILLE });
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

  // Sous Windows, sharp garde les fichiers ouverts dans son cache : on le coupe,
  // sinon il refuse ensuite de réécrire une miniature qu'il vient de lire.
  sharp.cache(false);

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
    try {
      // format voulu d'après l'image d'origine (orientation de l'appareil photo comprise)
      const m = await sharp(src).metadata();
      const tourne = (m.orientation ?? 1) >= 5;
      const f = formatDe(tourne ? m.height : m.width, tourne ? m.width : m.height);
      // déjà faite, plus récente que la pochette et au bon format : on passe
      // (les anciennes miniatures carrées des affiches sont refaites en 2:3)
      if (!tout && fs.existsSync(dst) && fs.statSync(dst).mtimeMs >= fs.statSync(src).mtimeMs) {
        // lue depuis la mémoire, pour ne pas garder le fichier ouvert
        const d = await sharp(fs.readFileSync(dst)).metadata();
        if (Math.abs(d.height / d.width - f.h / f.l) < 0.05) continue;
      }
      await sharp(src).rotate().resize(f.l, f.h, { fit: "cover", withoutEnlargement: true }).webp({ quality: QUALITE }).toFile(dst);
      faites++;
      avant += fs.statSync(src).size;
      apres += fs.statSync(dst).size;
    } catch (e) {
      ratees.push(`${f} (${e.message})`);
      try {
        fs.rmSync(dst, { force: true });
      } catch {
        /* fichier bloqué : on le laisse, il sera refait au prochain lancement */
      }
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
