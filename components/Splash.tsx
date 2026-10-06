"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { SECTIONS, SECTION_SLUGS } from "@/lib/sections";

/**
 * Écran d'arrivée sur l'accueil, joué une seule fois par visite.
 * Un clic le passe. Désactivé si l'utilisateur préfère moins d'animations.
 */
export function Splash() {
  const pathname = usePathname();
  const [done, setDone] = useState(false);
  if (done || pathname !== "/") return null;

  const finish = () => {
    document.documentElement.dataset.splash = "done";
    setDone(true);
  };

  return (
    <div
      className="splash"
      aria-hidden="true"
      onClick={finish}
      onAnimationEnd={(e) => {
        // "splash-leve" : la variante jouée quand le site a une image de fond
        if (e.target === e.currentTarget && (e.animationName === "splash-out" || e.animationName === "splash-leve")) finish();
      }}
    >
      <div className="splash__inner">
        <span className="splash__echo">Henassa</span>
        <span className="splash__title">Henassa</span>
        <span className="splash__bars">
          {/* une barre par rubrique, l'une après l'autre (le délai suit le nombre de rubriques) */}
          {SECTION_SLUGS.map((s, i) => (
            <i key={s} style={{ background: SECTIONS[s].couleur, animationDelay: `${(0.9 + i * 0.1).toFixed(2)}s` }} />
          ))}
        </span>
      </div>
    </div>
  );
}
