"use client";

import { useEffect, useRef, useState } from "react";
import { enPortrait, initiales } from "./utils";

/**
 * Pochette d'une œuvre ; si l'image manque, affiche ses initiales.
 * « petite » : charge la miniature (bien plus légère) quand elle existe.
 * À mettre partout où la pochette s'affiche en vignette.
 * Un film (ou tout ce qui n'est pas un album) porte la classe « pochette--portrait » :
 * son cadre passe alors en 2:3 (voir globals.css, « Pochettes en portrait »).
 * Un jeu vidéo porte aussi « pochette--jeu » : son cadre prend le format des jaquettes IGDB.
 */
export function Pochette({ o, alt = "", lazy = true, petite = false }: { o: { titre: string; cover?: string; mini?: string; type?: string }; alt?: string; lazy?: boolean; petite?: boolean }) {
  const mini = petite ? o.mini : undefined;
  // portrait : 2:3 pour une affiche ; une jaquette de jeu a en plus « pochette--jeu » (format IGDB)
  const portrait = enPortrait(o.type) ? ` pochette--portrait${o.type === "jeu" ? " pochette--jeu" : ""}` : "";
  // "mini" → la miniature ; "grande" → la pochette ; "rien" → les initiales
  const [etape, setEtape] = useState<"mini" | "grande" | "rien">(mini ? "mini" : "grande");
  const ref = useRef<HTMLImageElement>(null);
  const src = etape === "mini" ? mini : o.cover;
  // une miniature qui ne charge pas : on retombe sur la grande pochette
  const rate = () => setEtape((e) => (e === "mini" && o.cover ? "grande" : "rien"));

  useEffect(() => {
    setEtape(mini ? "mini" : "grande");
  }, [mini, o.cover]);

  // L'image a pu échouer avant que React soit prêt : on vérifie au montage.
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) rate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  if (!src || etape === "rien") return <span className={`tile__fallback${portrait}`}>{initiales(o)}</span>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img ref={ref} className={portrait.trim() || undefined} src={src} alt={alt} loading={lazy ? "lazy" : undefined} draggable={false} onError={rate} />
  );
}
