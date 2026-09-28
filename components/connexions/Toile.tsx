"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Lien, Oeuvre } from "@/lib/oeuvres";
import { TYPES_OEUVRE } from "@/lib/sections";
import { initiales, type VoisinsMap } from "./utils";

/*
 * La Toile : graphe des connexions, dessiné sur un canvas.
 * - chaque œuvre est un carré (sa pochette), les liens sont des traits ;
 * - survol / sélection : l'œuvre et ses voisines s'allument, le reste s'éteint ;
 * - glisser une œuvre la déplace, glisser le fond déplace la vue ;
 * - molette ou pincement pour zoomer.
 */

const HALF = 24; // demi-côté d'une œuvre (px, à zoom 1)
const SETTLE_TICKS = 260;
/** Zoom par défaut en arrivant sur la Toile (1 = taille réelle). */
const DEFAULT_ZOOM = 1.15;

type Node = {
  id: number;
  o: Oeuvre;
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseX: number;
  baseY: number;
  phase: number;
  speed: number;
  amp: number;
  size: number;
  dark: number;
};

function buildNodes(oeuvres: Oeuvre[], w: number, h: number): Node[] {
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.max(220, Math.sqrt(oeuvres.length) * 75);
  return oeuvres.map((o, i) => {
    const angle = (i / Math.max(1, oeuvres.length)) * Math.PI * 2;
    const x = cx + r * Math.cos(angle) + (Math.random() - 0.5) * 20;
    const y = cy + r * Math.sin(angle) + (Math.random() - 0.5) * 20;
    return {
      id: o.id,
      o,
      x,
      y,
      vx: 0,
      vy: 0,
      baseX: x,
      baseY: y,
      phase: Math.random() * Math.PI * 2,
      speed: 0.0004 + Math.random() * 0.0003,
      amp: 2 + Math.random() * 4,
      size: HALF,
      dark: 0,
    };
  });
}

function settleStep(nodes: Node[], links: { s: Node; t: Node }[], w: number, h: number) {
  const cx = w / 2;
  const cy = h / 2;
  // Réglages de l'espacement : augmente repulsion / springLen / minDist
  // pour aérer davantage la Toile.
  const repulsion = 14000;
  const springLen = 150;
  const springK = 0.03;
  const centerK = 0.006;
  const damping = 0.8;
  const minDist = HALF * 2 + 44;

  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i]!;
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j]!;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 1) {
        dx = Math.random() - 0.5;
        dy = Math.random() - 0.5;
        d2 = 1;
      }
      const dist = Math.sqrt(d2);
      const f = repulsion / d2;
      const fx = (dx / dist) * f;
      const fy = (dy / dist) * f;
      a.vx -= fx;
      a.vy -= fy;
      b.vx += fx;
      b.vy += fy;
      if (dist < minDist) {
        const push = ((minDist - dist) / dist) * 0.5;
        a.x -= dx * push;
        a.y -= dy * push;
        b.x += dx * push;
        b.y += dy * push;
      }
    }
  }
  for (const { s, t } of links) {
    const dx = t.x - s.x;
    const dy = t.y - s.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const f = (dist - springLen) * springK;
    const fx = (dx / dist) * f;
    const fy = (dy / dist) * f;
    s.vx += fx;
    s.vy += fy;
    t.vx -= fx;
    t.vy -= fy;
  }
  for (const n of nodes) {
    n.vx += (cx - n.x) * centerK;
    n.vy += (cy - n.y) * centerK;
    n.vx *= damping;
    n.vy *= damping;
    n.x += n.vx;
    n.y += n.vy;
    n.baseX = n.x;
    n.baseY = n.y;
  }
}

export function Toile({
  oeuvres,
  liens,
  voisins,
  selectedId,
  onSelect,
}: {
  oeuvres: Oeuvre[];
  liens: Lien[];
  voisins: VoisinsMap;
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  const nodesRef = useRef<Node[]>([]);
  const byIdRef = useRef<Map<number, Node>>(new Map());
  const linksRef = useRef<{ s: Node; t: Node }[]>([]);
  const imagesRef = useRef<Map<number, HTMLImageElement>>(new Map());
  const tickRef = useRef(0);
  const hoverRef = useRef<Node | null>(null);
  const selectedRef = useRef<number | null>(selectedId);
  const voisinsRef = useRef(voisins);

  const zoom = useRef(DEFAULT_ZOOM);
  const targetZoom = useRef(DEFAULT_ZOOM);
  const pan = useRef({ x: 0, y: 0 });
  const targetPan = useRef({ x: 0, y: 0 });

  const dragNode = useRef<Node | null>(null);
  const panning = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const moved = useRef(false);
  const pinch = useRef<number | null>(null);

  selectedRef.current = selectedId;
  voisinsRef.current = voisins;

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

  // (Re)construit le graphe quand les œuvres visibles changent
  const idsKey = oeuvres.map((o) => o.id).join(",");
  useEffect(() => {
    const nodes = buildNodes(oeuvres, size.w, size.h);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    nodesRef.current = nodes;
    byIdRef.current = byId;
    linksRef.current = liens
      .map((l) => ({ s: byId.get(l.a)!, t: byId.get(l.b)! }))
      .filter((l) => l.s && l.t);
    tickRef.current = 0;
    for (const o of oeuvres) {
      if (!o.cover || imagesRef.current.has(o.id)) continue;
      const img = new Image();
      img.src = o.cover;
      imagesRef.current.set(o.id, img);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, liens, size.w, size.h]);

  const fitView = useCallback(() => {
    const nodes = nodesRef.current;
    if (!nodes.length) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of nodes) {
      minX = Math.min(minX, n.baseX);
      minY = Math.min(minY, n.baseY);
      maxX = Math.max(maxX, n.baseX);
      maxY = Math.max(maxY, n.baseY);
    }
    const pad = 80;
    const z = Math.min(1.4, (size.w - pad) / (maxX - minX + HALF * 2), (size.h - pad) / (maxY - minY + HALF * 2));
    targetZoom.current = Math.max(0.15, z);
    const bx = (minX + maxX) / 2 - size.w / 2;
    const by = (minY + maxY) / 2 - size.h / 2;
    targetPan.current = { x: -bx * targetZoom.current, y: -by * targetZoom.current };
  }, [size.w, size.h]);

  // Vue par défaut : de près, centrée sur l'œuvre sélectionnée
  // ou, à défaut, sur l'œuvre la plus reliée.
  const homeView = useCallback(() => {
    const nodes = nodesRef.current;
    if (!nodes.length) return;
    let target: Node | undefined =
      selectedRef.current !== null ? byIdRef.current.get(selectedRef.current) : undefined;
    if (!target) {
      const deg = new Map<number, number>();
      for (const { s, t } of linksRef.current) {
        deg.set(s.id, (deg.get(s.id) ?? 0) + 1);
        deg.set(t.id, (deg.get(t.id) ?? 0) + 1);
      }
      target = nodes.reduce((best, n) => ((deg.get(n.id) ?? 0) > (deg.get(best.id) ?? 0) ? n : best), nodes[0]!);
    }
    targetZoom.current = DEFAULT_ZOOM;
    targetPan.current = {
      x: -(target.baseX - size.w / 2) * DEFAULT_ZOOM,
      y: -(target.baseY - size.h / 2) * DEFAULT_ZOOM,
    };
  }, [size.w, size.h]);

  // Monde → écran et inverse
  const toWorld = useCallback(
    (clientX: number, clientY: number) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      const sx = clientX - rect.left;
      const sy = clientY - rect.top;
      return {
        x: (sx - size.w / 2 - pan.current.x) / zoom.current + size.w / 2,
        y: (sy - size.h / 2 - pan.current.y) / zoom.current + size.h / 2,
      };
    },
    [size.w, size.h]
  );

  const nodeAt = useCallback((x: number, y: number) => {
    const nodes = nodesRef.current;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i]!;
      if (Math.abs(n.x - x) <= n.size + 4 && Math.abs(n.y - y) <= n.size + 4) return n;
    }
    return null;
  }, []);

  // Boucle de dessin
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = size.w * dpr;
    canvas.height = size.h * dpr;
    let raf = 0;

    const draw = (ts: number) => {
      const { w, h } = size;
      const nodes = nodesRef.current;
      const links = linksRef.current;

      if (tickRef.current < SETTLE_TICKS) {
        settleStep(nodes, links, w, h);
        tickRef.current++;
        if (tickRef.current === SETTLE_TICKS) homeView();
      } else {
        for (const n of nodes) {
          if (dragNode.current === n) continue;
          n.x = n.baseX + Math.sin(ts * n.speed + n.phase) * n.amp;
          n.y = n.baseY + Math.cos(ts * n.speed * 0.7 + n.phase + 1.2) * n.amp * 0.8;
        }
      }

      zoom.current += (targetZoom.current - zoom.current) * 0.12;
      pan.current.x += (targetPan.current.x - pan.current.x) * 0.12;
      pan.current.y += (targetPan.current.y - pan.current.y) * 0.12;
      const z = zoom.current;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.translate(w / 2 + pan.current.x, h / 2 + pan.current.y);
      ctx.scale(z, z);
      ctx.translate(-w / 2, -h / 2);

      const focus = hoverRef.current ?? (selectedRef.current !== null ? byIdRef.current.get(selectedRef.current) ?? null : null);
      const related = new Set((focus ? voisinsRef.current.get(focus.id) ?? [] : []).map((v) => v.id));
      const focusColor = focus ? TYPES_OEUVRE[focus.o.type].couleur : "#fff";

      // Liens
      for (const { s, t } of links) {
        const lit = focus && (s === focus || t === focus);
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t.x, t.y);
        ctx.strokeStyle = lit ? focusColor : focus ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.18)";
        ctx.lineWidth = (lit ? 2.5 : 1) / Math.max(0.6, z);
        ctx.stroke();
      }

      // Œuvres
      for (const n of nodes) {
        const isFocus = focus === n;
        const isRel = related.has(n.id);
        const targetDark = focus && !isFocus && !isRel ? 0.72 : 0;
        const targetSize = isFocus ? HALF * 1.25 : isRel ? HALF * 1.08 : HALF;
        n.dark += (targetDark - n.dark) * 0.14;
        n.size += (targetSize - n.size) * 0.16;
      }
      const order = [...nodes].sort((a, b) => {
        const ra = a === focus ? 2 : related.has(a.id) ? 1 : 0;
        const rb = b === focus ? 2 : related.has(b.id) ? 1 : 0;
        return ra - rb;
      });

      for (const n of order) {
        const s = n.size;
        const img = imagesRef.current.get(n.id);
        const typeColor = TYPES_OEUVRE[n.o.type].couleur;
        if (img && img.complete && img.naturalWidth > 0) {
          const iw = img.naturalWidth;
          const ih = img.naturalHeight;
          const c = Math.min(iw, ih);
          ctx.drawImage(img, (iw - c) / 2, (ih - c) / 2, c, c, n.x - s, n.y - s, s * 2, s * 2);
        } else {
          ctx.fillStyle = "#1a1a1a";
          ctx.fillRect(n.x - s, n.y - s, s * 2, s * 2);
          ctx.fillStyle = typeColor;
          ctx.fillRect(n.x - s, n.y - s, s * 2, 4);
          ctx.fillStyle = "#fff";
          ctx.font = `400 ${s * 0.7}px Anton, Impact, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(initiales(n.o), n.x, n.y + 2);
        }
        if (n.dark > 0.01) {
          ctx.fillStyle = `rgba(10,10,10,${n.dark})`;
          ctx.fillRect(n.x - s, n.y - s, s * 2, s * 2);
        }
        const isSel = selectedRef.current === n.id;
        if (n === focus || isSel || related.has(n.id)) {
          ctx.strokeStyle = n === focus || isSel ? typeColor : "#fff";
          ctx.lineWidth = (n === focus || isSel ? 3 : 2) / Math.max(0.6, z);
          ctx.strokeRect(n.x - s, n.y - s, s * 2, s * 2);
        }
      }

      // Étiquettes : œuvre survolée + voisines
      if (focus) {
        const fs = 13 / Math.max(0.5, z);
        const labelled = order.filter((n) => n === focus || related.has(n.id));
        for (const n of labelled) {
          const title = n.o.titre.toUpperCase();
          ctx.font = `400 ${fs}px Anton, Impact, sans-serif`;
          const tw = ctx.measureText(title).width;
          const padX = 5 / Math.max(0.5, z);
          const bx = n.x - tw / 2 - padX;
          const by = n.y + n.size + 6 / Math.max(0.5, z);
          const bh = fs * 1.35;
          ctx.fillStyle = n === focus ? TYPES_OEUVRE[n.o.type].couleur : "#fff";
          ctx.fillRect(bx, by, tw + padX * 2, bh);
          ctx.fillStyle = "#0a0a0a";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(title, n.x, by + bh / 2 + 1 / Math.max(0.5, z));
        }
      }

      ctx.restore();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [size, homeView]);

  // Molette : zoom centré sur le curseur (listener non passif)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const factor = Math.exp(-e.deltaY * 0.0015);
      const nz = Math.max(0.15, Math.min(5, targetZoom.current * factor));
      const ratio = nz / targetZoom.current;
      targetPan.current.x = sx - size.w / 2 - (sx - size.w / 2 - targetPan.current.x) * ratio;
      targetPan.current.y = sy - size.h / 2 - (sy - size.h / 2 - targetPan.current.y) * ratio;
      targetZoom.current = nz;
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [size.w, size.h]);

  // Pointeur (souris, stylet, doigt)
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    canvasRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current = false;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      dragNode.current = null;
      panning.current = null;
      return;
    }
    const { x, y } = toWorld(e.clientX, e.clientY);
    const n = nodeAt(x, y);
    if (n) {
      dragNode.current = n;
      if (e.pointerType !== "mouse") hoverRef.current = n;
    } else {
      panning.current = { x: e.clientX, y: e.clientY, ox: targetPan.current.x, oy: targetPan.current.y };
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (prev) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      targetZoom.current = Math.max(0.15, Math.min(5, targetZoom.current * (d / pinch.current)));
      pinch.current = d;
      moved.current = true;
      return;
    }
    if (panning.current) {
      const dx = e.clientX - panning.current.x;
      const dy = e.clientY - panning.current.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved.current = true;
      targetPan.current = { x: panning.current.ox + dx, y: panning.current.oy + dy };
      return;
    }
    const { x, y } = toWorld(e.clientX, e.clientY);
    if (dragNode.current && prev) {
      if (Math.abs(e.clientX - prev.x) + Math.abs(e.clientY - prev.y) > 1) moved.current = true;
      dragNode.current.x = dragNode.current.baseX = x;
      dragNode.current.y = dragNode.current.baseY = y;
      return;
    }
    if (e.pointerType === "mouse") {
      const n = nodeAt(x, y);
      hoverRef.current = n;
      if (canvasRef.current) canvasRef.current.style.cursor = n ? "pointer" : "grab";
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (!moved.current && dragNode.current) onSelect(dragNode.current.id);
    dragNode.current = null;
    panning.current = null;
    if (e.pointerType !== "mouse") hoverRef.current = null;
  };

  const zoomBy = (f: number) => {
    targetZoom.current = Math.max(0.15, Math.min(5, targetZoom.current * f));
    targetPan.current = { x: targetPan.current.x * f, y: targetPan.current.y * f };
  };

  return (
    <div className="toile" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="toile__canvas"
        style={{ width: size.w, height: size.h }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") hoverRef.current = null;
        }}
        role="img"
        aria-label={`Toile de ${oeuvres.length} œuvres reliées par ${liens.length} connexions. La vue Mosaïque donne accès aux mêmes œuvres au clavier.`}
      />
      <div className="toile__controls">
        <button type="button" className="ctrl-btn" onClick={() => zoomBy(1.25)} aria-label="Zoomer">
          +
        </button>
        <button type="button" className="ctrl-btn" onClick={() => zoomBy(0.8)} aria-label="Dézoomer">
          −
        </button>
        <button type="button" className="ctrl-btn ctrl-btn--text" onClick={homeView}>
          Recentrer
        </button>
        <button type="button" className="ctrl-btn ctrl-btn--text" onClick={fitView}>
          Tout voir
        </button>
      </div>
      <p className="toile__hint">Glisse pour te déplacer · molette ou pincement pour zoomer · clique une œuvre pour l&apos;ouvrir</p>
    </div>
  );
}
