"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Lien, Oeuvre } from "@/lib/oeuvres";
import { TYPES_OEUVRE, TYPE_SLUGS, isTypeOeuvre, type TypeOeuvre } from "@/lib/sections";
import { Mosaique } from "./Mosaique";
import { Panneau } from "./Panneau";
import { FiltresActifs, Recherche, correspond, type Filtre } from "./Recherche";
import { OUVRIR_FICHE } from "@/components/player/Lecteur";
import { Toile } from "./Toile";
import { buildVoisins } from "./utils";

type Vue = "mosaique" | "carte" | "orbite";

/**
 * Les univers des Connexions. Chacun a sa mosaïque, sa carte et son orbite :
 * on n'en voit qu'un à la fois, et les œuvres ne sont reliées qu'entre elles.
 * Ces trois-là sont toujours affichés ; les autres types (livres…) n'apparaissent
 * que s'il existe des œuvres de ce type.
 */
const UNIVERS: Partial<Record<TypeOeuvre, string>> = { album: "Musique", film: "Cinéma", jeu: "Jeu vidéo" };
const nomUnivers = (t: TypeOeuvre) => UNIVERS[t] ?? TYPES_OEUVRE[t].pluriel;

function normalize(s: string) {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function Explorer({ oeuvres, liens }: { oeuvres: Oeuvre[]; liens: Lien[] }) {
  const [vue, setVue] = useState<Vue>("mosaique");
  const [type, setTypeBrut] = useState<TypeOeuvre>("album");
  const [query, setQuery] = useState("");
  /** Filtres choisis dans les suggestions de la recherche (genre, artiste, année). */
  const [filtres, setFiltres] = useState<Filtre[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [hoverId, setHoverId] = useState<number | null>(null);
  /** Œuvre au centre de l'Orbite (reste en place quand on ferme la fiche). */
  const [centreId, setCentreId] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const changeVue = (v: Vue) => {
    setVue(v);
    if (v !== "mosaique") barRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const byId = useMemo(() => new Map(oeuvres.map((o) => [o.id, o])), [oeuvres]);
  // Voisins du lien le plus fort au plus faible (ordre de la fiche)
  const voisins = useMemo(() => buildVoisins([...liens].sort((x, y) => (y.score ?? 0) - (x.score ?? 0))), [liens]);

  const univers = useMemo(() => {
    const counts = new Map<TypeOeuvre, number>();
    for (const o of oeuvres) counts.set(o.type, (counts.get(o.type) ?? 0) + 1);
    return TYPE_SLUGS.filter((t) => t in UNIVERS || counts.has(t)).map((t) => ({ t, n: counts.get(t) ?? 0 }));
  }, [oeuvres]);

  // Changer d'univers : on repart d'une recherche vide, fiche fermée
  const setType = useCallback((t: TypeOeuvre) => {
    setTypeBrut(t);
    setQuery("");
    setFiltres([]);
    setSelectedId(null);
    setCentreId(null);
    setHoverId(null);
  }, []);

  // Ouvrir une œuvre (lien partagé, lecteur) bascule dans son univers
  const ouvrir = useCallback((o: Oeuvre) => {
    setTypeBrut(o.type);
    setSelectedId(o.id);
    setCentreId(o.id);
  }, []);

  const duType = useMemo(() => oeuvres.filter((o) => o.type === type), [oeuvres, type]);

  const visibles = useMemo(() => {
    const q = normalize(query.trim());
    const nb = (id: number) => voisins.get(id)?.length ?? 0;
    return duType
      .filter((o) => filtres.every((f) => correspond(o, f)))
      .filter((o) => !q || normalize(`${o.titre} ${o.auteur} ${o.genre ?? ""} ${(o.sousGenres ?? []).join(" ")} ${o.annee ?? ""}`).includes(q))
      // les œuvres les plus reliées d'abord ; à égalité, par ordre alphabétique
      .sort((a, b) => nb(b.id) - nb(a.id) || a.titre.localeCompare(b.titre, "fr", { sensitivity: "base" }));
  }, [duType, filtres, query, voisins]);

  const liensVisibles = useMemo(() => {
    const ids = new Set(visibles.map((o) => o.id));
    return liens.filter((l) => ids.has(l.a) && ids.has(l.b));
  }, [liens, visibles]);

  // Lien partageable : /connexions?oeuvre=barter-6
  useEffect(() => {
    const key = new URLSearchParams(window.location.search).get("oeuvre");
    const found = key ? oeuvres.find((o) => o.slug === key || String(o.id) === key) : undefined;
    const u = new URLSearchParams(window.location.search).get("univers");
    if (found) ouvrir(found);
    else if (u && isTypeOeuvre(u)) setTypeBrut(u);
    else {
      // par défaut : le premier univers qui contient des œuvres
      const premier = TYPE_SLUGS.find((t) => oeuvres.some((o) => o.type === t));
      if (premier) setTypeBrut(premier);
    }
    const v = new URLSearchParams(window.location.search).get("vue");
    if (v === "carte" || v === "toile") setVue("carte");
    if (v === "orbite") setVue("orbite");
  }, [byId, oeuvres, ouvrir]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const sel = selectedId !== null ? byId.get(selectedId) : undefined;
    if (sel) url.searchParams.set("oeuvre", sel.slug ?? String(sel.id));
    else url.searchParams.delete("oeuvre");
    if (vue !== "mosaique") url.searchParams.set("vue", vue);
    else url.searchParams.delete("vue");
    if (type !== "album") url.searchParams.set("univers", type);
    else url.searchParams.delete("univers");
    window.history.replaceState(null, "", url);
  }, [selectedId, vue, type, byId]);

  // Choisir une œuvre : ouvre sa fiche, et c'est elle qui sera au centre de l'Orbite.
  // On reste dans la vue en cours.
  const select = useCallback((id: number) => {
    setSelectedId(id);
    setCentreId(id);
  }, []);
  const close = useCallback(() => {
    setSelectedId(null);
  }, []);

  // Bouton « Fiche » du lecteur : rouvre la fiche de l'œuvre
  useEffect(() => {
    const onOpen = (e: Event) => {
      const key = (e as CustomEvent<string>).detail;
      const found = oeuvres.find((o) => o.slug === key || String(o.id) === key);
      if (found) ouvrir(found);
    };
    window.addEventListener(OUVRIR_FICHE, onOpen);
    return () => window.removeEventListener(OUVRIR_FICHE, onOpen);
  }, [oeuvres, ouvrir]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedId !== null) close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedId, close]);

  const selected = selectedId !== null ? byId.get(selectedId) : undefined;

  // Centre de l'Orbite : l'œuvre choisie, sinon la plus reliée parmi celles affichées
  const centreOrbite = useMemo(() => {
    const ids = new Set(visibles.map((o) => o.id));
    if (centreId !== null && ids.has(centreId)) return centreId;
    let best: number | null = null;
    let max = -1;
    for (const o of visibles) {
      const n = liensVisibles.filter((l) => l.a === o.id || l.b === o.id).length;
      if (n > max) {
        max = n;
        best = o.id;
      }
    }
    return best;
  }, [centreId, visibles, liensVisibles]);
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
          {(
            [
              ["mosaique", "Mosaïque"],
              ["carte", "Carte"],
              ["orbite", "Orbite"],
            ] as const
          ).map(([v, label]) => (
            <button key={v} type="button" className={`switch__btn${vue === v ? " is-on" : ""}`} aria-pressed={vue === v} onClick={() => changeVue(v)}>
              {label}
            </button>
          ))}
        </div>

        <div className="filters" role="group" aria-label="Univers">
          {univers.map(({ t, n }) => (
            <button
              key={t}
              type="button"
              className={`filter${type === t ? " is-on" : ""}`}
              aria-pressed={type === t}
              onClick={() => setType(t)}
              style={{ ["--type" as string]: TYPES_OEUVRE[t].couleur }}
            >
              {nomUnivers(t)} <span className="filter__n">{n}</span>
            </button>
          ))}
        </div>

        <Recherche oeuvres={duType} query={query} onQuery={setQuery} filtres={filtres} onFiltres={setFiltres} onOuvrir={select} />
      </div>

      <FiltresActifs filtres={filtres} onFiltres={setFiltres} />

      <p className="explorer__stats">
        {visibles.length} œuvre{visibles.length > 1 ? "s" : ""} · {liensVisibles.length} connexion{liensVisibles.length > 1 ? "s" : ""}
      </p>

      <div className="explorer__stage">
        {duType.length === 0 ? (
          <div className="explorer-empty">
            <p className="explorer-empty__big">{nomUnivers(type)} : bientôt.</p>
            <p>Aucune œuvre dans cet univers pour l&apos;instant.</p>
          </div>
        ) : vue === "mosaique" ? (
          <Mosaique oeuvres={visibles} voisins={voisins} focusId={focusId} selectedId={selectedId} onHover={setHoverId} onSelect={select} />
        ) : (
          <Toile
            oeuvres={visibles}
            liens={liensVisibles}
            mode={vue}
            centreId={centreOrbite}
            selectedId={selectedId}
            panneauOuvert={!!selected}
            onSelect={select}
          />
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
