"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Lien, Oeuvre } from "@/lib/oeuvres";
import { TYPES_OEUVRE, TYPE_SLUGS, type TypeOeuvre } from "@/lib/sections";
import { Mosaique } from "./Mosaique";
import { Panneau } from "./Panneau";
import { OUVRIR_FICHE } from "@/components/player/Lecteur";
import { Toile } from "./Toile";
import { buildVoisins } from "./utils";

type Vue = "mosaique" | "toile";

function normalize(s: string) {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function Explorer({ oeuvres, liens }: { oeuvres: Oeuvre[]; liens: Lien[] }) {
  const [vue, setVue] = useState<Vue>("mosaique");
  const [type, setType] = useState<TypeOeuvre | "tout">("tout");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [hoverId, setHoverId] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const changeVue = (v: Vue) => {
    setVue(v);
    if (v === "toile") barRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const byId = useMemo(() => new Map(oeuvres.map((o) => [o.id, o])), [oeuvres]);
  const voisins = useMemo(() => buildVoisins(liens), [liens]);

  const typesPresents = useMemo(() => {
    const counts = new Map<TypeOeuvre, number>();
    for (const o of oeuvres) counts.set(o.type, (counts.get(o.type) ?? 0) + 1);
    return TYPE_SLUGS.filter((t) => counts.has(t)).map((t) => ({ t, n: counts.get(t)! }));
  }, [oeuvres]);

  const visibles = useMemo(() => {
    const q = normalize(query.trim());
    return oeuvres
      .filter((o) => type === "tout" || o.type === type)
      .filter((o) => !q || normalize(`${o.titre} ${o.auteur} ${o.genre ?? ""} ${o.annee ?? ""}`).includes(q))
      .sort((a, b) => a.titre.localeCompare(b.titre, "fr", { sensitivity: "base" }));
  }, [oeuvres, type, query]);

  const liensVisibles = useMemo(() => {
    const ids = new Set(visibles.map((o) => o.id));
    return liens.filter((l) => ids.has(l.a) && ids.has(l.b));
  }, [liens, visibles]);

  // Lien partageable : /connexions?oeuvre=barter-6
  useEffect(() => {
    const key = new URLSearchParams(window.location.search).get("oeuvre");
    const found = key ? oeuvres.find((o) => o.slug === key || String(o.id) === key) : undefined;
    if (found) setSelectedId(found.id);
    const v = new URLSearchParams(window.location.search).get("vue");
    if (v === "toile") setVue("toile");
  }, [byId, oeuvres]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const sel = selectedId !== null ? byId.get(selectedId) : undefined;
    if (sel) url.searchParams.set("oeuvre", sel.slug ?? String(sel.id));
    else url.searchParams.delete("oeuvre");
    if (vue === "toile") url.searchParams.set("vue", "toile");
    else url.searchParams.delete("vue");
    window.history.replaceState(null, "", url);
  }, [selectedId, vue, byId]);

  const select = useCallback((id: number) => {
    setSelectedId(id);
  }, []);
  const close = useCallback(() => {
    setSelectedId(null);
  }, []);

  // Bouton « Fiche » du lecteur : rouvre la fiche de l'œuvre
  useEffect(() => {
    const onOpen = (e: Event) => {
      const key = (e as CustomEvent<string>).detail;
      const found = oeuvres.find((o) => o.slug === key || String(o.id) === key);
      if (found) setSelectedId(found.id);
    };
    window.addEventListener(OUVRIR_FICHE, onOpen);
    return () => window.removeEventListener(OUVRIR_FICHE, onOpen);
  }, [oeuvres]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedId !== null) close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedId, close]);

  const selected = selectedId !== null ? byId.get(selectedId) : undefined;
  const focusId = hoverId ?? selectedId;

  if (oeuvres.length === 0) {
    return (
      <div className="explorer-empty">
        <p className="explorer-empty__big">Aucune œuvre pour l&apos;instant.</p>
        <p>
          Lance le site en local (<code>npm run dev</code>) et ajoute tes premières œuvres depuis{" "}
          <a href="/admin">/admin</a>.
        </p>
      </div>
    );
  }

  return (
    <div className={`explorer${selected ? " explorer--panel" : ""}`}>
      <div className="explorer__bar" ref={barRef}>
        <div className="switch" role="group" aria-label="Vue">
          <button type="button" className={`switch__btn${vue === "mosaique" ? " is-on" : ""}`} aria-pressed={vue === "mosaique"} onClick={() => changeVue("mosaique")}>
            Mosaïque
          </button>
          <button type="button" className={`switch__btn${vue === "toile" ? " is-on" : ""}`} aria-pressed={vue === "toile"} onClick={() => changeVue("toile")}>
            Toile
          </button>
        </div>

        <div className="filters" role="group" aria-label="Filtrer par type">
          <button type="button" className={`filter${type === "tout" ? " is-on" : ""}`} aria-pressed={type === "tout"} onClick={() => setType("tout")}>
            Tout <span className="filter__n">{oeuvres.length}</span>
          </button>
          {typesPresents.map(({ t, n }) => (
            <button
              key={t}
              type="button"
              className={`filter${type === t ? " is-on" : ""}`}
              aria-pressed={type === t}
              onClick={() => setType(t)}
              style={{ ["--type" as string]: TYPES_OEUVRE[t].couleur }}
            >
              {TYPES_OEUVRE[t].pluriel} <span className="filter__n">{n}</span>
            </button>
          ))}
        </div>

        <label className="search">
          <span className="visually-hidden">Rechercher une œuvre</span>
          <input type="search" placeholder="Rechercher…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>

      <p className="explorer__stats">
        {visibles.length} œuvre{visibles.length > 1 ? "s" : ""} · {liensVisibles.length} connexion{liensVisibles.length > 1 ? "s" : ""}
      </p>

      <div className="explorer__stage">
        {vue === "mosaique" ? (
          <Mosaique oeuvres={visibles} voisins={voisins} focusId={focusId} selectedId={selectedId} onHover={setHoverId} onSelect={select} />
        ) : (
          <Toile oeuvres={visibles} liens={liensVisibles} voisins={voisins} selectedId={selectedId} onSelect={select} />
        )}
      </div>

      {selected && (
        <Panneau
          oeuvre={selected}
          voisins={voisins.get(selected.id) ?? []}
          byId={byId}
          onClose={close}
          onSelect={select}
        />
      )}
    </div>
  );
}
