"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pochette } from "@/components/connexions/Pochette";
import { initiales, ratioPochette } from "@/components/connexions/utils";
import { TYPES_OEUVRE, type TypeOeuvre } from "@/lib/sections";
import { fondDegrade } from "./commun";
import { FiltresJeuBarre, nomUnivers, useFiltresJeu } from "./Filtres";

/*
 * Tierlist : on range les œuvres dans des rangs.
 * - souris : glisser-déposer (on peut aussi réordonner dans un rang) ;
 * - téléphone / clavier : toucher une œuvre, puis le rang où la poser ;
 * - rangs : renommer, monter, descendre, supprimer, ajouter ;
 * - couleurs : imposées, du vert (rang du haut) au rouge (rang du bas) ;
 * - le classement est gardé dans le navigateur, et se télécharge en image.
 */

export type ItemJeu = { cle: string; titre: string; auteur: string; type: TypeOeuvre; genre?: string; sousGenres?: string[]; parents?: string[]; scenes?: string[]; annee?: number; cover?: string; mini?: string };

type Rang = { id: string; nom: string; items: string[] };
type Etat = { titre: string; rangs: Rang[] };

/**
 * Dégradé des rangs : le rang du haut prend la première couleur, celui du bas
 * la dernière, et les rangs entre les deux se répartissent le long du dégradé.
 */
const DEGRADE = ["#2FD66B", "#C6E03A", "#FFC928", "#FF8A2B", "#FF2A1F"];

/** Couleur du rang n° i (0 = en haut) parmi n rangs. */
export function couleurRang(i: number, n: number) {
  const t = n > 1 ? (i / (n - 1)) * (DEGRADE.length - 1) : 0;
  const k = Math.min(Math.floor(t), DEGRADE.length - 2);
  const a = parseInt(DEGRADE[k]!.slice(1), 16), b = parseInt(DEGRADE[k + 1]!.slice(1), 16);
  const mix = (d: number) => Math.round(((a >> d) & 255) + (((b >> d) & 255) - ((a >> d) & 255)) * (t - k));
  return `rgb(${mix(16)}, ${mix(8)}, ${mix(0)})`;
}
/** Rangs de départ. */
const RANGS_DEPART = ["S", "A", "B", "C", "D"];
const STOCKAGE = "henassa-tierlist-v1";
const RESERVE = "reserve";

const etatDepart = (): Etat => ({
  titre: "Ma tierlist",
  rangs: RANGS_DEPART.map((nom, i) => ({ id: `r${i}`, nom, items: [] })),
});

export function norm(s: string) {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/* ---------- Les actions sur une tierlist (les mêmes en solo et à plusieurs) ---------- */

export type EtatTierlist = Etat;
export type ActionTierlist =
  | { t: "deplacer"; cle: string; zone: string; index?: number }
  | { t: "nom"; id: string; nom: string }
  | { t: "bouger"; id: string; sens: -1 | 1 }
  | { t: "supprimer"; id: string }
  | { t: "ajouter"; id: string }
  | { t: "titre"; titre: string }
  | { t: "vider" };

export const RANGS_MAX = 12;
export const etatTierlistDepart = (titre = "Ma tierlist"): Etat => ({ ...etatDepart(), titre });

/** Applique une action à une tierlist (sans rien modifier : renvoie la nouvelle). */
export function appliquer(e: Etat, a: ActionTierlist): Etat {
  switch (a.t) {
    case "deplacer": {
      if (a.zone !== RESERVE && !e.rangs.some((r) => r.id === a.zone)) return e;
      let idx = a.index;
      const rangs = e.rangs.map((r) => {
        const pos = r.items.indexOf(a.cle);
        if (pos === -1) return r;
        if (r.id === a.zone && idx !== undefined && pos < idx) idx--;
        return { ...r, items: r.items.filter((c) => c !== a.cle) };
      });
      return {
        ...e,
        rangs: rangs.map((r) => {
          if (r.id !== a.zone) return r;
          const items = [...r.items];
          items.splice(idx === undefined ? items.length : Math.max(0, Math.min(items.length, idx)), 0, a.cle);
          return { ...r, items };
        }),
      };
    }
    case "nom":
      return { ...e, rangs: e.rangs.map((r) => (r.id === a.id ? { ...r, nom: a.nom.slice(0, 24) } : r)) };
    case "bouger": {
      const i = e.rangs.findIndex((r) => r.id === a.id);
      const j = i + a.sens;
      if (i < 0 || j < 0 || j >= e.rangs.length) return e;
      const rangs = [...e.rangs];
      [rangs[i], rangs[j]] = [rangs[j]!, rangs[i]!];
      return { ...e, rangs };
    }
    case "supprimer":
      return { ...e, rangs: e.rangs.filter((r) => r.id !== a.id) };
    case "ajouter":
      if (e.rangs.length >= RANGS_MAX || e.rangs.some((r) => r.id === a.id)) return e;
      return { ...e, rangs: [...e.rangs, { id: a.id, nom: "Nouveau", items: [] }] };
    case "titre":
      return { ...e, titre: a.titre.slice(0, 60) };
    case "vider":
      return { ...e, rangs: RANGS_DEPART.map((nom, i) => ({ id: `r${i}-${Date.now().toString(36)}`, nom, items: [] })) };
  }
  return e;
}

/** La tierlist en solo : gardée dans le navigateur. */
export function Tierlist({ oeuvres }: { oeuvres: ItemJeu[] }) {
  const parCle = useMemo(() => new Map(oeuvres.map((o) => [o.cle, o])), [oeuvres]);
  const [etat, setEtat] = useState<Etat>(etatDepart);
  const [charge, setCharge] = useState(false);

  // Reprise du classement gardé dans le navigateur
  useEffect(() => {
    try {
      const brut = localStorage.getItem(STOCKAGE);
      if (brut) {
        const e = JSON.parse(brut) as Etat;
        if (e && Array.isArray(e.rangs)) {
          setEtat({
            titre: typeof e.titre === "string" ? e.titre : "Ma tierlist",
            // on oublie les œuvres qui n'existent plus sur le site
            rangs: e.rangs.map((r) => ({ id: r.id, nom: r.nom, items: (r.items ?? []).filter((c) => parCle.has(c)) })),
          });
        }
      }
    } catch {
      /* stockage indisponible : on repart d'une tierlist vide */
    }
    setCharge(true);
  }, [parCle]);

  useEffect(() => {
    if (!charge) return;
    try {
      localStorage.setItem(STOCKAGE, JSON.stringify(etat));
    } catch {
      /* tant pis, le classement ne sera pas gardé */
    }
  }, [etat, charge]);

  const agir = useCallback((a: ActionTierlist) => setEtat((e) => appliquer(e, a)), []);
  return <PlateauTierlist oeuvres={oeuvres} parCle={parCle} etat={etat} agir={agir} />;
}

/** Les tuiles qu'un autre joueur vient de bouger : son pseudo et sa couleur. */
export type Eclair = { nom: string; teinte: number };

/**
 * Le plateau : rangs, réserve, glisser-déposer. Il ne garde rien lui-même :
 * chaque geste devient une action (« agir »), appliquée en solo par le navigateur,
 * et à plusieurs par l'hôte du salon.
 */
export function PlateauTierlist({ oeuvres, parCle, etat, agir, eclairs, placeholderTitre = "Titre de ta tierlist" }: { oeuvres: ItemJeu[]; parCle: Map<string, ItemJeu>; etat: Etat; agir: (a: ActionTierlist) => void; eclairs?: Record<string, Eclair>; placeholderTitre?: string }) {
  const [choisi, setChoisi] = useState<string | null>(null);
  const [zoom, setZoom] = useZoom();
  const f = useFiltresJeu(oeuvres);
  const [recherche, setRecherche] = useState("");
  const [confirmer, setConfirmer] = useState(false);
  const [export_, setExport] = useState<"" | "encours" | "erreur">("");

  const places = useMemo(() => new Set(etat.rangs.flatMap((r) => r.items)), [etat]);
  const reserve = useMemo(() => {
    const q = norm(recherche.trim());
    return f.vivier.filter((o) => !places.has(o.cle) && (!q || norm(`${o.titre} ${o.auteur}`).includes(q)));
  }, [f.vivier, places, recherche]);
  // ce qu'il reste à classer dans l'univers affiché
  const resteTotal = useMemo(() => oeuvres.filter((o) => o.type === f.type && !places.has(o.cle)).length, [oeuvres, f.type, places]);

  /** Déplace une œuvre vers un rang (ou la réserve), à la position voulue (fin par défaut). */
  const deplacer = useCallback((cle: string, zone: string, index?: number) => agir({ t: "deplacer", cle, zone, index }), [agir]);
  const majRang = (id: string, patch: { nom: string }) => agir({ t: "nom", id, nom: patch.nom });
  const bougerRang = (id: string, sens: -1 | 1) => agir({ t: "bouger", id, sens });
  const supprimerRang = (id: string) => agir({ t: "supprimer", id });
  const ajouterRang = () => agir({ t: "ajouter", id: `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` });

  /* ---------- Glisser-déposer à la souris ---------- */
  const [glisse, setGlisse] = useState<{ cle: string; x: number; y: number } | null>(null);
  const [cible, setCible] = useState<{ zone: string; index?: number } | null>(null);
  const depart = useRef<{ cle: string; x: number; y: number; actif: boolean } | null>(null);
  const cibleRef = useRef(cible);
  cibleRef.current = cible;
  const aGlisse = useRef(false);

  const trouverCible = useCallback(
    (x: number, y: number, cle: string) => {
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      const zoneEl = el?.closest<HTMLElement>("[data-zone]");
      if (!zoneEl) return null;
      const zone = zoneEl.dataset.zone!;
      if (zone === RESERVE) return { zone };
      const tuile = el?.closest<HTMLElement>("[data-cle]");
      const items = etat.rangs.find((r) => r.id === zone)?.items ?? [];
      if (tuile && tuile.dataset.cle !== cle && zoneEl.contains(tuile)) {
        const r = tuile.getBoundingClientRect();
        const i = items.indexOf(tuile.dataset.cle!);
        if (i !== -1) return { zone, index: i + (x > r.left + r.width / 2 ? 1 : 0) };
      }
      return { zone };
    },
    [etat.rangs]
  );

  useEffect(() => {
    // Pendant qu'on glisse, la page défile toute seule près du haut et du bas de l'écran
    let defile = 0;
    let dernier = { x: 0, y: 0 };
    const boucle = () => {
      const d = depart.current;
      if (!d?.actif) return;
      const bord = 90;
      const v = dernier.y < bord ? -(bord - dernier.y) / 5 : dernier.y > window.innerHeight - bord ? (dernier.y - (window.innerHeight - bord)) / 5 : 0;
      if (v) {
        window.scrollBy(0, v);
        setCible(trouverCible(dernier.x, dernier.y, d.cle));
      }
      defile = requestAnimationFrame(boucle);
    };
    const move = (e: PointerEvent) => {
      const d = depart.current;
      if (!d) return;
      if (!d.actif && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return;
      if (!d.actif) {
        d.actif = true;
        defile = requestAnimationFrame(boucle);
      }
      dernier = { x: e.clientX, y: e.clientY };
      aGlisse.current = true;
      setChoisi(null);
      setGlisse({ cle: d.cle, x: e.clientX, y: e.clientY });
      setCible(trouverCible(e.clientX, e.clientY, d.cle));
    };
    const up = () => {
      const d = depart.current;
      depart.current = null;
      cancelAnimationFrame(defile);
      if (d?.actif) {
        const c = cibleRef.current;
        if (c) deplacer(d.cle, c.zone, c.index);
        setGlisse(null);
        setCible(null);
        // le clic qui suit le relâchement ne doit pas sélectionner l'œuvre
        setTimeout(() => (aGlisse.current = false), 0);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      cancelAnimationFrame(defile);
    };
  }, [deplacer, trouverCible]);

  const tuile = (o: ItemJeu) => (
    <li className="tl-tuile-li" key={o.cle}>
      <button
        type="button"
        data-cle={o.cle}
        className={`tl-tuile${choisi === o.cle ? " is-choisi" : ""}${glisse?.cle === o.cle ? " is-glisse" : ""}${eclairs?.[o.cle] ? " is-eclair" : ""}`}
        style={{ ["--type" as string]: TYPES_OEUVRE[o.type].couleur, ...(eclairs?.[o.cle] ? { ["--teinte" as string]: eclairs[o.cle]!.teinte } : {}) }}
        title={`${o.titre} — ${o.auteur}`}
        aria-label={`${o.titre}, ${o.auteur}`}
        aria-pressed={choisi === o.cle}
        onPointerDown={(e) => {
          if (e.pointerType === "touch" || e.button !== 0) return;
          depart.current = { cle: o.cle, x: e.clientX, y: e.clientY, actif: false };
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (aGlisse.current) return;
          setChoisi((c) => (c === o.cle ? null : o.cle));
        }}
      >
        <Pochette o={o} petite />
        {eclairs?.[o.cle] && <span className="tl-eclair">{eclairs[o.cle]!.nom}</span>}
      </button>
    </li>
  );

  const poser = (zone: string) => {
    if (!choisi) return;
    deplacer(choisi, zone);
    setChoisi(null);
  };

  /* ---------- Image à télécharger ---------- */
  const telecharger = async () => {
    setExport("encours");
    try {
      // l'image reprend le zoom des rangs : au plus grand, les pochettes sont aussi grandes dans l'image
      await enregistrerImage(await imageTierlist(etat.titre, etat.rangs, parCle, "", zoom.rangs), etat.titre);
      setExport("");
    } catch {
      setExport("erreur");
    }
  };

  const fantome = glisse ? parCle.get(glisse.cle) : undefined;
  const choisiOeuvre = choisi ? parCle.get(choisi) : undefined;

  return (
    <div className={`tierlist${glisse ? " is-glissant" : ""}${choisi ? " is-choix" : ""}`}>
      <div className="tl-barre">
        <label className="tl-titre">
          <span className="visually-hidden">Titre de la tierlist</span>
          <input id="tl-titre" value={etat.titre} maxLength={60} onChange={(e) => agir({ t: "titre", titre: e.target.value })} placeholder={placeholderTitre} />
        </label>
        <div className="tl-actions">
          <Zoom valeur={zoom.rangs} onChange={(v) => setZoom({ ...zoom, rangs: v })} nom="Taille des pochettes de la tierlist" />
          <button type="button" className="ctrl-btn ctrl-btn--text" onClick={ajouterRang} disabled={etat.rangs.length >= RANGS_MAX}>
            + Rang
          </button>
          <button type="button" className="ctrl-btn ctrl-btn--text" onClick={telecharger} disabled={export_ === "encours" || places.size === 0}>
            {export_ === "encours" ? "Préparation…" : "Télécharger l'image"}
          </button>
          {confirmer ? (
            <>
              <button
                type="button"
                className="ctrl-btn ctrl-btn--text tl-danger"
                onClick={() => {
                  agir({ t: "vider" });
                  setConfirmer(false);
                  setChoisi(null);
                }}
              >
                Oui, tout effacer
              </button>
              <button type="button" className="ctrl-btn ctrl-btn--text" onClick={() => setConfirmer(false)}>
                Annuler
              </button>
            </>
          ) : (
            <button type="button" className="ctrl-btn ctrl-btn--text ctrl-btn--danger" onClick={() => setConfirmer(true)}>
              Recommencer
            </button>
          )}
        </div>
      </div>
      {export_ === "erreur" && <p className="tl-message">L&apos;image n&apos;a pas pu être créée. Réessaie, ou fais une capture d&apos;écran.</p>}

      {choisiOeuvre && (
        <p className="tl-message" role="status">
          <strong>{choisiOeuvre.titre}</strong> est sélectionnée : touche un rang pour la poser, ou la réserve pour la retirer.
        </p>
      )}

      <ol className="tl-rangs" style={{ ["--tlz" as string]: zoom.rangs }}>
        {etat.rangs.map((r, i) => (
          <li key={r.id} className={`tl-rang${cible?.zone === r.id ? " is-cible" : ""}`} style={{ ["--rang" as string]: couleurRang(i, etat.rangs.length) }}>
            <div className="tl-rang__nom">
              <input
                id={`tl-nom-${r.id}`}
                value={r.nom}
                maxLength={24}
                style={{ ["--n" as string]: Math.max(1, [...r.nom].length) }}
                aria-label={`Nom du rang ${i + 1}`}
                onChange={(e) => majRang(r.id, { nom: e.target.value })}
              />
            </div>
            {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
            <ul className="tl-rang__items" data-zone={r.id} onClick={() => poser(r.id)}>
              {r.items.map((cle, k) => {
                const o = parCle.get(cle);
                if (!o) return null;
                return (
                  <FragmentMarque key={cle} montrer={cible?.zone === r.id && cible.index === k}>
                    {tuile(o)}
                  </FragmentMarque>
                );
              })}
              {cible?.zone === r.id && (cible.index === undefined || cible.index >= r.items.length) && <li className="tl-marque" aria-hidden="true" />}
              {choisi && (
                <li className="tl-poser">
                  <button type="button" onClick={(e) => { e.stopPropagation(); poser(r.id); }}>
                    Poser ici
                  </button>
                </li>
              )}
            </ul>
            <div className="tl-rang__outils">
              <button type="button" onClick={() => bougerRang(r.id, -1)} disabled={i === 0} aria-label={`Monter le rang ${r.nom}`} title="Monter">
                ↑
              </button>
              <button type="button" onClick={() => bougerRang(r.id, 1)} disabled={i === etat.rangs.length - 1} aria-label={`Descendre le rang ${r.nom}`} title="Descendre">
                ↓
              </button>
              <button type="button" onClick={() => supprimerRang(r.id)} aria-label={`Supprimer le rang ${r.nom}`} title="Supprimer (ses œuvres retournent dans la réserve)">
                ×
              </button>
            </div>
          </li>
        ))}
      </ol>

      <section className={`tl-reserve${cible?.zone === RESERVE ? " is-cible" : ""}`} aria-label="Réserve">
        <div className="tl-reserve__barre">
          <h2 className="tl-reserve__h">
            Réserve <span>{resteTotal}</span>
          </h2>
          <Zoom valeur={zoom.reserve} onChange={(v) => setZoom({ ...zoom, reserve: v })} nom="Taille des pochettes de la réserve" />
          <label className="search">
            <span className="visually-hidden">Rechercher une œuvre</span>
            <input id="tl-recherche" type="search" placeholder="Rechercher…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
          </label>
        </div>
        <div className="tl-reserve__filtres">
          <FiltresJeuBarre f={f} id="tl" />
        </div>
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
        <ul className="tl-reserve__items" data-zone={RESERVE} onClick={() => poser(RESERVE)} style={{ ["--tlz" as string]: zoom.reserve }}>
          {reserve.map((o) => tuile(o))}
          {reserve.length === 0 && <li className="tl-vide">{resteTotal === 0 ? `${nomUnivers(f.type)} : tout est classé.` : "Aucune œuvre ne correspond à ces filtres."}</li>}
        </ul>
      </section>

      {fantome && glisse && (
        <div className="tl-fantome" style={{ left: glisse.x, top: glisse.y }} aria-hidden="true">
          <Pochette o={fantome} lazy={false} petite />
        </div>
      )}
    </div>
  );
}

/** Affiche le repère d'insertion juste avant l'élément. */
function FragmentMarque({ montrer, children }: { montrer: boolean; children: React.ReactNode }) {
  return (
    <>
      {montrer && <li className="tl-marque" aria-hidden="true" />}
      {children}
    </>
  );
}

/* ---------- Zoom des pochettes (tierlist et réserve, chacun le sien) ---------- */

const STOCK_ZOOM = "henassa-tierlist-zoom";
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 1.8;
/** Le zoom avance par crans : 60 %, 80 %, 100 %… 180 %. */
const ZOOM_PAS = 0.2;
const CRANS = Array.from({ length: Math.round((ZOOM_MAX - ZOOM_MIN) / ZOOM_PAS) + 1 }, (_, i) => Math.round((ZOOM_MIN + i * ZOOM_PAS) * 10) / 10);
type Zooms = { rangs: number; reserve: number };
/** Ramène une valeur au cran le plus proche. */
const borne = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? CRANS.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a)) : 1);

/** Les deux zooms, gardés dans ce navigateur. */
function useZoom(): [Zooms, (z: Zooms) => void] {
  const [z, setZ] = useState<Zooms>({ rangs: 1, reserve: 1 });
  useEffect(() => {
    try {
      const brut = JSON.parse(localStorage.getItem(STOCK_ZOOM) ?? "null");
      if (brut) setZ({ rangs: borne(brut.rangs), reserve: borne(brut.reserve) });
    } catch {}
  }, []);
  const changer = (n: Zooms) => {
    setZ(n);
    try {
      localStorage.setItem(STOCK_ZOOM, JSON.stringify(n));
    } catch {}
  };
  return [z, changer];
}

/** Curseur « taille » par crans (60 % à 180 %) : −, les crans, +, et le pourcentage. */
function Zoom({ valeur, onChange, nom }: { valeur: number; onChange: (v: number) => void; nom: string }) {
  const pas = (d: number) => onChange(borne(valeur + d * ZOOM_PAS));
  const part = (valeur - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN);
  return (
    <div className="tl-zoom" role="group" aria-label={nom}>
      <button type="button" onClick={() => pas(-1)} disabled={valeur <= ZOOM_MIN} aria-label="Plus petit" title="Plus petit">
        −
      </button>
      <span className="tl-zoom__piste" style={{ ["--crans" as string]: CRANS.length - 1 }}>
        <input
          type="range"
          min={ZOOM_MIN}
          max={ZOOM_MAX}
          step={ZOOM_PAS}
          value={valeur}
          aria-label={nom}
          aria-valuetext={`${Math.round(valeur * 100)} %`}
          style={{ ["--v" as string]: `${part * 100}%` }}
          onChange={(e) => onChange(borne(Number(e.target.value)))}
          onDoubleClick={() => onChange(1)}
          title="Double-clic : taille normale"
        />
      </span>
      <button type="button" onClick={() => pas(1)} disabled={valeur >= ZOOM_MAX} aria-label="Plus grand" title="Plus grand">
        +
      </button>
      <span className="tl-zoom__val" aria-hidden="true">
        {Math.round(valeur * 100)} %
      </span>
    </div>
  );
}

/** Dessine une tierlist en image (PNG), avec la signature Henassa. */
export async function imageTierlist(titre: string, rangs: { nom: string; items: string[] }[], parCle: Map<string, ItemJeu>, sousTitre = "", zoom = 1) {
  // T : hauteur d'une pochette, qui suit le zoom ; les pochettes touchent le haut et le bas de leur rang
  const L = 1200, COL = 150, T = Math.round(100 * borne(zoom)), G = 3, M = 24;
  /** L'image est dessinée en double résolution : des pochettes nettes, même réduites. */
  const K = 2;
  // chaque œuvre a sa largeur : T pour un album (carré), moins pour une affiche ou une jaquette
  const largeur = (cle: string) => Math.round(T * ratioPochette(parCle.get(cle)?.type));
  const dispo = L - COL - M - G;
  // place de chaque œuvre dans son rang : décalage horizontal et numéro de ligne
  const places = rangs.map((r) => {
    let cx = 0, ligne = 0;
    return r.items.map((cle) => {
      const w = largeur(cle);
      if (cx > 0 && cx + w > dispo) {
        ligne++;
        cx = 0;
      }
      const p = { dx: cx, ligne, w };
      cx += w + G;
      return p;
    });
  });
  const hauteurs = places.map((p) => (p.length ? p[p.length - 1]!.ligne + 1 : 1) * (T + G) - G);
  const haut = sousTitre ? 140 : 110;
  const H = haut + hauteurs.reduce((a, b) => a + b + 4, 0) + 70;
  const c = document.createElement("canvas");
  c.width = L * K;
  c.height = H * K;
  const x = c.getContext("2d")!;
  await document.fonts?.ready;
  fondDegrade(x, L * K, H * K, "#3FD68A");
  // la suite se dessine en coordonnées « normales », agrandies K fois
  x.setTransform(K, 0, 0, K, 0, 0);
  x.imageSmoothingEnabled = true;
  x.imageSmoothingQuality = "high";
  x.fillStyle = "#fff";
  x.textBaseline = "middle";
  x.font = "400 54px Anton, Impact, sans-serif";
  x.fillText((titre || "Ma tierlist").toUpperCase(), M, 60, L - M * 2);
  if (sousTitre) {
    x.fillStyle = "#9a9a9a";
    x.font = "700 20px Archivo, Arial, sans-serif";
    x.fillText(sousTitre, M, 108, L - M * 2);
  }

  const images = new Map<string, HTMLImageElement>();
  await Promise.all(
    rangs
      .flatMap((r) => r.items)
      .map(
        (cle) =>
          new Promise<void>((ok) => {
            const src = parCle.get(cle)?.cover;
            if (!src) return ok();
            const img = new Image();
            img.onload = () => {
              images.set(cle, img);
              ok();
            };
            img.onerror = () => ok();
            img.src = src;
          })
      )
  );

  let y = haut;
  rangs.forEach((r, i) => {
    const h = hauteurs[i]!;
    x.fillStyle = "rgba(0, 0, 0, 0.38)";
    x.fillRect(M, y, L - M * 2, h);
    x.fillStyle = couleurRang(i, rangs.length);
    x.fillRect(M, y, COL, h);
    x.fillStyle = "#0a0a0a";
    x.textAlign = "center";
    let fs = 46;
    x.font = `400 ${fs}px Anton, Impact, sans-serif`;
    while (fs > 16 && x.measureText(r.nom.toUpperCase()).width > COL - 16) x.font = `400 ${--fs}px Anton, Impact, sans-serif`;
    x.fillText(r.nom.toUpperCase(), M + COL / 2, y + h / 2 + 2);
    r.items.forEach((cle, k) => {
      const o = parCle.get(cle);
      if (!o) return;
      const { dx, ligne, w } = places[i]![k]!;
      const tx = M + COL + G + dx;
      const ty = y + ligne * (T + G);
      const img = images.get(cle);
      if (img) {
        // la partie centrale de l'image, au format de la case (carré ou 2:3)
        const ratio = w / T;
        const sw = Math.min(img.naturalWidth, img.naturalHeight * ratio);
        const sh = sw / ratio;
        x.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, tx, ty, w, T);
      } else {
        x.fillStyle = "#1c1c1c";
        x.fillRect(tx, ty, w, T);
        x.fillStyle = TYPES_OEUVRE[o.type].couleur;
        x.fillRect(tx, ty, w, 6);
        x.fillStyle = "#fff";
        x.font = "400 40px Anton, Impact, sans-serif";
        x.fillText(initiales(o), tx + w / 2, ty + T / 2 + 3);
      }
    });
    x.textAlign = "left";
    y += h + 4;
  });
  // Signature
  x.textAlign = "right";
  x.font = "44px UnifrakturMaguntia, serif";
  x.lineWidth = 1.2;
  x.strokeStyle = "#FF4D3D";
  x.strokeText("Henassa", L - M, H - 34);
  x.font = "400 34px Anton, Impact, sans-serif";
  x.lineWidth = 6;
  x.strokeStyle = "#030303";
  x.strokeText("HENASSA", L - M - 8, H - 32);
  x.fillStyle = "#fff";
  x.fillText("HENASSA", L - M - 8, H - 32);

  const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/png"));
  if (!blob) throw new Error("image vide");
  return blob;
}

/** Fait télécharger l'image, avec un nom de fichier tiré du titre. */
export function enregistrerImage(blob: Blob, titre: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${norm(titre || "tierlist").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "tierlist"}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
