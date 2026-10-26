"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { SECTIONS } from "@/lib/sections";

/*
 * Le fond du site : un dégradé très sombre, teinté par la couleur de la page
 * (vert pour les jeux, bleu pour les connexions, la couleur de l'article…).
 * L'accueil mélange les quatre couleurs des rubriques.
 * La teinte glisse doucement d'une page à l'autre.
 */

/** La couleur d'après l'adresse, connue tout de suite (avant même que la page s'affiche). */
function couleurDeLAdresse(chemin: string) {
  for (const s of Object.values(SECTIONS)) if (chemin === s.href || chemin.startsWith(s.href + "/")) return s.couleur;
  return null;
}

export function Ambiance() {
  const chemin = usePathname() ?? "/";
  const [couleur, setCouleur] = useState<string | null>(() => couleurDeLAdresse(chemin));

  useEffect(() => {
    // la couleur précise de la page (celle d'un article, par exemple), posée sur son bloc principal
    const lire = () => {
      const el = document.querySelector<HTMLElement>('main[style*="--accent"], article[style*="--accent"]');
      const v = el?.style.getPropertyValue("--accent").trim();
      setCouleur(v || couleurDeLAdresse(chemin));
    };
    lire();
    const t = setTimeout(lire, 120);
    return () => clearTimeout(t);
  }, [chemin]);

  return <div className={`ambiance${couleur ? "" : " ambiance--accueil"}`} style={couleur ? { ["--ambiance" as string]: couleur } : undefined} aria-hidden="true" />;
}
