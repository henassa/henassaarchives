// Allège les images trop lourdes de public/images (articles, fonds, pochettes).
//
// À lancer quand tu ajoutes des images :   npm run images
// (ou : node scripts/alleger-images.mjs)
//
// Pour chaque JPEG / PNG / WebP de plus de 400 Ko :
//   - réduit sa taille si elle dépasse le maximum utile sur le site
//     (fonds : 2400 px de large, images d'articles : 2000 px, pochettes : 1200 px) ;
//   - le ré-enregistre en qualité 82 (invisible à l'œil), sans les métadonnées de l'appareil photo ;
//   - garde le même nom et le même format : rien à changer dans tes articles.
// L'original est d'abord copié dans « images-originales/ » à la racine du projet
// (hors du site, donc pas mis en ligne), au cas où tu voudrais le récupérer.
// Une image n'est remplacée que si le résultat est vraiment plus léger.
import fs from "node:fs";
import path from "node:path";

const RACINE = process.cwd();
const DOSSIER = path.join(RACINE, "public", "images");
const SAUVEGARDE = path.join(RACINE, "images-originales");
const SEUIL = 400 * 1024; // en dessous, on n'y touche pas
const QUALITE = 82;

let sharp;
try {
  sharp = (await import("sharp")).default;
} catch {
  console.log("L'outil « sharp » est introuvable. Lance « npm install sharp » puis recommence.");
  process.exit(1);
}
// Sous Windows, sharp garde sinon les fichiers ouverts et on ne peut plus les réécrire
sharp.cache(false);

/** Largeur maximale utile selon le type d'image. */
function largeurMax(fichier) {
  const rel = path.relative(DOSSIER, fichier).replace(/\\/g, "/");
  if (rel.startsWith("oeuvres/")) return 1200;
  if (/fond/i.test(path.basename(fichier))) return 2400;
  return 2000;
}

const fichiers = [];
const parcourir = (d) => {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) {
      if (f.name !== "mini") parcourir(p); // les miniatures sont déjà petites
    } else if (/\.(jpe?g|png|webp)$/i.test(f.name)) fichiers.push(p);
  }
};
if (!fs.existsSync(DOSSIER)) {
  console.log("Dossier public/images introuvable : lance la commande depuis le dossier du projet.");
  process.exit(1);
}
parcourir(DOSSIER);

const ko = (n) => `${Math.round(n / 1024)} Ko`;
let avantTotal = 0, apresTotal = 0, faites = 0;
for (const f of fichiers) {
  const avant = fs.statSync(f).size;
  if (avant <= SEUIL) continue;
  const ext = path.extname(f).toLowerCase();
  // on lit le fichier en mémoire : il n'est plus verrouillé quand on le réécrit
  const img = sharp(fs.readFileSync(f)).rotate().resize({ width: largeurMax(f), withoutEnlargement: true });
  const sortie =
    ext === ".png" ? img.png({ compressionLevel: 9, palette: true, quality: 90 })
    : ext === ".webp" ? img.webp({ quality: QUALITE })
    : img.jpeg({ quality: QUALITE, mozjpeg: true, progressive: true });
  const tampon = await sortie.toBuffer();
  if (tampon.length > avant * 0.9) continue; // pas assez de gain : on garde l'original
  const copie = path.join(SAUVEGARDE, path.relative(DOSSIER, f));
  if (!fs.existsSync(copie)) {
    fs.mkdirSync(path.dirname(copie), { recursive: true });
    fs.copyFileSync(f, copie);
  }
  try {
    fs.writeFileSync(f, tampon);
  } catch (e) {
    console.log(`  ${path.relative(RACINE, f)} : impossible de la réécrire (${e.code}). Est-elle ouverte dans un autre logiciel ? Ferme-le et relance.`);
    continue;
  }
  avantTotal += avant;
  apresTotal += tampon.length;
  faites++;
  console.log(`  ${path.relative(RACINE, f)} : ${ko(avant)} → ${ko(tampon.length)}`);
}

if (!faites) console.log("Rien à alléger : toutes les images font déjà moins de 400 Ko (ou sont déjà optimisées).");
else console.log(`\n${faites} image(s) allégée(s) : ${ko(avantTotal)} → ${ko(apresTotal)}. Originaux gardés dans images-originales/.`);
