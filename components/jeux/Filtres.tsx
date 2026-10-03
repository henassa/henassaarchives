"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { TYPES_OEUVRE, TYPE_SLUGS, type TypeOeuvre } from "@/lib/sections";

/*
 * Filtres communs à tous les mini-jeux : univers (musique, cinéma, jeu vidéo),
 * genre, sous-genre et années.
 * Les listes se resserrent au fur et à mesure : choisir un genre ne laisse
 * que les sous-genres et années qui existent dans ce genre.
 */

/** Mêmes univers que dans les Connexions : toujours affichés, même vides. */
const UNIVERS: Partial<Record<TypeOeuvre, string>> = { album: "Musique", film: "Cinéma", jeu: "Jeu vidéo" };
export const nomUnivers = (t: TypeOeuvre) => UNIVERS[t] ?? TYPES_OEUVRE[t].pluriel;

/**
 * Un choix n'est proposé dans un menu que s'il laisse au moins ce nombre
 * d'œuvres, en comptant les autres filtres déjà réglés. On ne peut donc pas
 * empiler les filtres jusqu'à n'avoir plus qu'une poignée d'œuvres.
 */
const MIN_OEUVRES_FILTRE = 20;

export type Filtrable = { type: TypeOeuvre; auteur: string; genre?: string; sousGenres?: string[]; annee?: number };
type Choix = { type: TypeOeuvre; genre: string; sousGenre: string; de: number; a: number };

const parNombre = (m: Map<string, number>) => [...m].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0], "fr"));
function compter<T>(liste: T[], cles: (o: T) => (string | undefined)[]) {
  const m = new Map<string, number>();
  for (const o of liste) for (const c of new Set(cles(o))) if (c) m.set(c, (m.get(c) ?? 0) + 1);
  return m;
}

export function useFiltresJeu<T extends Filtrable>(oeuvres: T[]) {
  // univers de départ : le premier qui contient des œuvres
  const [c, setC] = useState<Choix>(() => ({
    type: TYPE_SLUGS.find((t) => oeuvres.some((o) => o.type === t)) ?? "album",
    genre: "",
    sousGenre: "",
    de: 0,
    a: 0,
  }));

  const univers = useMemo(() => TYPE_SLUGS.filter((t) => t in UNIVERS || oeuvres.some((o) => o.type === t)).map((t) => ({ t, n: oeuvres.filter((o) => o.type === t).length })), [oeuvres]);

  /** Œuvres qui passent tous les filtres, sauf celui qu'on est en train de régler. */
  const passe = useCallback(
    (o: T, sauf?: keyof Choix) =>
      o.type === c.type &&
      (sauf === "genre" || !c.genre || o.genre === c.genre) &&
      (sauf === "sousGenre" || !c.sousGenre || (o.sousGenres ?? []).includes(c.sousGenre)) &&
      (sauf === "de" || !c.de || (o.annee ?? 0) >= c.de) &&
      (sauf === "a" || !c.a || (!!o.annee && o.annee <= c.a)),
    [c]
  );

  const vivier = useMemo(() => oeuvres.filter((o) => passe(o)), [oeuvres, passe]);
  const assez = (l: [string, number][]) => l.filter(([, n]) => n >= MIN_OEUVRES_FILTRE);
  const genres = useMemo(() => assez(parNombre(compter(oeuvres.filter((o) => passe(o, "genre")), (o) => [o.genre]))), [oeuvres, passe]);
  const sousGenres = useMemo(() => assez(parNombre(compter(oeuvres.filter((o) => passe(o, "sousGenre")), (o) => o.sousGenres ?? []))), [oeuvres, passe]);
  // toutes les années de l'univers (pour afficher la première et la dernière)
  const annees = useMemo(() => [...new Set(oeuvres.filter((o) => o.type === c.type && o.annee).map((o) => o.annee!))].sort((x, y) => x - y), [oeuvres, c.type]);
  // « Depuis » et « Jusqu'à » : seulement les années qui laissent assez d'œuvres
  const anneesDe = useMemo(() => {
    const reste = oeuvres.filter((o) => passe(o, "de"));
    return annees.filter((y) => (!c.a || y <= c.a) && reste.filter((o) => (o.annee ?? 0) >= y).length >= MIN_OEUVRES_FILTRE);
  }, [oeuvres, passe, annees, c.a]);
  const anneesA = useMemo(() => {
    const reste = oeuvres.filter((o) => passe(o, "a"));
    return annees.filter((y) => (!c.de || y >= c.de) && reste.filter((o) => !!o.annee && o.annee <= y).length >= MIN_OEUVRES_FILTRE);
  }, [oeuvres, passe, annees, c.de]);

  const regler = useCallback((patch: Partial<Choix>) => {
    setC((avant) => {
      // changer d'univers remet les autres filtres à zéro
      if (patch.type && patch.type !== avant.type) return { type: patch.type, genre: "", sousGenre: "", de: 0, a: 0 };
      const n = { ...avant, ...patch };
      if (n.de && n.a && n.de > n.a) {
        if ("de" in patch) n.a = n.de;
        else n.de = n.a;
      }
      return n;
    });
  }, []);
  const actifs = [c.genre, c.sousGenre, c.de, c.a].filter(Boolean).length;
  const vider = useCallback(() => setC((avant) => ({ type: avant.type, genre: "", sousGenre: "", de: 0, a: 0 })), []);

  return { ...c, regler, vider, actifs, univers, genres, sousGenres, annees, anneesDe, anneesA, vivier };
}

export type FiltresJeu = ReturnType<typeof useFiltresJeu>;

/** Au-delà de ce nombre de choix, le menu affiche un champ pour chercher dedans. */
const SEUIL_RECHERCHE = 12;

function norm(t: string) {
  return t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/**
 * Menu déroulant maison (à la place du menu du navigateur) :
 * le bouton affiche « GENRE · Neo-Soul », la liste s'ouvre dessous.
 */
function Menu({ nom, valeur, tous, options, onChange }: { nom: string; valeur: string; tous: string; options: [string, number | null][]; onChange: (v: string) => void }) {
  const [ouvert, setOuvert] = useState(false);
  const [q, setQ] = useState("");
  const boite = useRef<HTMLDivElement>(null);
  const idListe = useId();

  // Clic ailleurs ou Échap : on referme
  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: PointerEvent) => {
      if (!boite.current?.contains(e.target as Node)) setOuvert(false);
    };
    const touche = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOuvert(false);
      boite.current?.querySelector<HTMLButtonElement>(".jf-menu__btn")?.focus();
    };
    document.addEventListener("pointerdown", dehors);
    document.addEventListener("keydown", touche, true);
    return () => {
      document.removeEventListener("pointerdown", dehors);
      document.removeEventListener("keydown", touche, true);
    };
  }, [ouvert]);

  const visibles = useMemo(() => {
    const n = norm(q.trim());
    return n ? options.filter(([v]) => norm(v).includes(n)) : options;
  }, [options, q]);

  const choisir = (v: string) => {
    onChange(v);
    setOuvert(false);
    setQ("");
  };
  // Flèches haut / bas pour se déplacer dans la liste
  const fleches = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const items = [...(boite.current?.querySelectorAll<HTMLButtonElement>(".jf-menu__item") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    items[Math.max(0, Math.min(items.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))]?.focus();
  };

  return (
    <div className={`jf-menu${valeur ? " is-on" : ""}${ouvert ? " is-ouvert" : ""}`} ref={boite} onKeyDown={fleches}>
      <button type="button" className="jf-menu__btn" aria-haspopup="listbox" aria-expanded={ouvert} aria-controls={idListe} disabled={!valeur && options.length === 0} title={!valeur && options.length === 0 ? "Pas assez d'œuvres pour filtrer davantage" : undefined} onClick={() => setOuvert((o) => !o)}>
        <span className="jf-menu__nom">{nom}</span>
        <span className="jf-menu__val">{valeur || tous}</span>
        <span className="jf-menu__fleche" aria-hidden="true" />
      </button>
      {ouvert && (
        <div className="jf-menu__panneau">
          {options.length > SEUIL_RECHERCHE && (
            <input className="jf-menu__q" type="search" autoComplete="off" autoFocus placeholder="Chercher…" aria-label={`Chercher : ${nom}`} value={q} onChange={(e) => setQ(e.target.value)} />
          )}
          <ul className="jf-menu__liste" id={idListe} role="listbox" aria-label={nom}>
            {!q && (
              <li role="option" aria-selected={!valeur}>
                <button type="button" className={`jf-menu__item${!valeur ? " is-choisi" : ""}`} onClick={() => choisir("")}>
                  <span>{tous}</span>
                </button>
              </li>
            )}
            {visibles.map(([v, n]) => (
              <li key={v} role="option" aria-selected={v === valeur}>
                <button type="button" className={`jf-menu__item${v === valeur ? " is-choisi" : ""}`} onClick={() => choisir(v)}>
                  <span>{v}</span>
                  {n !== null && <span className="jf-menu__n">{n}</span>}
                </button>
              </li>
            ))}
            {visibles.length === 0 && <li className="jf-menu__vide">Rien ne correspond.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Boutons d'univers + menus. */
export function FiltresJeuBarre({ f }: { f: FiltresJeu; id?: string }) {
  const ans = (l: number[]) => l.map((a) => [String(a), null] as [string, null]);
  return (
    <div className="jf">
      <div className="filters" role="group" aria-label="Univers">
        {f.univers.map(({ t, n }) => (
          <button key={t} type="button" className={`filter${f.type === t ? " is-on" : ""}`} aria-pressed={f.type === t} disabled={n === 0} style={{ ["--type" as string]: TYPES_OEUVRE[t].couleur }} onClick={() => f.regler({ type: t })}>
            {nomUnivers(t)} <span className="filter__n">{n}</span>
          </button>
        ))}
      </div>
      <div className="jf__listes">
        <Menu nom="Genre" valeur={f.genre} tous="Tous" options={f.genres} onChange={(v) => f.regler({ genre: v })} />
        <Menu nom="Sous-genre" valeur={f.sousGenre} tous="Tous" options={f.sousGenres} onChange={(v) => f.regler({ sousGenre: v })} />
        {f.annees.length > 1 && (
          <>
            <Menu nom="Depuis" valeur={f.de ? String(f.de) : ""} tous={String(f.annees[0])} options={ans(f.anneesDe)} onChange={(v) => f.regler({ de: Number(v) || 0 })} />
            <Menu nom="Jusqu'à" valeur={f.a ? String(f.a) : ""} tous={String(f.annees[f.annees.length - 1])} options={ans(f.anneesA)} onChange={(v) => f.regler({ a: Number(v) || 0 })} />
          </>
        )}
        {f.actifs > 0 && (
          <button type="button" className="jf__vider" onClick={f.vider}>
            Effacer les filtres
          </button>
        )}
      </div>
    </div>
  );
}
