"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pochette } from "@/components/connexions/Pochette";
import { initiales } from "@/components/connexions/utils";
import { TYPES_OEUVRE, type TypeOeuvre } from "@/lib/sections";
import { FiltresJeuBarre, nomUnivers, useFiltresJeu } from "./Filtres";

/*
 * Tierlist : on range les œuvres dans des rangs.
 * - souris : glisser-déposer (on peut aussi réordonner dans un rang) ;
 * - téléphone / clavier : toucher une œuvre, puis le rang où la poser ;
 * - rangs : renommer, monter, descendre, supprimer, ajouter ;
 * - couleurs : imposées, du vert (rang du haut) au rouge (rang du bas) ;
 * - le classement est gardé dans le navigateur, et se télécharge en image.
 */

export type ItemJeu = { cle: string; titre: string; auteur: string; type: TypeOeuvre; genre?: string; sousGenres?: string[]; annee?: number; cover?: string };

type Rang = { id: string; nom: string; items: string[] };
type Etat = { titre: string; rangs: Rang[] };

/**
 * Dégradé des rangs : le rang du haut prend la première couleur, celui du bas
 * la dernière, et les rangs entre les deux se répartissent le long du dégradé.
 */
const DEGRADE = ["#2FD66B", "#C6E03A", "#FFC928", "#FF8A2B", "#FF2A1F"];

/** Couleur du rang n° i (0 = en haut) parmi n rangs. */
function couleurRang(i: number, n: number) {
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

function norm(s: string) {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function Tierlist({ oeuvres }: { oeuvres: ItemJeu[] }) {
  const parCle = useMemo(() => new Map(oeuvres.map((o) => [o.cle, o])), [oeuvres]);
  const [etat, setEtat] = useState<Etat>(etatDepart);
  const [charge, setCharge] = useState(false);
  const [choisi, setChoisi] = useState<string | null>(null);
  const f = useFiltresJeu(oeuvres);
  const [recherche, setRecherche] = useState("");
  const [confirmer, setConfirmer] = useState(false);
  const [export_, setExport] = useState<"" | "encours" | "erreur">("");

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

  const places = useMemo(() => new Set(etat.rangs.flatMap((r) => r.items)), [etat]);
  const reserve = useMemo(() => {
    const q = norm(recherche.trim());
    return f.vivier.filter((o) => !places.has(o.cle) && (!q || norm(`${o.titre} ${o.auteur}`).includes(q)));
  }, [f.vivier, places, recherche]);
  // ce qu'il reste à classer dans l'univers affiché
  const resteTotal = useMemo(() => oeuvres.filter((o) => o.type === f.type && !places.has(o.cle)).length, [oeuvres, f.type, places]);

  /** Déplace une œuvre vers un rang (ou la réserve), à la position voulue (fin par défaut). */
  const deplacer = useCallback((cle: string, zone: string, index?: number) => {
    setEtat((e) => {
      let idx = index;
      const rangs = e.rangs.map((r) => {
        const pos = r.items.indexOf(cle);
        if (pos === -1) return r;
        if (r.id === zone && idx !== undefined && pos < idx) idx--;
        return { ...r, items: r.items.filter((c) => c !== cle) };
      });
      return {
        ...e,
        rangs: rangs.map((r) => {
          if (r.id !== zone) return r;
          const items = [...r.items];
          items.splice(idx ?? items.length, 0, cle);
          return { ...r, items };
        }),
      };
    });
  }, []);

  const majRang = (id: string, patch: Partial<Rang>) => setEtat((e) => ({ ...e, rangs: e.rangs.map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const bougerRang = (id: string, sens: -1 | 1) =>
    setEtat((e) => {
      const i = e.rangs.findIndex((r) => r.id === id);
      const j = i + sens;
      if (i < 0 || j < 0 || j >= e.rangs.length) return e;
      const rangs = [...e.rangs];
      [rangs[i], rangs[j]] = [rangs[j]!, rangs[i]!];
      return { ...e, rangs };
    });
  const supprimerRang = (id: string) => setEtat((e) => ({ ...e, rangs: e.rangs.filter((r) => r.id !== id) }));
  const ajouterRang = () =>
    setEtat((e) => ({
      ...e,
      rangs: [...e.rangs, { id: `r${Date.now()}`, nom: "Nouveau", items: [] }],
    }));

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
        className={`tl-tuile${choisi === o.cle ? " is-choisi" : ""}${glisse?.cle === o.cle ? " is-glisse" : ""}`}
        style={{ ["--type" as string]: TYPES_OEUVRE[o.type].couleur }}
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
      const L = 1200, COL = 150, T = 100, G = 6, M = 24;
      const parLigne = Math.floor((L - COL - M - G) / (T + G));
      const hauteurs = etat.rangs.map((r) => Math.max(1, Math.ceil(r.items.length / parLigne)) * (T + G) + G);
      const haut = 110;
      const H = haut + hauteurs.reduce((a, b) => a + b + 4, 0) + 70;
      const c = document.createElement("canvas");
      c.width = L;
      c.height = H;
      const x = c.getContext("2d")!;
      await document.fonts?.ready;
      x.fillStyle = "#0a0a0a";
      x.fillRect(0, 0, L, H);
      x.fillStyle = "#fff";
      x.textBaseline = "middle";
      x.font = "400 54px Anton, Impact, sans-serif";
      x.fillText((etat.titre || "Ma tierlist").toUpperCase(), M, 60, L - M * 2);

      const images = new Map<string, HTMLImageElement>();
      await Promise.all(
        etat.rangs
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
      etat.rangs.forEach((r, i) => {
        const h = hauteurs[i]!;
        x.fillStyle = "#1a1a1a";
        x.fillRect(M, y, L - M * 2, h);
        x.fillStyle = couleurRang(i, etat.rangs.length);
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
          const tx = M + COL + G + (k % parLigne) * (T + G);
          const ty = y + G + Math.floor(k / parLigne) * (T + G);
          const img = images.get(cle);
          if (img) {
            const s = Math.min(img.naturalWidth, img.naturalHeight);
            x.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, tx, ty, T, T);
          } else {
            x.fillStyle = "#2a2a2a";
            x.fillRect(tx, ty, T, T);
            x.fillStyle = TYPES_OEUVRE[o.type].couleur;
            x.fillRect(tx, ty, T, 6);
            x.fillStyle = "#fff";
            x.font = "400 40px Anton, Impact, sans-serif";
            x.fillText(initiales(o), tx + T / 2, ty + T / 2 + 3);
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
      x.strokeStyle = "#0a0a0a";
      x.strokeText("HENASSA", L - M - 8, H - 32);
      x.fillStyle = "#fff";
      x.fillText("HENASSA", L - M - 8, H - 32);

      const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/png"));
      if (!blob) throw new Error("image vide");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${norm(etat.titre || "tierlist").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "tierlist"}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
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
          <input id="tl-titre" value={etat.titre} maxLength={60} onChange={(e) => setEtat((s) => ({ ...s, titre: e.target.value }))} placeholder="Titre de ta tierlist" />
        </label>
        <div className="tl-actions">
          <button type="button" className="ctrl-btn ctrl-btn--text" onClick={ajouterRang}>
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
                  setEtat(etatDepart());
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
            <button type="button" className="ctrl-btn ctrl-btn--text" onClick={() => setConfirmer(true)}>
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

      <ol className="tl-rangs">
        {etat.rangs.map((r, i) => (
          <li key={r.id} className={`tl-rang${cible?.zone === r.id ? " is-cible" : ""}`} style={{ ["--rang" as string]: couleurRang(i, etat.rangs.length) }}>
            <div className="tl-rang__nom">
              <input
                id={`tl-nom-${r.id}`}
                value={r.nom}
                maxLength={24}
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
          <label className="search">
            <span className="visually-hidden">Rechercher une œuvre</span>
            <input id="tl-recherche" type="search" placeholder="Rechercher…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
          </label>
        </div>
        <div className="tl-reserve__filtres">
          <FiltresJeuBarre f={f} id="tl" />
        </div>
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
        <ul className="tl-reserve__items" data-zone={RESERVE} onClick={() => poser(RESERVE)}>
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
