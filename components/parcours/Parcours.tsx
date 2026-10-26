"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DonneesParcours, OeuvreParcours } from "@/lib/jeux";
import { FiltresJeuBarre, useFiltresJeu, type FiltresJeu } from "@/components/jeux/Filtres";
import { copier } from "@/components/jeux/commun";
import { Epreuve } from "./Epreuves";
import { EPREUVES, NIVEAUX, SCORE_MAX, TEMPS_MANCHE, dureeManche, epreuvesPossibles, faireGraphe, infoEpreuve, pastille, tirerPartie, type Epreuve as IdEpreuve, type Graphe, type Manche, type Niveau, type Resultat } from "./moteur";

/*
 * L'Arène (anciennement « le Parcours »), en solo : on choisit les œuvres (filtres), les épreuves, le nombre
 * de manches, la difficulté et le temps, puis on les enchaîne.
 * Le multijoueur est dans ParcoursSalon.
 */

export const NOMBRES_MANCHES = [3, 6, 9, 12];
/** Sans limite de temps, les indices se dévoilent quand même, à ce rythme-là (secondes). */
const RYTHME_SANS_LIMITE = 120;

/** Le chrono d'une manche : repart à chaque « cle », s'arrête quand « actif » passe à faux. */
export function useChrono(duree: number, actif: boolean, cle: string | number) {
  const [debut, setDebut] = useState(0);
  const [maintenant, setMaintenant] = useState(0);
  useEffect(() => {
    const t = Date.now();
    setDebut(t);
    setMaintenant(t);
  }, [cle]);
  useEffect(() => {
    if (!actif) return;
    const t = setInterval(() => setMaintenant(Date.now()), 250);
    return () => clearInterval(t);
  }, [actif, cle]);
  const passe = debut ? (maintenant - debut) / 1000 : 0;
  const restant = duree > 0 ? Math.max(0, duree - passe) : Infinity;
  const progres = Math.min(1, passe / (duree > 0 ? duree : RYTHME_SANS_LIMITE));
  return { restant, progres, ecoule: duree > 0 && !!debut && restant <= 0, debut };
}

/** Le temps qui reste, en haut de la manche. */
export function Temps({ restant }: { restant: number }) {
  if (!Number.isFinite(restant)) return null;
  return (
    <span className={`pc-temps${restant <= 10 ? " is-court" : ""}`}>
      {" · "}
      {Math.floor(Math.ceil(restant) / 60)}:{String(Math.ceil(restant) % 60).padStart(2, "0")}
    </span>
  );
}

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
  const [niveau, setNiveau] = useState<Niveau>("normal");
  /** Secondes par manche ; 0 = sans limite (en solo seulement). */
  const [temps, setTemps] = useState(120);
  // les épreuves faisables avec ces filtres (on attend un peu que les filtres se posent)
  const [possibles, setPossibles] = useState<Set<IdEpreuve>>(() => new Set(EPREUVES.map((e) => e.id)));
  useEffect(() => {
    const t = setTimeout(() => setPossibles(epreuvesPossibles(d, g, f.vivier, niveau)), 60);
    return () => clearTimeout(t);
  }, [d, g, f.vivier, niveau]);
  const actives = choisies.filter((e) => possibles.has(e));
  const basculer = (e: IdEpreuve) => setChoisies((l) => (l.includes(e) ? l.filter((x) => x !== e) : [...l, e]));
  const tirer = useCallback((r: () => number = Math.random) => tirerPartie(d, g, f.vivier, actives, nombre, r, niveau), [d, g, f.vivier, actives, nombre, niveau]);
  return { f, choisies, basculer, nombre, setNombre, niveau, setNiveau, temps, setTemps, possibles, actives, tirer };
}
export type Reglages = ReturnType<typeof useReglages>;

/** Le panneau de réglages : œuvres, épreuves, nombre de manches. */
export function PanneauReglages({ r, id, sansLimite, extra }: { r: Reglages; id: string; sansLimite?: boolean; extra?: React.ReactNode }) {
  const niveau = NIVEAUX.find((n) => n.id === r.niveau)!;
  const minutes = r.temps && r.actives.length ? Math.round((r.nombre * r.actives.reduce((t, x) => t + dureeManche(x, r.temps), 0)) / r.actives.length / 60) : 0;
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
      </div>
      <div className="dl-bloc">
        <h2 className="dl-h">Difficulté</h2>
        <div className="filters" role="group" aria-label="Difficulté">
          {NIVEAUX.map((n) => (
            <button key={n.id} type="button" className={`filter${r.niveau === n.id ? " is-on" : ""}`} aria-pressed={r.niveau === n.id} onClick={() => r.setNiveau(n.id)}>
              {n.nom}
            </button>
          ))}
        </div>
        <p className="dl-note">{niveau.resume}</p>
        <h2 className="dl-h pc-sous-titre">Temps par manche</h2>
        <div className="filters" role="group" aria-label="Temps par manche">
          {[...TEMPS_MANCHE, ...(sansLimite ? [0] : [])].map((t) => (
            <button key={t} type="button" className={`filter${r.temps === t ? " is-on" : ""}`} aria-pressed={r.temps === t} onClick={() => r.setTemps(t)}>
              {t ? (t % 60 ? `${t} s` : `${t / 60} min`) : "Sans limite"}
            </button>
          ))}
        </div>
        <p className="dl-note">
          {r.temps ? `La grille a moitié plus de temps. ${minutes ? `Environ ${minutes} minute${minutes > 1 ? "s" : ""} de jeu au maximum.` : ""}` : "Pas de chrono : les indices se dévoilent quand même petit à petit."}
        </p>
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

/** Texte à partager : « Henassa · Arène · 19.10.2026 · 4 210 pts » et une pastille par manche. */
export function textePartage(titre: string, manches: Manche[], resultats: Resultat[]) {
  const total = resultats.reduce((s, r) => s + r.score, 0);
  const lignes = manches.map((m, i) => `${pastille(resultats[i]?.score ?? 0)} ${infoEpreuve(m.e).nom}`);
  return `Henassa · Arène${titre ? " · " + titre : ""} · ${total.toLocaleString("fr-FR")} / ${(manches.length * SCORE_MAX).toLocaleString("fr-FR")}\n${lignes.join("\n")}`;
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

type Partie = { manches: Manche[]; resultats: Resultat[]; univers: OeuvreParcours[]; numero: number; niveau: Niveau; temps: number };

/** Les œuvres d'un univers (gardé pour compatibilité ; les épreuves utilisent maintenant le vivier filtré). */
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

  const finir = useCallback((res: Resultat) => setFait((f) => f ?? res), []);
  const partiel = useRef<Resultat>({ score: 0, resume: "Temps écoulé" });
  const duree = partie && m ? dureeManche(m.e, partie.temps) : 0;
  const chrono = useChrono(duree, !!m && !fait, partie ? `${partie.numero}-${indice}` : "");
  // temps écoulé : on garde ce que valait la manche à ce moment-là
  useEffect(() => {
    if (m && chrono.ecoule && !fait) setFait(partiel.current);
  }, [m, chrono.ecoule, fait]);
  const suivante = () => {
    if (!partie || !fait) return;
    setPartie({ ...partie, resultats: [...partie.resultats, fait] });
    setFait(null);
    zone.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const lancer = () => {
    const manches = r.tirer();
    if (!manches.length) return;
    setPartie((p) => ({ manches, resultats: [], univers: r.f.vivier, numero: (p?.numero ?? 0) + 1, niveau: r.niveau, temps: r.temps }));
    setFait(null);
    partiel.current = { score: 0, resume: "Temps écoulé" };
    setTimeout(() => zone.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const total = partie ? partie.resultats.reduce((s, x) => s + x.score, 0) + (fait?.score ?? 0) : 0;

  return (
    <div className="mj parcours" ref={zone}>
      <div className="mj-choix">
        <Link href="/mini-jeux/arene/salon" className="sl-invite__lien pc-plusieurs">
          Jouer à plusieurs, en ligne →
        </Link>
      </div>

      {!partie && (
        <div className="dilemme dl-reglages">
          <PanneauReglages r={r} id="pc" sansLimite />
          <button type="button" className="dl-lancer" onClick={lancer} disabled={!r.actives.length}>
            Entrer dans l'arène →
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
          <EnteteManche
            m={m}
            i={indice}
            n={partie.manches.length}
            droite={
              <>
                <span className="pc-total"> · {total.toLocaleString("fr-FR")} pts</span>
                {!fait && <Temps restant={chrono.restant} />}
              </>
            }
          />
          <Epreuve key={`${partie.numero}-${indice}`} m={m} d={d} g={g} parCle={parCle} univers={partie.univers} finir={finir} partiel={partiel} tempsEcoule={chrono.ecoule} niveau={partie.niveau} progres={chrono.progres} />
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
              <button type="button" className="ctrl-btn ctrl-btn--text ctrl-btn--danger" onClick={() => setPartie(null)}>
                Arrêter
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
