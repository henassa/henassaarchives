"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OeuvreJeu } from "@/lib/jeux";
import { FiltresJeuBarre, useFiltresJeu } from "./Filtres";
import { initiales } from "@/components/connexions/utils";

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
export function Mosaique({ o, cases, className = "" }: { o: Pick<OeuvreJeu, "titre" | "cover">; cases: number; className?: string }) {
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
    const T = 600;
    c.width = T;
    c.height = T;
    const x = c.getContext("2d")!;
    const k = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - k) / 2, sy = (img.naturalHeight - k) / 2;
    if (!cases) {
      x.imageSmoothingEnabled = true;
      x.drawImage(img, sx, sy, k, k, 0, 0, T, T);
      return;
    }
    // on réduit l'image à « cases » pixels, puis on la ré-agrandit sans lissage
    const petit = document.createElement("canvas");
    petit.width = cases;
    petit.height = cases;
    const p = petit.getContext("2d")!;
    p.imageSmoothingEnabled = true;
    p.drawImage(img, sx, sy, k, k, 0, 0, cases, cases);
    x.imageSmoothingEnabled = false;
    x.clearRect(0, 0, T, T);
    x.drawImage(petit, 0, 0, cases, cases, 0, 0, T, T);
  }, [img, cases]);

  if (rate) {
    // pas d'image : un point d'interrogation tant que c'est caché, les initiales une fois dévoilé
    return <div className={`mj-mosaique mj-mosaique--vide ${className}`}>{cases ? "?" : initiales(o)}</div>;
  }
  return <canvas ref={ref} className={`mj-mosaique ${className}`} role="img" aria-label={cases ? "Pochette cachée" : `Pochette : ${o.titre}`} />;
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
