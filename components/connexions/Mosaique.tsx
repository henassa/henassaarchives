"use client";

import type { Oeuvre } from "@/lib/oeuvres";
import { TYPES_OEUVRE } from "@/lib/sections";
import { Pochette } from "./Pochette";
import type { VoisinsMap } from "./utils";

export function Mosaique({
  oeuvres,
  voisins,
  focusId,
  selectedId,
  onHover,
  onSelect,
}: {
  oeuvres: Oeuvre[];
  voisins: VoisinsMap;
  focusId: number | null;
  selectedId: number | null;
  onHover: (id: number | null) => void;
  onSelect: (id: number) => void;
}) {
  const related = new Set((focusId !== null ? voisins.get(focusId) ?? [] : []).map((v) => v.id));

  if (oeuvres.length === 0) {
    return <p className="empty">Aucune œuvre ne correspond.</p>;
  }

  return (
    <ul className="mosaique" onMouseLeave={() => onHover(null)}>
      {oeuvres.map((o, i) => {
        const type = TYPES_OEUVRE[o.type];
        const state =
          focusId === null
            ? ""
            : o.id === focusId
              ? " is-focus"
              : related.has(o.id)
                ? " is-related"
                : " is-dim";
        const nb = voisins.get(o.id)?.length ?? 0;
        return (
          <li
            key={o.id}
            className={`tile${state}${o.id === selectedId ? " is-selected" : ""}`}
            style={{ ["--type" as string]: type.couleur, ["--i" as string]: Math.min(i, 40) }}
          >
            <button
              type="button"
              className="tile__btn"
              onMouseEnter={() => onHover(o.id)}
              onFocus={() => onHover(o.id)}
              onBlur={() => onHover(null)}
              onClick={() => onSelect(o.id)}
              aria-label={`${o.titre} — ${o.auteur}${nb ? `, ${nb} connexion${nb > 1 ? "s" : ""}` : ""}`}
            >
              <Pochette o={o} petite />
              <span className="tile__label" aria-hidden="true">
                <span className="tile__title">{o.titre}</span>
                <span className="tile__author">{o.auteur}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
