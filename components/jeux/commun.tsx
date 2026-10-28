"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OeuvreJeu } from "@/lib/jeux";
import { FiltresJeuBarre, useFiltresJeu } from "./Filtres";
import { enPortrait, initiales, ratioPochette } from "@/components/connexions/utils";

/* Outils partagés par « Le mot » et « Devine l'œuvre ». */

/** Date du jour chez le visiteur : 2026-10-02. */
export function jourLocal(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 02.10.2026 */
export function jourLisible(jour: string) {
  const [a, m, j] = jour.split("-");
  return `${j}.${m}.${a}`;
}

/**
 * L'œuvre du jour : la même pour tout le monde, différente chaque jour.
 * « sel » décale le tirage d'un jeu à l'autre pour qu'ils ne tombent pas sur la même œuvre.
 */
export function indexDuJour(jour: string, n: number, sel: number) {
  if (n <= 0) return 0;
  const [a, m, j] = jour.split("-").map(Number);
  const numero = Math.floor(Date.UTC(a!, m! - 1, j!) / 86400000) + sel * 7919;
  // mélange simple mais stable du numéro du jour
  let h = numero >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = (h ^ (h >>> 16)) >>> 0;
  return h % n;
}

export function lire<T>(cle: string): T | null {
  try {
    const v = localStorage.getItem(cle);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
export function ecrire(cle: string, valeur: unknown) {
  try {
    localStorage.setItem(cle, JSON.stringify(valeur));
  } catch {
    /* stockage indisponible : la partie ne sera pas gardée */
  }
}

/** Copie un texte ; renvoie false si le navigateur refuse. */
export async function copier(texte: string) {
  try {
    await navigator.clipboard.writeText(texte);
    return true;
  } catch {
    return false;
  }
}

/**
 * Pochette en mosaïque : « cases » carrés par côté (peu de cases = très flou).
 * cases = 0 affiche la pochette nette.
 */
export function Mosaique({ o, cases, className = "" }: { o: Pick<OeuvreJeu, "titre" | "cover"> & { type?: string }; cases: number; className?: string }) {
  // affiche de film : 2:3 au lieu du carré
  const portrait = enPortrait(o.type);
  const jeu = o.type === "jeu";
  const ratioImage = ratioPochette(o.type);
  const ref = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [rate, setRate] = useState(false);

  useEffect(() => {
    setImg(null);
    setRate(false);
    if (!o.cover) {
      setRate(true);
      return;
    }
    const i = new Image();
    i.onload = () => setImg(i);
    i.onerror = () => setRate(true);
    i.src = o.cover;
    return () => {
      i.onload = null;
      i.onerror = null;
    };
  }, [o.cover]);

  useEffect(() => {
    const c = ref.current;
    if (!c || !img) return;
    // carré (600 × 600), affiche 2:3 (600 × 900) ou jaquette de jeu 3:4 (600 × 800)
    const L = 600, H = Math.round(600 / ratioImage);
    c.width = L;
    c.height = H;
    const x = c.getContext("2d")!;
    // la partie de l'image à garder, au centre, dans le bon format
    const ratio = L / H;
    const sw = Math.min(img.naturalWidth, img.naturalHeight * ratio);
    const sh = sw / ratio;
    const sx = (img.naturalWidth - sw) / 2, sy = (img.naturalHeight - sh) / 2;
    if (!cases) {
      x.imageSmoothingEnabled = true;
      x.drawImage(img, sx, sy, sw, sh, 0, 0, L, H);
      return;
    }
    // on réduit l'image à « cases » pixels de large, puis on la ré-agrandit sans lissage
    const cl = cases, ch = Math.max(1, Math.round(cases / ratio));
    const petit = document.createElement("canvas");
    petit.width = cl;
    petit.height = ch;
    const p = petit.getContext("2d")!;
    p.imageSmoothingEnabled = true;
    p.drawImage(img, sx, sy, sw, sh, 0, 0, cl, ch);
    x.imageSmoothingEnabled = false;
    x.clearRect(0, 0, L, H);
    x.drawImage(petit, 0, 0, cl, ch, 0, 0, L, H);
  }, [img, cases, ratioImage]);

  if (rate) {
    // pas d'image : un point d'interrogation tant que c'est caché, les initiales une fois dévoilé
    return <div className={`mj-mosaique mj-mosaique--vide${portrait ? " mj-mosaique--portrait" : ""}${jeu ? " mj-mosaique--jeu" : ""} ${className}`}>{cases ? "?" : initiales(o)}</div>;
  }
  return <canvas ref={ref} className={`mj-mosaique${portrait ? " mj-mosaique--portrait" : ""}${jeu ? " mj-mosaique--jeu" : ""} ${className}`} role="img" aria-label={cases ? "Pochette cachée" : `Pochette : ${o.titre}`} />;
}

export type Mode = "jour" | "libre";

/**
 * Gère le choix de l'œuvre à trouver : l'œuvre du jour, ou une partie libre
 * tirée au hasard parmi les filtres choisis (univers, genre, sous-genre, années).
 */
export function useOeuvreATrouver(oeuvres: OeuvreJeu[], eligibles: (o: OeuvreJeu) => boolean, sel: number) {
  const [mode, setMode] = useState<Mode>("jour");
  const [jour, setJour] = useState<string | null>(null); // connu seulement côté navigateur
  const [libre, setLibre] = useState<string | null>(null);
  /** Change à chaque nouvelle partie libre, pour remettre le jeu à zéro. */
  const [manche, setManche] = useState(0);

  useEffect(() => setJour(jourLocal()), []);

  const jouables = useMemo(() => oeuvres.filter(eligibles).sort((a, b) => a.cle.localeCompare(b.cle)), [oeuvres, eligibles]);
  const filtres = useFiltresJeu(jouables);
  const vivier = filtres.vivier;

  const tirer = useCallback(() => {
    if (!vivier.length) return;
    let o = vivier[Math.floor(Math.random() * vivier.length)]!;
    // évite de retomber deux fois de suite sur la même
    if (vivier.length > 1) while (o.cle === libre) o = vivier[Math.floor(Math.random() * vivier.length)]!;
    setLibre(o.cle);
    setManche((m) => m + 1);
  }, [vivier, libre]);

  const cible = useMemo(() => {
    if (mode === "jour") return jour && jouables.length ? jouables[indexDuJour(jour, jouables.length, sel)]! : null;
    return jouables.find((o) => o.cle === libre) ?? null;
  }, [mode, jour, jouables, libre, sel]);

  const changerMode = (m: Mode) => {
    setMode(m);
    if (m === "libre" && !libre) tirer();
  };

  return { mode, changerMode, filtres, vivier, tirer, cible, jour, manche, nbJouables: jouables.length };
}

/** Bandeau « Du jour / Partie libre » + filtres de la partie libre. */
export function ChoixPartie({ j, id }: { j: ReturnType<typeof useOeuvreATrouver>; id: string }) {
  return (
    <div className="mj-choix">
      <div className="switch" role="group" aria-label="Type de partie">
        <button type="button" className={`switch__btn${j.mode === "jour" ? " is-on" : ""}`} aria-pressed={j.mode === "jour"} onClick={() => j.changerMode("jour")}>
          Du jour
        </button>
        <button type="button" className={`switch__btn${j.mode === "libre" ? " is-on" : ""}`} aria-pressed={j.mode === "libre"} onClick={() => j.changerMode("libre")}>
          Partie libre
        </button>
      </div>
      {j.mode === "jour" && j.jour && <span className="mj-date">{jourLisible(j.jour)}</span>}
      {j.mode === "libre" && (
        <>
          {/* blur : sinon la touche Entrée, pendant la partie, relancerait ce bouton */}
          <button
            type="button"
            className="ctrl-btn ctrl-btn--text"
            onClick={(e) => {
              e.currentTarget.blur();
              j.tirer();
            }}
            disabled={!j.vivier.length}
          >
            Nouvelle œuvre
          </button>
          <span className="mj-date">
            {j.vivier.length} œuvre{j.vivier.length > 1 ? "s" : ""} possible{j.vivier.length > 1 ? "s" : ""}
          </span>
          <div className="mj-choix__filtres">
            <FiltresJeuBarre f={j.filtres} id={id} />
          </div>
        </>
      )}
    </div>
  );
}

/** Pastille d'un joueur : son initiale, dans une couleur tirée de son pseudo (toujours la même). */
/** La teinte (0 à 360) attachée à un pseudo. */
export function teinteDe(nom: string) {
  let h = 0;
  for (const c of nom) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

export function Avatar({ nom }: { nom: string }) {
  const h = teinteDe(nom);
  return (
    <span className="jeu-avatar" aria-hidden="true" style={{ ["--teinte" as string]: h }}>
      {[...nom.trim()][0]?.toUpperCase() ?? "?"}
    </span>
  );
}

/**
 * Fond d'une image à télécharger, comme celui du site : un noir profond avec
 * une lueur de la couleur donnée, et un bruit très fin qui évite les « marches » du dégradé.
 */
export function fondDegrade(x: CanvasRenderingContext2D, L: number, H: number, couleur: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(couleur.slice(i, i + 2), 16));
  const rgba = (a: number) => `rgba(${r}, ${g}, ${b}, ${a})`;
  x.fillStyle = "#030303";
  x.fillRect(0, 0, L, H);
  const lueur = (cx: number, cy: number, rayon: number, force: number) => {
    const d = x.createRadialGradient(cx, cy, 0, cx, cy, rayon);
    d.addColorStop(0, rgba(force));
    d.addColorStop(0.55, rgba(force * 0.35));
    d.addColorStop(1, rgba(0));
    x.fillStyle = d;
    x.fillRect(0, 0, L, H);
  };
  lueur(0, 0, Math.max(L, H) * 0.95, 0.2);
  lueur(L, H, Math.max(L, H) * 0.8, 0.12);
  // tramage : ±2 niveaux au hasard sur chaque pixel
  const img = x.getImageData(0, 0, L, H);
  const p = img.data;
  for (let i = 0; i < p.length; i += 4) {
    const n = (Math.random() - 0.5) * 4;
    p[i] = Math.max(0, Math.min(255, p[i]! + n));
    p[i + 1] = Math.max(0, Math.min(255, p[i + 1]! + n));
    p[i + 2] = Math.max(0, Math.min(255, p[i + 2]! + n));
  }
  x.putImageData(img, 0, 0);
}
