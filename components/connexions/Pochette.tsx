"use client";

import { useEffect, useRef, useState } from "react";
import { initiales } from "./utils";

/** Pochette d'une œuvre ; si l'image manque, affiche ses initiales. */
export function Pochette({ o, alt = "", lazy = true }: { o: { titre: string; cover?: string }; alt?: string; lazy?: boolean }) {
  const [broken, setBroken] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  // L'image a pu échouer avant que React soit prêt : on vérifie au montage.
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setBroken(true);
  }, [o.cover]);

  if (!o.cover || broken) return <span className="tile__fallback">{initiales(o)}</span>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img ref={ref} src={o.cover} alt={alt} loading={lazy ? "lazy" : undefined} draggable={false} onError={() => setBroken(true)} />
  );
}
