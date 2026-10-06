"use client";

import { useEffect, useRef } from "react";
import type { Oeuvre } from "@/lib/oeuvres";
import { isPlayable } from "@/lib/media";
import { PlayButton, usePlayer } from "@/components/player/Lecteur";
import { TYPES_OEUVRE } from "@/lib/sections";
import { Pochette } from "./Pochette";
import type { Voisin } from "./utils";

function Ecouter({ oeuvre, couleur }: { oeuvre: Oeuvre; couleur: string }) {
  const media = oeuvre.media;
  if (isPlayable(media)) {
    return (
      <PlayButton
        piste={{
          titre: oeuvre.titre,
          auteur: oeuvre.auteur,
          cover: oeuvre.cover,
          media: media!,
          couleur,
          slug: oeuvre.slug ?? String(oeuvre.id),
        }}
      />
    );
  }
  if (media) {
    return (
      <a className="player__link" href={media} target="_blank" rel="noopener noreferrer">
        Écouter / voir →
      </a>
    );
  }
  return null;
}

function Thumb({ o, petite }: { o: Oeuvre; petite?: boolean }) {
  return <Pochette o={o} petite={petite} />;
}

export function Panneau({
  oeuvre,
  voisins,
  byId,
  onClose,
  onSelect,
}: {
  oeuvre: Oeuvre;
  voisins: Voisin[];
  byId: Map<number, Oeuvre>;
  onClose: () => void;
  onSelect: (id: number) => void;
}) {
  const type = TYPES_OEUVRE[oeuvre.type];
  const player = usePlayer();
  const slug = oeuvre.slug ?? String(oeuvre.id);
  // « Réduire » range la fiche dans le lecteur en bas à droite.
  // Possible si le lecteur est libre, ou s'il contient déjà cette œuvre.
  const peutReduire = !player.piste || player.piste.slug === slug;
  const reduire = () => {
    player.dock({
      titre: oeuvre.titre,
      auteur: oeuvre.auteur,
      cover: oeuvre.cover,
      media: isPlayable(oeuvre.media) ? oeuvre.media : undefined,
      couleur: type.couleur,
      slug,
    });
    onClose();
  };
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [oeuvre.id]);

  const echo = oeuvre.titre.split(/\s+/)[0] ?? oeuvre.titre;
  const related = voisins.map((v) => byId.get(v.id)).filter((o): o is Oeuvre => !!o);

  return (
    <aside
      className="panneau"
      aria-label={`Fiche : ${oeuvre.titre}`}
      style={{ ["--type" as string]: type.couleur }}
    >
      <div className="panneau__bar">
        <span className="tag tag--sans" style={{ background: type.couleur }}>
          {type.label}
        </span>
        <div className="panneau__actions">
          {peutReduire && (
            <button type="button" className="ctrl-btn ctrl-btn--text" onClick={reduire}>
              Réduire
            </button>
          )}
          <button type="button" className="ctrl-btn" onClick={onClose} aria-label="Fermer la fiche">
            ×
          </button>
        </div>
      </div>

      <div className="panneau__body" ref={bodyRef} key={oeuvre.id}>
        <div className="panneau__head">
          <div className="panneau__cover">
            <Thumb o={oeuvre} />
          </div>
          <div className="panneau__info">
            <span className="panneau__echo" aria-hidden="true">
              {echo}
            </span>
            <h2 className="panneau__title">{oeuvre.titre}</h2>
            <p className="panneau__author">{oeuvre.auteur}</p>
            {(oeuvre.annee || oeuvre.genre) && (
              <p className="panneau__meta">{[oeuvre.annee, oeuvre.genre].filter(Boolean).join(" · ")}</p>
            )}
          </div>
        </div>

        <Ecouter oeuvre={oeuvre} couleur={type.couleur} />

        {oeuvre.description && <p className="panneau__desc">{oeuvre.description}</p>}

        <section className="panneau__liens">
          <h3 className="panneau__h">
            Connexions <span className="panneau__n">{related.length}</span>
          </h3>
          {related.length > 0 ? (
            <ul className="panneau__grid">
              {related.map((o) => (
                <li key={o.id} style={{ ["--type" as string]: TYPES_OEUVRE[o.type].couleur }}>
                  <button type="button" className="mini-tile" onClick={() => onSelect(o.id)} title={`${o.titre} — ${o.auteur}`}>
                    <span className="mini-tile__cover">
                      <Thumb o={o} petite />
                    </span>
                    <span className="mini-tile__title">{o.titre}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="panneau__empty">Pas encore reliée à une autre œuvre.</p>
          )}
        </section>
      </div>
    </aside>
  );
}
