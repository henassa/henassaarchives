// Passe les images d'articles du PNG au JPEG, sans rien casser.
//
// À lancer une fois, depuis le dossier du projet :   node scripts/passer-en-jpg.mjs
//
// Pour chaque image de public/images qui existe à la fois en .png et en .jpg :
//   1. remplace « /images/nom.png » par « /images/nom.jpg » dans les articles,
//      dans la playlist, dans les connexions et dans lib/fond.ts ;
//   2. supprime l'ancien .png.
// Les pochettes (public/images/oeuvres) ne sont pas touchées.
import fs from "node:fs";
import path from "node:path";

const racine = process.cwd();
const dossier = path.join(racine, "public", "images");
if (!fs.existsSync(dossier)) {
  console.error("Dossier public/images introuvable : lance le script depuis le dossier du projet.");
  process.exit(1);
}

const noms = fs
  .readdirSync(dossier)
  .filter((f) => f.toLowerCase().endsWith(".jpg"))
  .map((f) => f.slice(0, -4))
  .filter((n) => fs.existsSync(path.join(dossier, n + ".png")));
if (!noms.length) {
  console.log("Rien à faire : aucune image n'existe à la fois en .png et en .jpg dans public/images.");
  process.exit(0);
}

// Fichiers où une image peut être citée
const cibles = [];
const parcourir = (d) => {
  if (!fs.existsSync(d)) return;
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) parcourir(p);
    else if (/\.(mdx?|json)$/.test(f.name)) cibles.push(p);
  }
};
parcourir(path.join(racine, "content"));
for (const f of ["lib/fond.ts"]) if (fs.existsSync(path.join(racine, f))) cibles.push(path.join(racine, f));

let remplacements = 0;
for (const fichier of cibles) {
  const avant = fs.readFileSync(fichier, "utf8");
  let apres = avant;
  for (const n of noms) apres = apres.split(`/images/${n}.png`).join(`/images/${n}.jpg`);
  if (apres !== avant) {
    fs.writeFileSync(fichier, apres);
    const nb = noms.reduce((t, n) => t + (avant.split(`/images/${n}.png`).length - 1), 0);
    remplacements += nb;
    console.log(`  ${path.relative(racine, fichier)} : ${nb} lien(s) mis à jour`);
  }
}

let gagne = 0;
for (const n of noms) {
  const png = path.join(dossier, n + ".png");
  gagne += fs.statSync(png).size - fs.statSync(path.join(dossier, n + ".jpg")).size;
  fs.unlinkSync(png);
}
console.log(`\n${noms.length} image(s) passée(s) en JPEG, ${remplacements} lien(s) mis à jour, ${(gagne / 1e6).toFixed(1)} Mo gagnés.`);
