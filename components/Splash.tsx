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
        if (e.animationName === "splash-out") finish();
      }}
    >
      <div className="splash__inner">
        <span className="splash__echo">HENASSA</span>
        <span className="splash__title">HENASSA</span>
        <span className="splash__bars">
          {SECTION_SLUGS.map((s) => (
            <i key={s} style={{ background: SECTIONS[s].couleur }} />
          ))}
        </span>
      </div>
    </div>
  );
}
