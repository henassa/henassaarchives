"use client";

import { usePathname } from "next/navigation";
import { SECTIONS } from "@/lib/sections";

function couleurPour(pathname: string) {
  if (pathname.startsWith("/articles")) return SECTIONS.articles.couleur;
  if (pathname.startsWith("/connexions")) return SECTIONS.connexions.couleur;
  if (pathname.startsWith("/playlist")) return SECTIONS.playlist.couleur;
  if (pathname.startsWith("/mini-jeux")) return SECTIONS.jeux.couleur;
  return "#ffffff";
}

// Rejoué à chaque changement de page : un rideau de la couleur de la
// rubrique se retire, puis le contenu monte en fondu.
export default function Template({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <>
      <div className="wipe" aria-hidden="true" style={{ background: couleurPour(pathname) }} />
      <div className="page-enter">{children}</div>
    </>
  );
}
