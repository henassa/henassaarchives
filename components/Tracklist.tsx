"use client";

import { useMemo, useState } from "react";
import type { Morceau } from "@/lib/playlist";

/** Au-delà de ce nombre de titres, la liste passe en version compacte (colonnes + recherche). */
const SEUIL_COMPACT = 20;

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

export function Tracklist({ morceaux, limit }: { morceaux: Morceau[]; limit?: number }) {
  const list = limit ? morceaux.slice(0, limit) : morceaux;
  const compact = !limit && list.length > SEUIL_COMPACT;
  const [q, setQ] = useState("");

  // on garde le numéro d'origine de chaque titre, même filtré
  const visibles = useMemo(() => {
    const avecN = list.map((m, i) => ({ m, n: i + 1 }));
    const t = norm(q.trim());
    return t ? avecN.filter(({ m }) => norm(`${m.titre} ${m.artiste ?? ""}`).includes(t)) : avecN;
  }, [list, q]);

  const chiffres = String(list.length).length < 2 ? 2 : String(list.length).length;

  return (
    <>
      {compact && (
        <div className="tracklist__outils">
          <label className="tracklist__recherche">
            <span className="visually-hidden">Chercher un titre ou un artiste</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher un titre, un artiste…" />
          </label>
          <p className="tracklist__compte">{q.trim() ? `${visibles.length} / ${list.length} titres` : `${list.length} titres`}</p>
        </div>
      )}
      <ol className={`tracklist${compact ? " tracklist--compact" : ""}`}>
        {visibles.map(({ m, n }) => (
          <li key={n} className="track">
            <span className="track__n">{String(n).padStart(chiffres, "0")}</span>
            <span className="track__text">
              <span className="track__title">{m.titre}</span>
              {m.artiste && <span className="track__artist">{m.artiste}</span>}
            </span>
            {m.url && (
              <a className="track__link" href={m.url} target="_blank" rel="noopener noreferrer" aria-label={`Écouter ${m.titre}`}>
                ↗
              </a>
            )}
          </li>
        ))}
        {compact && visibles.length === 0 && <li className="tracklist__vide">Aucun titre ne correspond.</li>}
      </ol>
    </>
  );
}
