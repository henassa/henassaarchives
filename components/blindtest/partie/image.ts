import { fondDegrade } from "@/components/jeux/commun";
import { classement, type EtatJeu } from "@/components/blindtest/lib/partie";

/*
 * L'image du résultat d'une partie, à télécharger (comme celle du Dilemme) :
 * fond noir à lueur verte, le podium, les autres joueurs, et les morceaux joués.
 */

const VERT = "#3FD68A";

/** Charge une pochette ; si Deezer ne permet pas de la dessiner, on s'en passe. */
function charger(src: string) {
  return new Promise<HTMLImageElement | null>((ok) => {
    if (!src) return ok(null);
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.referrerPolicy = "no-referrer";
    i.onload = () => ok(i);
    i.onerror = () => ok(null);
    i.src = src;
    setTimeout(() => ok(null), 4000);
  });
}

/** Coupe un texte trop long pour sa place, avec « … ». */
function tenir(x: CanvasRenderingContext2D, t: string, largeur: number) {
  if (x.measureText(t).width <= largeur) return t;
  let s = t;
  while (s.length > 1 && x.measureText(s + "…").width > largeur) s = s.slice(0, -1);
  return s.trimEnd() + "…";
}

export async function imageResultat(etat: EtatJeu) {
  const L = 1080, H = 1350, M = 72;
  const c = document.createElement("canvas");
  c.width = L;
  c.height = H;
  const x = c.getContext("2d")!;
  await document.fonts?.ready;
  fondDegrade(x, L, H, VERT);

  const joueurs = classement(etat);
  const manches = etat.historique.length;

  // en-tête
  x.textBaseline = "alphabetic";
  x.textAlign = "left";
  x.fillStyle = VERT;
  x.font = "800 24px Archivo, sans-serif";
  x.fillText(`BLINDTEST · ${manches} MANCHE${manches > 1 ? "S" : ""} · ${joueurs.length} JOUEUR${joueurs.length > 1 ? "S" : ""}`, M, M + 22);

  // le vainqueur, en grand
  const premier = joueurs[0];
  let y = 200;
  if (premier) {
    x.fillStyle = "#fff";
    let fs = 130;
    x.font = `400 ${fs}px Anton, Impact, sans-serif`;
    while (fs > 50 && x.measureText(premier.nom.toUpperCase()).width > L - M * 2) x.font = `400 ${--fs}px Anton, Impact, sans-serif`;
    x.fillText(premier.nom.toUpperCase(), M, y + fs * 0.8);
    y += fs * 0.8 + 50;
    x.fillStyle = VERT;
    x.font = "400 44px Anton, Impact, sans-serif";
    x.fillText(`${premier.points} PTS`, M, y);
    y += 60;
  }

  // les suivants
  x.font = "700 30px Archivo, sans-serif";
  for (const j of joueurs.slice(1, 8)) {
    x.fillStyle = "#a6a6a6";
    x.font = "400 30px Anton, Impact, sans-serif";
    x.fillText(String(j.rang), M, y);
    x.fillStyle = "#fff";
    x.font = "700 30px Archivo, sans-serif";
    x.fillText(tenir(x, j.nom, 560), M + 56, y);
    x.textAlign = "right";
    x.font = "400 30px Anton, Impact, sans-serif";
    x.fillText(`${j.points}`, L - M, y);
    x.textAlign = "left";
    y += 46;
  }
  if (joueurs.length > 8) {
    x.fillStyle = "#a6a6a6";
    x.font = "600 22px Archivo, sans-serif";
    x.fillText(`et ${joueurs.length - 8} autre${joueurs.length - 8 > 1 ? "s" : ""}`, M + 56, y);
    y += 40;
  }

  // les morceaux joués, en bas
  const morceaux = etat.historique.slice(0, 8);
  if (morceaux.length) {
    const T = 64, pas = T + 12;
    const yDebut = Math.max(y + 40, H - M - 70 - Math.ceil(morceaux.length / 2) * pas);
    x.fillStyle = "#a6a6a6";
    x.font = "800 18px Archivo, sans-serif";
    x.fillText(`LES MORCEAUX${etat.historique.length > morceaux.length ? ` (${morceaux.length} SUR ${etat.historique.length})` : ""}`, M, yDebut - 16);
    const images = await Promise.all(morceaux.map((m) => charger(m.pochette)));
    const largeurCol = (L - M * 2 - 24) / 2;
    morceaux.forEach((m, i) => {
      const cx = M + (i % 2) * (largeurCol + 24);
      const cy = yDebut + Math.floor(i / 2) * pas;
      const img = images[i];
      if (img) {
        const k = Math.min(img.naturalWidth, img.naturalHeight);
        x.drawImage(img, (img.naturalWidth - k) / 2, (img.naturalHeight - k) / 2, k, k, cx, cy, T, T);
      } else {
        x.fillStyle = "rgba(255, 255, 255, 0.06)";
        x.fillRect(cx, cy, T, T);
        x.fillStyle = VERT;
        x.font = "400 28px Anton, Impact, sans-serif";
        x.textAlign = "center";
        x.fillText(String(m.n), cx + T / 2, cy + T / 2 + 10);
        x.textAlign = "left";
      }
      x.fillStyle = "#fff";
      x.font = "400 24px Anton, Impact, sans-serif";
      x.fillText(tenir(x, m.titre.toUpperCase(), largeurCol - T - 16), cx + T + 14, cy + 28);
      x.fillStyle = "#a6a6a6";
      x.font = "600 18px Archivo, sans-serif";
      x.fillText(tenir(x, m.artiste, largeurCol - T - 16), cx + T + 14, cy + 54);
    });
  }

  // signature
  x.textAlign = "right";
  x.font = "44px UnifrakturMaguntia, serif";
  x.lineWidth = 1.2;
  x.strokeStyle = "#FF4D3D";
  x.strokeText("Henassa", L - M, H - M + 30);
  x.font = "400 34px Anton, Impact, sans-serif";
  x.lineWidth = 6;
  x.strokeStyle = "#030303";
  x.strokeText("HENASSA", L - M - 8, H - M + 32);
  x.fillStyle = "#fff";
  x.fillText("HENASSA", L - M - 8, H - M + 32);

  // les pochettes qui refusent d'être réutilisées n'ont pas été dessinées : l'image peut toujours être enregistrée
  const blob = await new Promise<Blob | null>((ok) => {
    try {
      c.toBlob(ok, "image/png");
    } catch {
      ok(null);
    }
  });
  if (!blob) throw new Error("image vide");
  return blob;
}
