"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Oeuvre } from "@/lib/oeuvres";
import { normTag } from "@/lib/liens-auto";
import { Pochette } from "./Pochette";

/*
 * Barre de recherche avec suggestions, rangées par catégorie :
 * genres et sous-genres, artistes, années, œuvres.
 * Choisir un genre, un artiste ou une année ajoute un filtre (une étiquette
 * sous la barre, qu'on retire d'un clic). Choisir une œuvre ouvre sa fiche.
 */

export type Filtre = { sorte: "genre" | "artiste" | "annee"; valeur: string; label: string };

/** Nombre de suggestions affichées par catégorie. */
const MAX = { genre: 5, artiste: 4, annee: 3, oeuvre: 6 };

type Suggestion =
  | { cle: string; sorte: "genre" | "artiste" | "annee"; label: string; categorie: string; n: number; filtre: Filtre }
  | { cle: string; sorte: "oeuvre"; label: string; categorie: string; oeuvre: Oeuvre };

/** Vrai si l'œuvre passe le filtre. */
export function correspond(o: Oeuvre, f: Filtre) {
  if (f.sorte === "artiste") return normTag(o.auteur) === f.valeur;
  if (f.sorte === "annee") return String(o.annee ?? "") === f.valeur;
  // un genre peut être le genre principal d'une œuvre et un sous-genre d'une autre
  return [o.genre ?? "", ...(o.sousGenres ?? [])].some((t) => normTag(t) === f.valeur);
}

export function Recherche({
  oeuvres,
  query,
  onQuery,
  filtres,
  onFiltres,
  onOuvrir,
}: {
  oeuvres: Oeuvre[];
  query: string;
  onQuery: (q: string) => void;
  filtres: Filtre[];
  onFiltres: (f: Filtre[]) => void;
  onOuvrir: (id: number) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [actif, setActif] = useState(-1);
  const boite = useRef<HTMLDivElement>(null);
  const id = useId();

  // Tout ce qu'on peut proposer, compté une fois
  const index = useMemo(() => {
    const genres = new Map<string, { label: string; n: number; principal: boolean }>();
    const artistes = new Map<string, { label: string; n: number }>();
    const annees = new Map<string, number>();
    for (const o of oeuvres) {
      const vus = new Set<string>();
      [o.genre ?? "", ...(o.sousGenres ?? [])].forEach((t, i) => {
        const k = normTag(t);
        if (!k || vus.has(k)) return;
        vus.add(k);
        const g = genres.get(k) ?? { label: t.trim(), n: 0, principal: false };
        g.n++;
        if (i === 0 && o.genre) g.principal = true;
        genres.set(k, g);
      });
      const ka = normTag(o.auteur);
      if (ka) artistes.set(ka, { label: artistes.get(ka)?.label ?? o.auteur, n: (artistes.get(ka)?.n ?? 0) + 1 });
      if (o.annee) annees.set(String(o.annee), (annees.get(String(o.annee)) ?? 0) + 1);
    }
    return { genres, artistes, annees };
  }, [oeuvres]);

  const suggestions = useMemo<Suggestion[]>(() => {
    const q = normTag(query);
    if (!q) return [];
    // ce qui commence par la recherche passe avant ce qui la contient
    const rang = (k: string) => (k.startsWith(q) ? 0 : k.split(" ").some((m) => m.startsWith(q)) ? 1 : 2);
    const dejaLa = (s: Filtre["sorte"], v: string) => filtres.some((f) => f.sorte === s && f.valeur === v);

    const g: Suggestion[] = [...index.genres]
      .filter(([k]) => k.includes(q) && !dejaLa("genre", k))
      .sort((a, b) => rang(a[0]) - rang(b[0]) || b[1].n - a[1].n)
      .slice(0, MAX.genre)
      .map(([k, v]) => ({ cle: `g-${k}`, sorte: "genre", label: v.label, categorie: v.principal ? "Genre" : "Sous-genre", n: v.n, filtre: { sorte: "genre", valeur: k, label: v.label } }));
    const a: Suggestion[] = [...index.artistes]
      .filter(([k]) => k.includes(q) && !dejaLa("artiste", k))
      .sort((x, y) => rang(x[0]) - rang(y[0]) || y[1].n - x[1].n)
      .slice(0, MAX.artiste)
      .map(([k, v]) => ({ cle: `a-${k}`, sorte: "artiste", label: v.label, categorie: "Artiste", n: v.n, filtre: { sorte: "artiste", valeur: k, label: v.label } }));
    const y: Suggestion[] = /^\d+$/.test(q)
      ? [...index.annees]
          .filter(([k]) => k.startsWith(q) && !dejaLa("annee", k))
          .sort((x, z) => Number(x[0]) - Number(z[0]))
          .slice(0, MAX.annee)
          .map(([k, n]) => ({ cle: `y-${k}`, sorte: "annee", label: k, categorie: "Année", n, filtre: { sorte: "annee", valeur: k, label: k } }))
      : [];
    const o: Suggestion[] = oeuvres
      .filter((x) => normTag(x.titre).includes(q))
      .sort((x, z) => rang(normTag(x.titre)) - rang(normTag(z.titre)) || x.titre.localeCompare(z.titre, "fr"))
      .slice(0, MAX.oeuvre)
      .map((x) => ({ cle: `o-${x.id}`, sorte: "oeuvre", label: x.titre, categorie: "Œuvre", oeuvre: x }));
    return [...g, ...a, ...y, ...o];
  }, [query, index, oeuvres, filtres]);

  useEffect(() => setActif(-1), [query]);

  // Clic ailleurs : on referme
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!boite.current?.contains(e.target as Node)) setOuvert(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  const choisir = (s: Suggestion) => {
    if (s.sorte === "oeuvre") onOuvrir(s.oeuvre.id);
    else onFiltres([...filtres, s.filtre]);
    onQuery("");
    setOuvert(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!suggestions.length) return;
      e.preventDefault();
      setOuvert(true);
      setActif((i) => (e.key === "ArrowDown" ? (i + 1) % suggestions.length : (i <= 0 ? suggestions.length : i) - 1));
    } else if (e.key === "Enter") {
      if (ouvert && actif >= 0 && suggestions[actif]) {
        e.preventDefault();
        choisir(suggestions[actif]!);
      } else setOuvert(false); // Entrée sans suggestion choisie : on garde le texte comme filtre
    } else if (e.key === "Escape") {
      setOuvert(false);
    } else if (e.key === "Backspace" && !query && filtres.length) {
      onFiltres(filtres.slice(0, -1));
    }
  };

  const montre = ouvert && suggestions.length > 0;
  return (
    <div className="recherche" ref={boite}>
      <label className="search recherche__champ">
        <span className="visually-hidden">Rechercher un genre, un artiste, une année ou une œuvre</span>
        <input
          type="search"
          role="combobox"
          aria-expanded={montre}
          aria-controls={`${id}-liste`}
          aria-autocomplete="list"
          aria-activedescendant={montre && actif >= 0 ? `${id}-${actif}` : undefined}
          autoComplete="off"
          placeholder="Genre, artiste, année, titre…"
          value={query}
          onChange={(e) => {
            onQuery(e.target.value);
            setOuvert(true);
          }}
          onFocus={() => setOuvert(true)}
          onKeyDown={onKeyDown}
        />
      </label>
      {montre && (
        <ul className="recherche__liste" id={`${id}-liste`} role="listbox">
          {suggestions.map((s, i) => (
            <li
              key={s.cle}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === actif}
              className={`recherche__item${i === actif ? " is-actif" : ""}`}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => choisir(s)}
              onPointerEnter={() => setActif(i)}
            >
              {s.sorte === "oeuvre" && (
                <span className="recherche__pochette">
                  <Pochette o={s.oeuvre} />
                </span>
              )}
              <span className="recherche__texte">
                <span className="recherche__label">{s.label}</span>
                <span className="recherche__detail">{s.sorte === "oeuvre" ? `${s.oeuvre.auteur}${s.oeuvre.annee ? ` · ${s.oeuvre.annee}` : ""}` : `${s.n} œuvre${s.n > 1 ? "s" : ""}`}</span>
              </span>
              <span className="recherche__categorie">{s.categorie}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Les filtres choisis, sous la barre. */
export function FiltresActifs({ filtres, onFiltres }: { filtres: Filtre[]; onFiltres: (f: Filtre[]) => void }) {
  if (!filtres.length) return null;
  const NOM = { genre: "Genre", artiste: "Artiste", annee: "Année" };
  return (
    <ul className="filtres-actifs" aria-label="Filtres choisis">
      {filtres.map((f, i) => (
        <li key={`${f.sorte}-${f.valeur}`}>
          <button type="button" onClick={() => onFiltres(filtres.filter((_, k) => k !== i))} aria-label={`Retirer le filtre ${NOM[f.sorte]} : ${f.label}`}>
            <span className="filtres-actifs__sorte">{NOM[f.sorte]}</span>
            {f.label}
            <span aria-hidden="true">×</span>
          </button>
        </li>
      ))}
      {filtres.length > 1 && (
        <li>
          <button type="button" className="filtres-actifs__tout" onClick={() => onFiltres([])}>
            Tout retirer
          </button>
        </li>
      )}
    </ul>
  );
}
