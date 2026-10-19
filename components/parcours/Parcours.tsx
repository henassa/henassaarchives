"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DonneesParcours, OeuvreParcours } from "@/lib/jeux";
import { FiltresJeuBarre, useFiltresJeu, type FiltresJeu } from "@/components/jeux/Filtres";
import { copier } from "@/components/jeux/commun";
import { Epreuve } from "./Epreuves";
import { EPREUVES, SCORE_MAX, epreuvesPossibles, faireGraphe, infoEpreuve, pastille, tirerPartie, type Epreuve as IdEpreuve, type Graphe, type Manche, type Resultat } from "./moteur";

/*
 * Le Parcours, en solo : on choisit les œuvres (filtres), les épreuves et le nombre
 * de manches, puis on les enchaîne.
 * Le multijoueur est dans ParcoursSalon.
 */

export const NOMBRES_MANCHES = [3, 6, 9, 12];

/** Ce qu'il faut à toutes les épreuves, calculé une fois. */
export function useOutilsParcours(d: DonneesParcours) {
  const g = useMemo(() => faireGraphe(d), [d]);
  const parCle = useMemo(() => new Map(d.oeuvres.map((o) => [o.cle, o])), [d]);
  return { g, parCle };
}

/** Réglages d'une partie libre (aussi utilisés par l'hôte d'un salon). */
export function useReglages(d: DonneesParcours, g: Graphe) {
  const f = useFiltresJeu(d.oeuvres);
  const [choisies, setChoisies] = useState<IdEpreuve[]>(EPREUVES.map((e) => e.id));
  const [nombre, setNombre] = useState(6);
  // les épreuves faisables avec ces filtres (on attend un peu que les filtres se posent)
  const [possibles, setPossibles] = useState<Set<IdEpreuve>>(() => new Set(EPREUVES.map((e) => e.id)));
  useEffect(() => {
    const t = setTimeout(() => setPossibles(epreuvesPossibles(d, g, f.vivier)), 60);
    return () => clearTimeout(t);
  }, [d, g, f.vivier]);
  const actives = choisies.filter((e) => possibles.has(e));
  const basculer = (e: IdEpreuve) => setChoisies((l) => (l.includes(e) ? l.filter((x) => x !== e) : [...l, e]));
  const tirer = useCallback((r: () => number = Math.random) => tirerPartie(d, g, f.vivier, actives, nombre, r), [d, g, f.vivier, actives, nombre]);
  return { f, choisies, basculer, nombre, setNombre, possibles, actives, tirer };
}
export type Reglages = ReturnType<typeof useReglages>;

/** Le panneau de réglages : œuvres, épreuves, nombre de manches. */
export function PanneauReglages({ r, id, extra }: { r: Reglages; id: string; extra?: React.ReactNode }) {
  return (
    <>
      <div className="dl-bloc">
        <h2 className="dl-h">Quelles œuvres ?</h2>
        <FiltresJeuBarre f={r.f} id={id} />
        <p className="dl-note">{r.f.vivier.length} œuvres correspondent à ces réglages.</p>
      </div>
      <div className="dl-bloc">
        <h2 className="dl-h">Quelles épreuves ?</h2>
        <div className="pc-epreuves" role="group" aria-label="Épreuves">
          {EPREUVES.map((e) => {
            const possible = r.possibles.has(e.id);
            const on = possible && r.choisies.includes(e.id);
            return (
              <button key={e.id} type="button" className={`pc-epreuve${on ? " is-on" : ""}`} aria-pressed={on} disabled={!possible} title={possible ? e.consigne : "Pas assez d'œuvres pour cette épreuve avec ces filtres"} onClick={() => r.basculer(e.id)}>
                <span className="pc-epreuve__echo" aria-hidden="true">
                  {e.echo}
                </span>
                <span className="pc-epreuve__nom">{e.nom}</span>
                <span className="pc-epreuve__consigne">{possible ? e.consigne : "Pas assez d'œuvres avec ces filtres."}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="dl-bloc">
        <h2 className="dl-h">Combien de manches ?</h2>
        <div className="filters" role="group" aria-label="Nombre de manches">
          {NOMBRES_MANCHES.map((n) => (
            <button key={n} type="button" className={`filter dl-taille${r.nombre === n ? " is-on" : ""}`} aria-pressed={r.nombre === n} onClick={() => r.setNombre(n)}>
              {n}
            </button>
          ))}
        </div>
        {extra}
      </div>
    </>
  );
}

/** Rappel de la manche en cours : numéro, nom de l'épreuve, consigne. */
export function EnteteManche({ m, i, n, droite }: { m: Manche; i: number; n: number; droite?: React.ReactNode }) {
  const e = infoEpreuve(m.e);
  return (
    <div className="pc-entete">
      <div className="dl-entete">
        <p className="dl-tour">
          <span className="pc-entete__echo" aria-hidden="true">
            {e.echo}
          </span>
          {e.nom}
        </p>
        <p className="dl-compte">
          Manche {i + 1} / {n}
          {droite}
        </p>
      </div>
      <div className="dl-barre" role="progressbar" aria-valuemin={0} aria-valuemax={n} aria-valuenow={i} aria-label="Avancement">
        <i style={{ width: `${(i / Math.max(1, n)) * 100}%` }} />
      </div>
      <p className="pc-consigne">{e.consigne}</p>
    </div>
  );
}

/** Texte à partager : « Henassa · Le Parcours · 19.10.2026 · 4 210 pts » et une pastille par manche. */
export function textePartage(titre: string, manches: Manche[], resultats: Resultat[]) {
  const total = resultats.reduce((s, r) => s + r.score, 0);
  const lignes = manches.map((m, i) => `${pastille(resultats[i]?.score ?? 0)} ${infoEpreuve(m.e).nom}`);
  return `Henassa · Le Parcours${titre ? " · " + titre : ""} · ${total.toLocaleString("fr-FR")} / ${(manches.length * SCORE_MAX).toLocaleString("fr-FR")}\n${lignes.join("\n")}`;
}

/** Le bilan d'une partie solo, manche par manche. */
function Bilan({ manches, resultats, titre, actions }: { manches: Manche[]; resultats: Resultat[]; titre: string; actions: React.ReactNode }) {
  const total = resultats.reduce((s, r) => s + r.score, 0);
  const [copie, setCopie] = useState<"" | "ok" | "non">("");
  return (
    <div className="pc-bilan">
      <p className="dl-tour">Bilan</p>
      <p className="pc-bilan__total">
        {total.toLocaleString("fr-FR")}
        <span> / {(manches.length * SCORE_MAX).toLocaleString("fr-FR")}</span>
      </p>
      <ol className="pc-bilan__liste">
        {manches.map((m, i) => (
          <li key={i}>
            <span aria-hidden="true">{pastille(resultats[i]?.score ?? 0)}</span>
            <span className="pc-bilan__nom">{infoEpreuve(m.e).nom}</span>
            <span className="pc-bilan__resume">{resultats[i]?.resume ?? "—"}</span>
            <span className="pc-bilan__pts">{resultats[i]?.score ?? 0}</span>
          </li>
        ))}
      </ol>
      <div className="dl-actions">
        <button type="button" className="ctrl-btn ctrl-btn--text" onClick={() => copier(textePartage(titre, manches, resultats)).then((ok) => setCopie(ok ? "ok" : "non"))}>
          {copie === "ok" ? "Copié !" : "Copier le résultat"}
        </button>
        {actions}
      </div>
      {copie === "non" && <p className="mj-note pc-centre">La copie a été refusée par le navigateur.</p>}
    </div>
  );
}

type Partie = { manches: Manche[]; resultats: Resultat[]; univers: OeuvreParcours[]; numero: number };

/** Les œuvres d'un univers (pour les propositions des champs de réponse). */
export function oeuvresDeLUnivers(d: DonneesParcours, f: FiltresJeu) {
  return d.oeuvres.filter((o) => o.type === f.type);
}

export function Parcours({ d }: { d: DonneesParcours }) {
  const { g, parCle } = useOutilsParcours(d);
  const r = useReglages(d, g);
  const [partie, setPartie] = useState<Partie | null>(null);
  /** Résultat de la manche en cours, une fois finie (avant de passer à la suivante). */
  const [fait, setFait] = useState<Resultat | null>(null);
  const zone = useRef<HTMLDivElement>(null);

  const indice = partie ? partie.resultats.length : 0;
  const finie = !!partie && indice >= partie.manches.length;
  const m = partie && !finie ? partie.manches[indice] : undefined;

  const finir = useCallback((res: Resultat) => setFait(res), []);
  const suivante = () => {
    if (!partie || !fait) return;
    setPartie({ ...partie, resultats: [...partie.resultats, fait] });
    setFait(null);
    zone.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const lancer = () => {
    const manches = r.tirer();
    if (!manches.length) return;
    setPartie((p) => ({ manches, resultats: [], univers: oeuvresDeLUnivers(d, r.f), numero: (p?.numero ?? 0) + 1 }));
    setFait(null);
    setTimeout(() => zone.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const total = partie ? partie.resultats.reduce((s, x) => s + x.score, 0) + (fait?.score ?? 0) : 0;

  return (
    <div className="mj parcours" ref={zone}>
      <div className="mj-choix">
        <Link href="/mini-jeux/parcours/salon" className="sl-invite__lien pc-plusieurs">
          Jouer à plusieurs, en ligne →
        </Link>
      </div>

      {!partie && (
        <div className="dilemme dl-reglages">
          <PanneauReglages r={r} id="pc" />
          <button type="button" className="dl-lancer" onClick={lancer} disabled={!r.actives.length}>
            Lancer le parcours →
          </button>
          {!r.actives.length && <p className="dl-note">{r.possibles.size ? "Choisis au moins une épreuve." : "Pas assez d'œuvres avec ces filtres : enlèves-en un."}</p>}
        </div>
      )}

      {partie && finie && (
        <Bilan
          manches={partie.manches}
          resultats={partie.resultats}
          titre=""
          actions={
            <>
              <button type="button" className="ctrl-btn ctrl-btn--text" onClick={lancer}>
                Rejouer
              </button>
              <button type="button" className="ctrl-btn ctrl-btn--text" onClick={() => setPartie(null)}>
                Changer les réglages
              </button>
            </>
          }
        />
      )}

      {partie && m && (
        <div className="pc-manche">
          <EnteteManche m={m} i={indice} n={partie.manches.length} droite={<span className="pc-total"> · {total.toLocaleString("fr-FR")} pts</span>} />
          <Epreuve key={`${partie.numero}-${indice}`} m={m} d={d} g={g} parCle={parCle} univers={partie.univers} finir={finir} />
          {fait ? (
            <div className="pc-suite" role="status">
              <p className="pc-suite__pts">
                <span aria-hidden="true">{pastille(fait.score)}</span> +{fait.score} points
              </p>
              <p className="pc-suite__resume">{fait.resume}</p>
              <button type="button" className="dl-lancer" onClick={suivante} autoFocus>
                {indice + 1 >= partie.manches.length ? "Voir le bilan" : "Manche suivante →"}
              </button>
            </div>
          ) : (
            <div className="dl-actions">
              <button type="button" className="ctrl-btn ctrl-btn--text" onClick={() => setPartie(null)}>
                Arrêter
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
