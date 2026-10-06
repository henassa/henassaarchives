"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Lien, Oeuvre } from "@/lib/oeuvres";
import { REGLAGES, normTag } from "@/lib/liens-auto";
import { SECTIONS, TYPES_OEUVRE } from "@/lib/sections";
import { initiales } from "./utils";

/*
 * La Toile, en deux vues, dessinées sur un canvas.
 *
 * CARTE : un îlot par genre, découpé en sous-îlots selon le 1er sous-genre.
 *   Pour rester lisible, on ne trace que les liens les plus forts de chaque
 *   œuvre (LIENS_PAR_OEUVRE_CARTE). Survoler une œuvre allume tous ses liens.
 *   En couleur : les liens qui relient deux genres différents (les « ponts »).
 *
 * ORBITE : une œuvre au centre, ses connexions en orbite autour.
 *   Plus une œuvre est proche du centre, plus le lien est fort. Les fils
 *   n'apparaissent qu'au survol.
 *   Cliquer une œuvre en orbite la fait passer au centre.
 */

export type ModeToile = "carte" | "orbite";

/**
 * Liens toujours visibles sur la Carte : les N plus forts de chaque œuvre.
 * 0 = aucun fil au repos, on ne voit les liens qu'en survolant une œuvre.
 */
const LIENS_PAR_OEUVRE_CARTE = 0;
/** Taille d'une pochette sur la Carte (px à zoom 1). */
const TUILE_CARTE = 22;
/** Écart entre pochettes dans un sous-îlot (px à zoom 1). */
const ECART_POCHETTES = 17;
/** Le nom d'un genre ne s'affiche sur la Carte qu'à partir de ce nombre d'œuvres. */
const MIN_ALBUMS_NOM_GENRE = 50;
/** Écart entre deux îlots de genres différents. */
const ECART_ILOTS = 70;
/**
 * Carte : force qui ramène les îlots vers le centre (0 à 1).
 * Plus bas = les genres proches se collent davantage, quitte à étaler la carte.
 */
const RAPPEL_CENTRE = 0.35;
/**
 * Anneaux de l'Orbite, selon l'écart entre le score du lien et le seuil :
 * 1er anneau ≥ seuil + 8, 2e ≥ seuil + 4, 3e pour le reste.
 */
const PALIERS_ORBITE = [8, 4];
/** Nombre max d'œuvres en orbite (les plus fortes). Les autres restent dans la fiche. */
const MAX_ORBITE = 36;

const ACCENT = SECTIONS.connexions.couleur;
const BG = "#0a0a0a";
const MUTED = "#9a9a9a";
const ANGLE_OR = 2.39996323;

type Voisin = { id: number; score: number; communs: string[] };
type Ilot = { nom: string; n: number; r: number; x: number; y: number; subs: SousIlot[] };
type SousIlot = { nom: string; genre: string; list: Oeuvre[]; r: number; x: number; y: number; cx: number; cy: number };
type Pos = { x: number; y: number; s: number; a: number };

function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Range des cercles en spirale sans chevauchement, le plus gros au centre. */
function packer<T extends { r: number; x: number; y: number }>(items: T[], pad: number) {
  items.sort((a, b) => b.r - a.r);
  const places: T[] = [];
  for (const it of items) {
    if (!places.length) {
      it.x = 0;
      it.y = 0;
    } else {
      for (let t = 0; t < 4000; t += 0.08) {
        const rr = 6 * t;
        const x = rr * Math.cos(t);
        const y = rr * Math.sin(t);
        if (places.every((p) => Math.hypot(p.x - x, p.y - y) >= p.r + it.r + pad)) {
          it.x = x;
          it.y = y;
          break;
        }
      }
    }
    places.push(it);
  }
  let R = 0;
  for (const p of places) R = Math.max(R, Math.hypot(p.x, p.y) + p.r);
  return R;
}

/**
 * Ressemblance entre deux genres (0 à 1), d'après les tags de leurs œuvres :
 * un genre dont les œuvres portent souvent « Neo-Soul » ou « R&B » en sous-genre
 * ressemble à ces genres-là.
 */
function affinitesGenres(genres: Map<string, Map<string, Oeuvre[]>>) {
  const profils = new Map<string, Map<string, number>>();
  for (const [g, m] of genres) {
    const p = new Map<string, number>();
    let n = 0;
    for (const list of m.values())
      for (const o of list) {
        n++;
        for (const t of new Set([g, ...(o.sousGenres ?? [])].map(normTag))) if (t) p.set(t, (p.get(t) ?? 0) + 1);
      }
    let norme = 0;
    for (const [t, v] of p) {
      p.set(t, v / n);
      norme += (v / n) ** 2;
    }
    norme = Math.sqrt(norme) || 1;
    for (const [t, v] of p) p.set(t, v / norme);
    profils.set(g, p);
  }
  return (a: string, b: string) => {
    const pa = profils.get(a), pb = profils.get(b);
    if (!pa || !pb) return 0;
    let s = 0;
    for (const [t, v] of pa) s += v * (pb.get(t) ?? 0);
    return s;
  };
}

/**
 * Range les îlots sans chevauchement, le plus gros au centre, en rapprochant
 * ceux qui se ressemblent : chaque îlot prend, parmi les places libres, celle
 * qui le met au plus près de ses genres voisins.
 */
function packerParAffinite(items: Ilot[], pad: number, aff: (a: string, b: string) => number) {
  items.sort((a, b) => b.r - a.r || a.nom.localeCompare(b.nom));
  const libre = (it: Ilot, x: number, y: number, autres: Ilot[]) => autres.every((p) => Math.hypot(p.x - x, p.y - y) >= p.r + it.r + pad);
  const placer = (it: Ilot, autres: Ilot[]) => {
    if (!autres.length) {
      it.x = 0;
      it.y = 0;
      return;
    }
    const poids = autres.map((p) => aff(it.nom, p.nom) ** 2);
    const total = poids.reduce((a, b) => a + b, 0);
    let bord = 0;
    for (const p of autres) bord = Math.max(bord, Math.hypot(p.x, p.y) + p.r);
    const limite = bord + it.r + pad + 60;
    let mieux = Infinity;
    for (let t = 0; 6 * t <= limite; t += 0.05) {
      const x = 6 * t * Math.cos(t), y = 6 * t * Math.sin(t);
      if (!libre(it, x, y, autres)) continue;
      // distance moyenne aux genres proches + un peu de rappel vers le centre pour rester compact
      let c = RAPPEL_CENTRE * Math.hypot(x, y);
      if (total > 0) autres.forEach((p, k) => (c += (poids[k]! / total) * Math.max(0, Math.hypot(p.x - x, p.y - y) - p.r - it.r)));
      if (c < mieux) {
        mieux = c;
        it.x = x;
        it.y = y;
      }
    }
  };
  const places: Ilot[] = [];
  for (const it of items) {
    placer(it, places);
    places.push(it);
  }
  // Quelques passes de retouche : chaque îlot est replacé en connaissant tous les autres
  for (let passe = 0; passe < 3; passe++) for (const it of items.slice(1)) placer(it, items.filter((p) => p !== it));
}

/** Positions de la Carte : ne dépendent que des œuvres, pas des liens. */
function construireCarte(oeuvres: Oeuvre[]) {
  const genres = new Map<string, Map<string, Oeuvre[]>>();
  for (const o of oeuvres) {
    const g = o.genre?.trim() || "Sans genre";
    const sg = o.sousGenres?.[0]?.trim() || g;
    if (!genres.has(g)) genres.set(g, new Map());
    const m = genres.get(g)!;
    if (!m.has(sg)) m.set(sg, []);
    m.get(sg)!.push(o);
  }
  const ilots: Ilot[] = [];
  for (const [nom, m] of genres) {
    const subs: SousIlot[] = [...m].map(([sn, list]) => ({
      nom: sn,
      genre: nom,
      list,
      r: ECART_POCHETTES * Math.sqrt(list.length) + 16,
      x: 0,
      y: 0,
      cx: 0,
      cy: 0,
    }));
    const R = packer(subs, 10);
    ilots.push({ nom, subs, r: R + 26, n: subs.reduce((a, s) => a + s.list.length, 0), x: 0, y: 0 });
  }
  packerParAffinite(ilots, ECART_ILOTS, affinitesGenres(genres));
  const pos = new Map<number, { x: number; y: number }>();
  for (const il of ilots)
    for (const s of il.subs) {
      s.cx = il.x + s.x;
      s.cy = il.y + s.y;
      const list = [...s.list].sort((a, b) => (a.sousGenres?.[1] ?? "").localeCompare(b.sousGenres?.[1] ?? ""));
      list.forEach((o, k) => {
        const rr = list.length > 1 ? ECART_POCHETTES * Math.sqrt(k + 0.5) : 0;
        pos.set(o.id, { x: s.cx + rr * Math.cos(k * ANGLE_OR), y: s.cy + rr * Math.sin(k * ANGLE_OR) });
      });
    }
  return { ilots, pos };
}

export function Toile({
  oeuvres,
  liens,
  mode,
  centreId,
  selectedId,
  panneauOuvert,
  onSelect,
}: {
  oeuvres: Oeuvre[];
  liens: Lien[];
  mode: ModeToile;
  /** Œuvre au centre de l'Orbite. */
  centreId: number | null;
  selectedId: number | null;
  /** La fiche est ouverte à droite : l'Orbite se décale pour rester visible. */
  panneauOuvert: boolean;
  onSelect: (id: number) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  const byId = useMemo(() => new Map(oeuvres.map((o) => [o.id, o])), [oeuvres]);
  const carte = useMemo(() => construireCarte(oeuvres), [oeuvres]);

  // Voisins triés du lien le plus fort au plus faible
  const adj = useMemo(() => {
    const m = new Map<number, Voisin[]>();
    const add = (a: number, b: number, l: Lien) => {
      if (!m.has(a)) m.set(a, []);
      // Lien manuel sans score : placé au milieu
      m.get(a)!.push({ id: b, score: l.score ?? REGLAGES.seuil + PALIERS_ORBITE[1]!, communs: l.communs ?? [] });
    };
    for (const l of liens) {
      if (!byId.has(l.a) || !byId.has(l.b)) continue;
      add(l.a, l.b, l);
      add(l.b, l.a, l);
    }
    for (const v of m.values()) v.sort((x, y) => y.score - x.score);
    return m;
  }, [liens, byId]);

  // Liens tracés sur la Carte : les plus forts de chaque œuvre
  const ossature = useMemo(() => {
    const vus = new Set<string>();
    const out: { a: number; b: number; score: number }[] = [];
    for (const [a, v] of adj)
      for (const e of v.slice(0, LIENS_PAR_OEUVRE_CARTE)) {
        const k = a < e.id ? `${a}-${e.id}` : `${e.id}-${a}`;
        if (vus.has(k)) continue;
        vus.add(k);
        out.push({ a, b: e.id, score: e.score });
      }
    return out;
  }, [adj]);

  // Refs lues par la boucle de dessin
  const st = useRef({
    mode,
    centreId,
    selectedId,
    hover: null as number | null,
    view: { x: 0, y: 0, k: 1 },
    cibleView: { x: 0, y: 0, k: 1 },
    viewPrete: false,
    cible: new Map<number, Pos & { score?: number }>(),
    disp: new Map<number, Pos>(),
    anneaux: [] as { ra: number; rb: number; min: number }[],
    reste: 0,
    centre: { x: 0, y: 0 },
  });
  st.current.mode = mode;
  st.current.selectedId = selectedId;
  const donnees = useRef({ byId, carte, adj, ossature });
  donnees.current = { byId, carte, adj, ossature };

  const images = useRef(new Map<number, HTMLImageElement>());
  useEffect(() => {
    for (const o of oeuvres) {
      if (!o.cover || images.current.has(o.id)) continue;
      const img = new Image();
      // sur la carte les pochettes font 60 px au plus : la miniature suffit
      img.src = o.mini ?? o.cover;
      images.current.set(o.id, img);
    }
  }, [oeuvres]);

  // Taille du canvas = taille du conteneur
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => {
      const r = entry!.contentRect;
      setSize({ w: Math.max(300, Math.round(r.width)), h: Math.max(360, Math.round(r.height)) });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  /* ---------- Carte : cadrage ---------- */
  const toutVoir = useCallback(
    (immediat = false) => {
      const { ilots } = donnees.current.carte;
      if (!ilots.length) return;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const il of ilots) {
        x0 = Math.min(x0, il.x - il.r);
        x1 = Math.max(x1, il.x + il.r);
        y0 = Math.min(y0, il.y - il.r - 50);
        y1 = Math.max(y1, il.y + il.r);
      }
      const k = Math.min(3, (size.w - 40) / (x1 - x0), (size.h - 80) / (y1 - y0));
      const v = { k, x: size.w / 2 - (k * (x0 + x1)) / 2, y: size.h / 2 + 10 - (k * (y0 + y1)) / 2 };
      st.current.cibleView = v;
      if (immediat) st.current.view = { ...v };
    },
    [size.w, size.h]
  );

  useEffect(() => {
    toutVoir(!st.current.viewPrete);
    st.current.viewPrete = true;
  }, [carte, toutVoir]);

  const zoomer = useCallback((f: number, px?: number, py?: number) => {
    const v = st.current.cibleView;
    const cx = px ?? size.w / 2;
    const cy = py ?? size.h / 2;
    const k = Math.max(0.2, Math.min(6, v.k * f));
    const r = k / v.k;
    st.current.cibleView = { k, x: cx - (cx - v.x) * r, y: cy - (cy - v.y) * r };
  }, [size.w, size.h]);

  /* ---------- Orbite : placement ---------- */
  useEffect(() => {
    const s = st.current;
    s.centreId = centreId;
    s.cible = new Map();
    s.anneaux = [];
    if (centreId === null || !byId.has(centreId)) return;

    // Zone visible : si la fiche est ouverte à droite, on centre sur ce qui reste
    let largeur = size.w;
    const rect = wrapRef.current?.getBoundingClientRect();
    if (panneauOuvert && rect && window.innerWidth > 860) {
      largeur = Math.max(320, Math.min(size.w, window.innerWidth - Math.min(460, window.innerWidth) - rect.left));
    }
    const cx = largeur / 2;
    const cy = size.h / 2 - 6;
    s.centre = { x: cx, y: cy };
    s.reste = 0;
    const tous = adj.get(centreId) ?? [];
    // Trop de voisins : on garde les plus forts, la fiche liste le reste
    const v = tous.slice(0, MAX_ORBITE);
    s.reste = tous.length - v.length;

    // Taille des pochettes selon la place et le nombre de voisins
    let taille = Math.max(34, Math.min(60, Math.min(largeur, size.h) * 0.075));
    // Demi-axes de l'anneau extérieur (on garde de la place pour les titres)
    const axes = () => ({ a: largeur / 2 - 80, b: size.h / 2 - taille / 2 - 46 });
    const fractions = [0.42, 0.71, 1];
    const caps = () => {
      const { a, b } = axes();
      return fractions.map((f) => Math.max(1, Math.floor(Math.min((2 * Math.PI * a * f) / 140, (2 * Math.PI * b * f) / (taille + 40)))));
    };
    while (taille > 26 && caps().reduce((x, y) => x + y, 0) < v.length) taille -= 2;
    const { a: A, b: B } = axes();
    s.cible.set(centreId, { x: cx, y: cy, s: Math.min(120, B * 0.34), a: 1 });
    if (!v.length) return;

    const seuil = REGLAGES.seuil;
    const groupes: (Voisin & { ideal: number })[][] = [[], [], []];
    // Ordre autour du cercle : par genre puis 1er sous-genre, pour que les proches se suivent
    const ordre = [...v].sort((a, b) => {
      const X = byId.get(a.id)!, Y = byId.get(b.id)!;
      return (X.genre ?? "").localeCompare(Y.genre ?? "") || (X.sousGenres?.[0] ?? "").localeCompare(Y.sousGenres?.[0] ?? "") || b.score - a.score;
    });
    ordre.forEach((e, k) => {
      const anneau = e.score >= seuil + PALIERS_ORBITE[0]! ? 0 : e.score >= seuil + PALIERS_ORBITE[1]! ? 1 : 2;
      groupes[anneau]!.push({ ...e, ideal: (k / ordre.length) * Math.PI * 2 - Math.PI / 2 });
    });

    // Capacité des anneaux : on déborde vers l'anneau voisin qui a de la place
    const cap = caps();
    const parScore = (x: Voisin, y: Voisin) => y.score - x.score;
    for (let r = 0; r < 2; r++)
      if (groupes[r]!.length > cap[r]!) {
        groupes[r]!.sort(parScore);
        groupes[r + 1]!.push(...groupes[r]!.splice(cap[r]!));
      }
    for (let r = 2; r > 0; r--)
      while (groupes[r]!.length > cap[r]! && groupes[r - 1]!.length < cap[r - 1]!) {
        groupes[r]!.sort(parScore);
        groupes[r - 1]!.push(groupes[r]!.shift()!);
      }

    groupes.forEach((g, r) => {
      if (!g.length) return;
      const ra = A * fractions[r]!, rb = B * fractions[r]!;
      s.anneaux.push({ ra, rb, min: Math.min(...g.map((e) => e.score)) });
      g.sort((x, y) => x.ideal - y.ideal);
      const pas = (Math.PI * 2) / g.length;
      let off = 0;
      g.forEach((e, k) => (off += e.ideal - (k * pas - Math.PI / 2)));
      off /= g.length;
      // Anneaux décalés d'un demi-pas pour ne pas aligner les pochettes
      off += r % 2 ? pas / 2 : 0;
      g.forEach((e, k) => {
        const ang = k * pas - Math.PI / 2 + off;
        s.cible.set(e.id, { x: cx + ra * Math.cos(ang), y: cy + rb * Math.sin(ang), s: taille, a: 1, score: e.score });
      });
    });
  }, [centreId, adj, byId, size.w, size.h, panneauOuvert]);

  /* ---------- Dessin ---------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    const { w, h } = size;
    let raf = 0;
    let avant = performance.now();

    const tuile = (o: Oeuvre, x: number, y: number, s: number, opts: { alpha?: number; cadre?: string | null; label?: boolean } = {}) => {
      const { alpha = 1, cadre = null, label = false } = opts;
      const typeC = TYPES_OEUVRE[o.type].couleur;
      ctx.globalAlpha = alpha;
      const img = images.current.get(o.id);
      if (img && img.complete && img.naturalWidth > 0) {
        const c = Math.min(img.naturalWidth, img.naturalHeight);
        ctx.drawImage(img, (img.naturalWidth - c) / 2, (img.naturalHeight - c) / 2, c, c, x - s / 2, y - s / 2, s, s);
      } else {
        ctx.fillStyle = "#1a1a1a";
        ctx.fillRect(x - s / 2, y - s / 2, s, s);
        ctx.fillStyle = typeC;
        ctx.fillRect(x - s / 2, y - s / 2, s, Math.max(2, s * 0.08));
        ctx.fillStyle = "#fff";
        ctx.font = `400 ${Math.round(s * 0.42)}px Anton, Impact, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(initiales(o), x, y + s * 0.04);
      }
      if (cadre) {
        ctx.strokeStyle = cadre;
        ctx.lineWidth = 2.5;
        ctx.strokeRect(x - s / 2, y - s / 2, s, s);
      }
      if (label) {
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = "#fff";
        ctx.font = `800 ${Math.max(10, Math.min(12, s * 0.24))}px Archivo, sans-serif`;
        const t = o.titre.length > 22 ? o.titre.slice(0, 21) + "…" : o.titre;
        ctx.fillText(t, x, y + s / 2 + 5);
        ctx.fillStyle = MUTED;
        ctx.font = `400 ${Math.max(9, Math.min(11, s * 0.22))}px Archivo, sans-serif`;
        ctx.fillText(o.auteur.length > 24 ? o.auteur.slice(0, 23) + "…" : o.auteur, x, y + s / 2 + 20);
      }
      ctx.globalAlpha = 1;
    };

    const dessinerCarte = () => {
      const s = st.current;
      const { carte, adj, ossature, byId } = donnees.current;
      const v = s.view;
      const ecran = (x: number, y: number) => [v.x + x * v.k, v.y + y * v.k] as const;
      const t = Math.max(9, TUILE_CARTE * v.k);

      // Îlots : nom du genre en gothique (contour, comme les échos du site),
      // seulement pour les genres qui ont au moins MIN_ALBUMS_NOM_GENRE œuvres.
      for (const il of carte.ilots) {
        if (il.n >= MIN_ALBUMS_NOM_GENRE) {
          const [x, y] = ecran(il.x, il.y - il.r - 4);
          const fs = Math.max(18, Math.min(130, il.r * v.k * 0.42));
          ctx.textAlign = "center";
          ctx.textBaseline = "alphabetic";
          ctx.font = `${fs}px UnifrakturMaguntia, serif`;
          ctx.lineWidth = 1.4;
          ctx.strokeStyle = hexA(ACCENT, 0.9);
          ctx.strokeText(il.nom, x, y);
        }
        const [cx, cy] = ecran(il.x, il.y);
        ctx.setLineDash([3, 6]);
        ctx.strokeStyle = "rgba(255,255,255,.12)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, cy, il.r * v.k, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      const focus = s.hover ?? s.selectedId;
      const voisins = new Set((focus !== null ? adj.get(focus) ?? [] : []).map((e) => e.id));
      const genre = (id: number) => byId.get(id)?.genre ?? "";

      // Ossature
      for (const l of ossature) {
        if (focus !== null && (l.a === focus || l.b === focus)) continue;
        const A = carte.pos.get(l.a), B = carte.pos.get(l.b);
        if (!A || !B) continue;
        const pont = genre(l.a) !== genre(l.b);
        const a = (pont ? 0.55 : 0.22) * (focus !== null ? 0.25 : 1);
        ctx.strokeStyle = pont ? hexA(ACCENT, a) : `rgba(255,255,255,${a})`;
        ctx.lineWidth = Math.max(0.6, (l.score - REGLAGES.seuil + 3) / 8);
        const [x1, y1] = ecran(A.x, A.y), [x2, y2] = ecran(B.x, B.y);
        const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.quadraticCurveTo(mx + (y1 - y2) * 0.12, my + (x2 - x1) * 0.12, x2, y2);
        ctx.stroke();
      }
      // Tous les liens de l'œuvre survolée / sélectionnée
      if (focus !== null) {
        const F = carte.pos.get(focus);
        if (F) {
          const [x1, y1] = ecran(F.x, F.y);
          for (const e of adj.get(focus) ?? []) {
            const B = carte.pos.get(e.id);
            if (!B) continue;
            const [x2, y2] = ecran(B.x, B.y);
            ctx.strokeStyle = hexA(ACCENT, 0.9);
            ctx.lineWidth = Math.max(1, (e.score - REGLAGES.seuil + 3) / 6);
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
          }
        }
      }
      // Pochettes
      const etiquettes = v.k > 1.9;
      const liste = [...carte.pos].sort(([a], [b]) => (a === focus ? 1 : 0) - (b === focus ? 1 : 0) || (voisins.has(a) ? 1 : 0) - (voisins.has(b) ? 1 : 0));
      for (const [id, p] of liste) {
        const o = byId.get(id);
        if (!o) continue;
        const [x, y] = ecran(p.x, p.y);
        if (x < -60 || y < -60 || x > w + 60 || y > h + 60) continue;
        const actif = focus === null || id === focus || voisins.has(id);
        const isole = !(adj.get(id)?.length);
        const grande = id === focus ? t * 1.35 : t;
        tuile(o, x, y, grande, {
          alpha: actif ? (isole ? 0.4 : 1) : 0.2,
          cadre: id === focus ? ACCENT : voisins.has(id) ? "#fff" : null,
          label: actif && (etiquettes || (focus !== null && (id === focus || voisins.has(id)) && v.k > 1.2)),
        });
      }
    };

    const dessinerOrbite = (dt: number) => {
      const s = st.current;
      const { byId, adj } = donnees.current;
      if (s.centreId === null) return;
      const C = byId.get(s.centreId);
      if (!C) return;
      const f = 1 - Math.pow(0.0008, dt / 1000);
      for (const [id, t] of s.cible) {
        let d = s.disp.get(id);
        if (!d) {
          const c = s.disp.get(s.centreId) ?? s.cible.get(s.centreId)!;
          d = { x: c.x, y: c.y, s: t.s * 0.3, a: 0 };
          s.disp.set(id, d);
        }
        d.x += (t.x - d.x) * f;
        d.y += (t.y - d.y) * f;
        d.s += (t.s - d.s) * f;
        d.a += (t.a - d.a) * f;
      }
      for (const [id, d] of s.disp)
        if (!s.cible.has(id)) {
          d.a += (0 - d.a) * f;
          if (d.a < 0.02) s.disp.delete(id);
        }
      const c = s.disp.get(s.centreId);
      if (!c) return;

      // Écho gothique du genre, derrière
      if (C.genre) {
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const fs = Math.min((s.centre.x * 1.8) / Math.max(4, C.genre.length * 0.55), h * 0.5);
        ctx.font = `${fs}px UnifrakturMaguntia, serif`;
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = hexA(ACCENT, 0.25);
        ctx.strokeText(C.genre, s.centre.x, s.centre.y);
      }
      // Anneaux
      for (const a of s.anneaux) {
        ctx.setLineDash([2, 6]);
        ctx.strokeStyle = "rgba(255,255,255,.18)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(s.centre.x, s.centre.y, a.ra, a.rb, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      const autour = [...s.disp.keys()].filter((id) => id !== s.centreId);
      const presents = new Set(autour);
      // Fils : seulement au survol.
      // Survol d'une œuvre en orbite : son fil vers le centre + ses liens avec les autres.
      // Survol du centre : tous ses fils.
      const survol = s.hover;
      if (survol !== null) {
        ctx.lineWidth = 1;
        if (survol !== s.centreId && presents.has(survol))
          for (const e of adj.get(survol) ?? []) {
            if (!presents.has(e.id)) continue;
            const a = s.disp.get(survol)!, b = s.disp.get(e.id)!;
            ctx.strokeStyle = `rgba(255,255,255,${0.5 * Math.min(a.a, b.a)})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        for (const id of autour) {
          if (survol !== s.centreId && survol !== id) continue;
          const d = s.disp.get(id)!;
          const score = s.cible.get(id)?.score ?? REGLAGES.seuil;
          ctx.strokeStyle = hexA(ACCENT, 0.85 * d.a);
          ctx.lineWidth = Math.max(1, (score - REGLAGES.seuil + 2) / 4);
          ctx.beginPath();
          ctx.moveTo(c.x, c.y);
          ctx.lineTo(d.x, d.y);
          ctx.stroke();
        }
      }
      for (const id of autour) {
        const d = s.disp.get(id)!;
        const o = byId.get(id);
        if (o) tuile(o, d.x, d.y, d.s, { alpha: d.a * (s.hover === null || s.hover === s.centreId || s.hover === id ? 1 : 0.55), cadre: s.hover === id ? ACCENT : null, label: true });
      }
      tuile(C, c.x, c.y, c.s, { cadre: ACCENT });
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = "#fff";
      ctx.font = `400 ${Math.round(c.s * 0.24)}px Anton, Impact, sans-serif`;
      ctx.fillText(C.titre.toUpperCase(), c.x, c.y + c.s / 2 + 8);
      ctx.fillStyle = MUTED;
      ctx.font = "600 12px Archivo, sans-serif";
      ctx.fillText(C.auteur + (C.annee ? ` · ${C.annee}` : ""), c.x, c.y + c.s / 2 + 14 + c.s * 0.24);
      if (s.reste > 0) {
        ctx.textAlign = "right";
        ctx.textBaseline = "top";
        ctx.fillStyle = MUTED;
        ctx.font = "800 11px Archivo, sans-serif";
        ctx.fillText(s.reste > 1 ? `+ ${s.reste} AUTRES CONNEXIONS DANS LA FICHE` : "+ 1 AUTRE CONNEXION DANS LA FICHE", w - 14, 70);
        ctx.textAlign = "center";
      }
      if (!(adj.get(s.centreId)?.length)) {
        ctx.fillStyle = MUTED;
        ctx.font = "600 13px Archivo, sans-serif";
        ctx.fillText("Pas encore reliée à une autre œuvre.", c.x, c.y + c.s / 2 + 52);
      }
    };

    const boucle = (ts: number) => {
      const dt = Math.min(64, ts - avant);
      avant = ts;
      const s = st.current;
      const lisse = 1 - Math.pow(0.002, dt / 1000);
      s.view.x += (s.cibleView.x - s.view.x) * lisse;
      s.view.y += (s.cibleView.y - s.view.y) * lisse;
      s.view.k += (s.cibleView.k - s.view.k) * lisse;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (s.mode === "carte") dessinerCarte();
      else dessinerOrbite(dt);
      raf = requestAnimationFrame(boucle);
    };
    raf = requestAnimationFrame(boucle);
    return () => cancelAnimationFrame(raf);
  }, [size]);

  /* ---------- Pointeur ---------- */
  const toucher = useCallback((px: number, py: number): number | null => {
    const s = st.current;
    const { carte } = donnees.current;
    if (s.mode === "carte") {
      const v = s.view;
      const demi = Math.max(9, TUILE_CARTE * v.k) / 2 + 2;
      let best: number | null = null;
      let bd = Infinity;
      for (const [id, p] of carte.pos) {
        const d = Math.max(Math.abs(v.x + p.x * v.k - px), Math.abs(v.y + p.y * v.k - py));
        if (d < demi && d < bd) {
          bd = d;
          best = id;
        }
      }
      return best;
    }
    for (const [id, d] of s.disp) if (d.a > 0.5 && Math.abs(d.x - px) < d.s / 2 + 3 && Math.abs(d.y - py) < d.s / 2 + 3) return id;
    return null;
  }, []);

  const montrerInfo = useCallback((id: number | null, px: number, py: number) => {
    const tip = tipRef.current;
    if (!tip) return;
    const { byId, adj } = donnees.current;
    const s = st.current;
    const o = id !== null ? byId.get(id) : undefined;
    if (!o || id === null) {
      tip.hidden = true;
      return;
    }
    const ref = s.mode === "orbite" ? s.centreId : s.selectedId;
    const lien = ref !== null && ref !== id ? adj.get(ref)?.find((e) => e.id === id) : undefined;
    const communs = new Set((lien?.communs ?? []).map((t) => t.toLowerCase()));
    tip.replaceChildren();
    const el = (cls: string, txt: string) => {
      const e = document.createElement("span");
      e.className = cls;
      e.textContent = txt;
      tip.appendChild(e);
      return e;
    };
    el("toile-info__titre", o.titre);
    el("toile-info__auteur", o.auteur + (o.annee ? ` · ${o.annee}` : ""));
    const nb = adj.get(id)?.length ?? 0;
    el("toile-info__score", `${nb} connexion${nb > 1 ? "s" : ""}`);
    const chips = el("toile-info__chips", "");
    for (const t of [o.genre, ...(o.sousGenres ?? [])].filter((x): x is string => !!x)) {
      const c = document.createElement("span");
      c.className = `toile-info__chip${communs.has(t.toLowerCase()) ? " is-commun" : ""}`;
      c.textContent = t;
      chips.appendChild(c);
    }
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    let x = px + 16, y = py + 16;
    if (x + r.width > size.w - 8) x = px - r.width - 16;
    if (y + r.height > size.h - 8) y = py - r.height - 16;
    tip.style.left = `${Math.max(8, x)}px`;
    tip.style.top = `${Math.max(8, y)}px`;
  }, [size.w, size.h]);

  // Molette : zoom sur la Carte uniquement (sur l'Orbite, la page défile normalement)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      if (st.current.mode !== "carte") return;
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      zoomer(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [zoomer]);

  const pointeurs = useRef(new Map<number, { x: number; y: number }>());
  const glisse = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const pince = useRef<{ d: number; k: number; mx: number; my: number } | null>(null);
  const bouge = useRef(false);
  const local = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    canvasRef.current?.setPointerCapture(e.pointerId);
    const p = local(e);
    pointeurs.current.set(e.pointerId, p);
    bouge.current = false;
    const v = st.current.cibleView;
    if (pointeurs.current.size === 1) glisse.current = { x: p.x, y: p.y, vx: v.x, vy: v.y };
    if (pointeurs.current.size === 2) {
      const [a, b] = [...pointeurs.current.values()];
      pince.current = { d: Math.hypot(a!.x - b!.x, a!.y - b!.y), k: v.k, mx: (a!.x + b!.x) / 2, my: (a!.y + b!.y) / 2 };
      glisse.current = null;
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = local(e);
    if (pointeurs.current.has(e.pointerId)) pointeurs.current.set(e.pointerId, p);
    const s = st.current;
    if (s.mode === "carte") {
      if (pince.current && pointeurs.current.size === 2) {
        const [a, b] = [...pointeurs.current.values()];
        const f = (pince.current.k * Math.hypot(a!.x - b!.x, a!.y - b!.y)) / pince.current.d / s.cibleView.k;
        zoomer(f, pince.current.mx, pince.current.my);
        s.view = { ...s.cibleView };
        bouge.current = true;
        return;
      }
      if (glisse.current) {
        const dx = p.x - glisse.current.x, dy = p.y - glisse.current.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) bouge.current = true;
        if (bouge.current) {
          s.cibleView = { ...s.cibleView, x: glisse.current.vx + dx, y: glisse.current.vy + dy };
          s.view = { ...s.cibleView };
          if (tipRef.current) tipRef.current.hidden = true;
          return;
        }
      }
    }
    if (e.pointerType !== "mouse") return;
    const id = toucher(p.x, p.y);
    s.hover = id;
    if (canvasRef.current) canvasRef.current.style.cursor = id !== null ? "pointer" : s.mode === "carte" ? "grab" : "default";
    montrerInfo(id, p.x, p.y);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointeurs.current.delete(e.pointerId);
    if (pointeurs.current.size < 2) pince.current = null;
    if (!pointeurs.current.size) {
      if (!bouge.current && e.type === "pointerup") {
        const p = local(e);
        const id = toucher(p.x, p.y);
        if (id !== null) {
          st.current.hover = null;
          if (tipRef.current) tipRef.current.hidden = true;
          onSelect(id);
        }
      }
      glisse.current = null;
    }
  };

  const nbLiens = liens.length;
  return (
    <div className={`toile toile--${mode}`} ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="toile__canvas"
        style={{ width: size.w, height: size.h, cursor: mode === "carte" ? "grab" : "default" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={(e) => {
          if (e.pointerType !== "mouse" || pointeurs.current.size) return;
          st.current.hover = null;
          if (tipRef.current) tipRef.current.hidden = true;
        }}
        role="img"
        aria-label={
          mode === "carte"
            ? `Carte de ${oeuvres.length} œuvres rangées par genre, reliées par ${nbLiens} connexions. La vue Mosaïque donne accès aux mêmes œuvres au clavier.`
            : `Orbite : ${centreId !== null ? byId.get(centreId)?.titre ?? "" : ""} et ses connexions. La fiche de l'œuvre liste les mêmes connexions.`
        }
      />
      <div className="toile-info" ref={tipRef} hidden />
      {mode === "carte" && (
        <div className="toile__controls">
          <button type="button" className="ctrl-btn" onClick={() => zoomer(1.25)} aria-label="Zoomer">
            +
          </button>
          <button type="button" className="ctrl-btn" onClick={() => zoomer(0.8)} aria-label="Dézoomer">
            −
          </button>
          <button type="button" className="ctrl-btn ctrl-btn--text" onClick={() => toutVoir()}>
            Tout voir
          </button>
        </div>
      )}
      <p className="toile__hint">
        {mode === "carte"
          ? "Survole une œuvre pour voir ses liens · clique pour ouvrir sa fiche"
          : "Plus une œuvre est proche du centre, plus elle lui ressemble · survole pour voir les liens · clique pour la mettre au centre"}
      </p>
    </div>
  );
}
