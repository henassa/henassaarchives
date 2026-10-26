"use client";

import { Avatar } from "@/components/jeux/commun";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DonneesParcours } from "@/lib/jeux";
import type { TypeOeuvre } from "@/lib/sections";
import { HOTE, LONGUEUR_CODE, useSalon, type Joueur } from "@/components/jeux/useSalon";
import { filtrer, type ChoixFiltres } from "@/components/jeux/Filtres";
import { Epreuve } from "./Epreuves";
import { EnteteManche, PanneauReglages, Temps, useOutilsParcours, useReglages } from "./Parcours";
import { NIVEAUX, dureeManche, infoEpreuve, pastille, pointsAvecTemps, SCORE_MAX, type Manche, type Niveau, type Resultat } from "./moteur";

/*
 * L'Arène à plusieurs, en ligne : tout le monde joue la même manche en même temps,
 * chacun sur son écran, avec un temps limite. Les points : la justesse, plus un bonus
 * de rapidité. Après chaque manche, le classement ; à la fin, le podium.
 */

const MAX_JOUEURS = 12;
/** Temps d'affichage du classement d'une manche avant la suivante (millisecondes). */
const PAUSE_BILAN = 9000;
/** Marge laissée aux retardataires après la fin du temps (millisecondes). */
const MARGE_RESEAU = 3000;

type Rendu = { pts: number; score: number; resume: string };
type Etat = {
  joueurs: Joueur[];
  phase: "salon" | "manche" | "bilan" | "fin";
  manches: Manche[];
  indice: number;
  /** Durée de la manche en cours, en secondes. */
  duree: number;
  /** Réglages de la partie, choisis par l'hôte. */
  niveau: Niveau;
  tempsBase: number;
  /** Change à chaque manche : sert à ignorer un résultat arrivé en retard. */
  jeton: number;
  type: TypeOeuvre;
  /** Les filtres choisis par l'hôte : les propositions de réponse restent dans ces œuvres-là. */
  filtres?: ChoixFiltres;
  /** Résultats de la manche en cours. */
  rendus: Record<string, Rendu>;
  /** Points de toute la partie (on garde aussi ceux qui sont partis). */
  totaux: Record<string, { nom: string; pts: number; pastilles: string }>;
};
type MessageJeu = { t: "fini"; jeton: number; score: number; resume: string; restant: number };

const etatVide = (): Etat => ({ joueurs: [], phase: "salon", manches: [], indice: 0, duree: 120, niveau: "normal", tempsBase: 120, jeton: 0, type: "album", rendus: {}, totaux: {} });

export function ParcoursSalon({ d }: { d: DonneesParcours }) {
  const { g, parCle } = useOutilsParcours(d);
  const r = useReglages(d, g);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ---------- Côté hôte : l'arbitre ---------- */
  const s = useSalon<Etat>({
    prefixe: "henassa-parcours-",
    vide: etatVide,
    max: MAX_JOUEURS,
    surJeu: (id, brut) => recevoir(id, brut as MessageJeu),
    surJoueurs: () => verifierFin(),
  });
  const { lire, ecrire } = s;

  const arreterMinuteur = () => {
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = null;
  };

  const ouvrirManche = useCallback((e: Etat, indice: number): Etat => {
    const m = e.manches[indice]!;
    return { ...e, phase: "manche", indice, duree: dureeManche(m.e, e.tempsBase), jeton: e.jeton + 1, rendus: {} };
  }, []);

  /** Fin de la manche : ceux qui n'ont rien rendu marquent 0, puis le classement. */
  const clore = useCallback(() => {
    const e = lire();
    if (e.phase !== "manche") return;
    arreterMinuteur();
    const rendus = { ...e.rendus };
    const totaux = { ...e.totaux };
    for (const j of e.joueurs) {
      if (!rendus[j.id]) rendus[j.id] = { pts: 0, score: 0, resume: "Pas de réponse" };
    }
    for (const [id, x] of Object.entries(rendus)) {
      const avant = totaux[id] ?? { nom: e.joueurs.find((j) => j.id === id)?.nom ?? "?", pts: 0, pastilles: "" };
      totaux[id] = { nom: e.joueurs.find((j) => j.id === id)?.nom ?? avant.nom, pts: avant.pts + x.pts, pastilles: avant.pastilles + pastille(x.score) };
    }
    ecrire({ ...e, phase: "bilan", rendus, totaux });
    minuteur.current = setTimeout(() => suivante(), PAUSE_BILAN);
  }, [lire, ecrire]); // eslint-disable-line react-hooks/exhaustive-deps

  const suivante = useCallback(() => {
    const e = lire();
    if (e.phase !== "bilan") return;
    arreterMinuteur();
    if (e.indice + 1 >= e.manches.length) return ecrire({ ...e, phase: "fin" });
    const n = ouvrirManche(e, e.indice + 1);
    ecrire(n);
    minuteur.current = setTimeout(clore, n.duree * 1000 + MARGE_RESEAU);
  }, [lire, ecrire, ouvrirManche, clore]);

  /** Tout le monde a rendu sa manche ? Alors on n'attend pas la fin du temps. */
  const verifierFin = useCallback(() => {
    const e = lire();
    if (e.phase === "manche" && e.joueurs.length > 0 && e.joueurs.every((j) => e.rendus[j.id])) clore();
  }, [lire, clore]);

  const recevoir = useCallback(
    (id: string, m: MessageJeu) => {
      const e = lire();
      if (m?.t !== "fini" || e.phase !== "manche" || m.jeton !== e.jeton || e.rendus[id] || !e.joueurs.some((j) => j.id === id)) return;
      const score = Math.max(0, Math.min(SCORE_MAX, Math.round(Number(m.score) || 0)));
      const pts = pointsAvecTemps(score, Number(m.restant) || 0, e.duree);
      ecrire({ ...e, rendus: { ...e.rendus, [id]: { pts, score, resume: String(m.resume ?? "").slice(0, 80) } } });
      verifierFin();
    },
    [lire, ecrire, verifierFin]
  );

  const lancer = () => {
    const manches = r.tirer();
    if (!manches.length) return;
    arreterMinuteur();
    const e = lire();
    const base: Etat = { ...e, manches, type: r.f.type, filtres: r.f.choix, niveau: r.niveau, tempsBase: r.temps || 120, totaux: Object.fromEntries(e.joueurs.map((j) => [j.id, { nom: j.nom, pts: 0, pastilles: "" }])), jeton: e.jeton };
    const n = ouvrirManche(base, 0);
    ecrire(n);
    minuteur.current = setTimeout(clore, n.duree * 1000 + MARGE_RESEAU);
  };
  const retourSalon = () => {
    arreterMinuteur();
    ecrire({ ...lire(), phase: "salon", manches: [], indice: 0, rendus: {}, totaux: {} });
  };
  useEffect(() => () => arreterMinuteur(), []);

  /* ---------- Côté joueur : la manche en cours ---------- */
  const e = s.etat;
  const m = e.phase === "manche" || e.phase === "bilan" ? e.manches[e.indice] : undefined;
  const univers = useMemo(() => (e.filtres ? filtrer(d.oeuvres, e.filtres) : d.oeuvres.filter((o) => o.type === e.type)), [d, e.type, e.filtres]);
  // toutes les œuvres de la manche existent-elles sur cette version du site ?
  const manquante = useMemo(() => {
    if (!m) return false;
    const cles = m.e === "chrono" ? m.ordre : m.e === "chemin" ? [m.depart, m.arrivee] : m.e === "grille" ? [] : [m.cible];
    return cles.some((c) => !parCle.has(c));
  }, [m, parCle]);

  const [debut, setDebut] = useState(0);
  const [maintenant, setMaintenant] = useState(0);
  const [rendu, setRendu] = useState<Resultat | null>(null);
  const partiel = useRef<Resultat>({ score: 0, resume: "" });
  const envoye = useRef(-1);

  // nouvelle manche : le chrono repart, on n'a encore rien rendu
  useEffect(() => {
    if (e.phase !== "manche") return;
    setDebut(Date.now());
    setMaintenant(Date.now());
    setRendu(null);
    partiel.current = { score: 0, resume: "Temps écoulé" };
  }, [e.jeton, e.phase === "manche"]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (e.phase !== "manche") return;
    const t = setInterval(() => setMaintenant(Date.now()), 250);
    return () => clearInterval(t);
  }, [e.phase, e.jeton]);

  const restant = e.phase === "manche" && debut ? Math.max(0, e.duree - (maintenant - debut) / 1000) : 0;
  const tempsEcoule = e.phase === "bilan" || (e.phase === "manche" && !!debut && restant <= 0);
  const progres = e.phase === "manche" && debut ? Math.min(1, (maintenant - debut) / 1000 / Math.max(1, e.duree)) : e.phase === "bilan" ? 1 : 0;

  const rendre = useCallback(
    (res: Resultat, reste: number) => {
      if (envoye.current === e.jeton) return;
      envoye.current = e.jeton;
      setRendu(res);
      s.envoyer({ t: "fini", jeton: e.jeton, score: res.score, resume: res.resume, restant: reste } satisfies MessageJeu);
    },
    [e.jeton, s]
  );
  const finir = useCallback((res: Resultat) => rendre(res, Math.max(0, e.duree - (Date.now() - debut) / 1000)), [rendre, e.duree, debut]);
  // temps écoulé : on rend ce qu'on a (une grille à moitié remplie compte quand même)
  useEffect(() => {
    if (e.phase === "manche" && tempsEcoule && envoye.current !== e.jeton) rendre(partiel.current, 0);
  }, [e.phase, tempsEcoule, e.jeton, rendre]);
  // site pas à jour : la manche ne peut pas se jouer ici
  useEffect(() => {
    if (e.phase === "manche" && manquante && envoye.current !== e.jeton) rendre({ score: 0, resume: "Site pas à jour" }, 0);
  }, [e.phase, manquante, e.jeton, rendre]);

  /* ---------- Affichage ---------- */
  const [edition, setEdition] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);
  const zone = useRef<HTMLDivElement>(null);
  const enJeu = e.phase === "manche";
  useEffect(() => {
    if (enJeu) zone.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [enJeu, e.jeton]);

  if (!s.role) {
    return (
      <div className="dilemme salon">
        <div className="dl-bloc">
          <h2 className="dl-h">Ton pseudo</h2>
          <label className="sl-champ">
            <span className="visually-hidden">Ton pseudo</span>
            <input id="sl-pseudo" value={s.nom} maxLength={16} autoComplete="off" placeholder="Comment on t'appelle ?" onChange={(x) => s.setNom(x.target.value)} />
          </label>
          <p className="dl-note">C&apos;est le nom que les autres verront dans le classement. Tu pourras le changer dans le salon.</p>
        </div>
        <div className="sl-choix">
          <div className="sl-carte">
            <h2 className="dl-h">Créer un salon</h2>
            <p className="dl-note">Tu choisis les œuvres et les épreuves, tu invites tes potes avec un code, et tu lances.</p>
            <button type="button" className="dl-lancer" onClick={s.creer} disabled={s.statut === "connexion"}>
              Créer un salon →
            </button>
          </div>
          <div className="sl-carte">
            <h2 className="dl-h">Rejoindre</h2>
            <p className="dl-note">Entre le code que l&apos;on t&apos;a donné.</p>
            <label className="sl-champ sl-champ--code">
              <span className="visually-hidden">Code du salon</span>
              <input id="sl-code" value={s.codeSaisi} maxLength={LONGUEUR_CODE} autoComplete="off" autoCapitalize="characters" placeholder="CODE" onChange={(x) => s.setCodeSaisi(x.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} onKeyDown={(x) => x.key === "Enter" && s.rejoindre()} />
            </label>
            <button type="button" className="dl-lancer" onClick={s.rejoindre} disabled={s.statut === "connexion" || s.codeSaisi.length !== LONGUEUR_CODE}>
              Rejoindre →
            </button>
          </div>
        </div>
        {s.statut === "connexion" && <p className="dl-note dl-note--centre" role="status">Connexion en cours…</p>}
        {s.erreur && <p className="tl-message" role="alert">{s.erreur}</p>}
        <p className="dl-note dl-note--centre">
          <Link href="/mini-jeux/arene">Jouer seul</Link>
        </p>
      </div>
    );
  }

  const validerPseudo = () => {
    const v = (edition ?? "").trim();
    setEdition(null);
    if (v) s.changerMonNom(v);
  };
  const listeJoueurs = (
    <ul className="sl-joueurs" aria-label="Joueurs">
      {e.joueurs.map((j) => {
        const fini = e.phase === "manche" && !!e.rendus[j.id];
        return (
          <li key={j.id} className={`${fini ? "a-vote" : ""}${j.id === s.moi ? " est-moi" : ""}`}>
            <Avatar nom={j.nom} />
            {e.phase === "manche" && <span aria-hidden="true">{fini ? "✓" : "…"}</span>}
            {j.id === s.moi && edition !== null ? (
              <input className="sl-renommer" value={edition} maxLength={16} autoFocus aria-label="Ton pseudo" onChange={(x) => setEdition(x.target.value)} onBlur={validerPseudo} onKeyDown={(x) => { if (x.key === "Enter") validerPseudo(); if (x.key === "Escape") setEdition(null); }} />
            ) : j.id === s.moi ? (
              <button type="button" className="sl-moi" onClick={() => setEdition(j.nom)} title="Changer mon pseudo">
                {j.nom} <span aria-hidden="true">✎</span>
              </button>
            ) : (
              j.nom
            )}
            {j.id === HOTE && <em>hôte</em>}
          </li>
        );
      })}
    </ul>
  );
  const bandeau = (
    <div className="sl-bandeau">
      <span className="sl-code">
        Salon <strong>{s.code}</strong>
      </span>
      <button
        type="button"
        className="ctrl-btn ctrl-btn--text"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(s.lien);
            setCopie(true);
            setTimeout(() => setCopie(false), 1800);
          } catch {}
        }}
      >
        {copie ? "Lien copié !" : "Copier le lien d'invitation"}
      </button>
      <button type="button" className="ctrl-btn ctrl-btn--text ctrl-btn--danger" onClick={s.partir}>
        Quitter
      </button>
    </div>
  );
  /** Classement général : du plus de points au moins. */
  const classement = Object.entries(e.totaux)
    .map(([id, t]) => ({ id, ...t, parti: !e.joueurs.some((j) => j.id === id) }))
    .sort((a, b) => b.pts - a.pts || a.nom.localeCompare(b.nom, "fr"));

  /* ---------- Salon d'attente ---------- */
  if (e.phase === "salon") {
    return (
      <div className="dilemme salon">
        {bandeau}
        <div className="dl-bloc">
          <h2 className="dl-h">
            Joueurs <span className="sl-nb">{e.joueurs.length}</span>
          </h2>
          {listeJoueurs}
          <p className="dl-note">{s.estHote ? "Partage le code ou le lien, puis lance quand tout le monde est là." : "En attente de l'hôte, qui choisit les épreuves et lance la partie."}</p>
        </div>
        {s.estHote && (
          <>
            <PanneauReglages r={r} id="pcs" extra={<p className="dl-note">Plus on répond vite, plus on gagne de points : jusqu&apos;à un quart en plus.</p>} />
            <button type="button" className="dl-lancer" onClick={lancer} disabled={!r.actives.length}>
              Lancer la partie →
            </button>
          </>
        )}
      </div>
    );
  }

  /* ---------- Fin : le podium ---------- */
  if (e.phase === "fin") {
    return (
      <div className="dilemme salon pc-fin" ref={zone}>
        {bandeau}
        <p className="dl-tour">Classement final</p>
        <ol className="pc-podium">
          {classement.map((c, i) => (
            <li key={c.id} className={`${c.id === s.moi ? "est-moi" : ""}${i === 0 ? " est-premier" : ""}`}>
              <span className="pc-podium__rang">{i + 1}</span>
              <span className="pc-podium__nom">
                {c.nom}
                {c.parti && <em> (parti)</em>}
              </span>
              <span className="pc-podium__pastilles" aria-hidden="true">
                {c.pastilles}
              </span>
              <span className="pc-podium__pts">{c.pts.toLocaleString("fr-FR")}</span>
            </li>
          ))}
        </ol>
        <p className="dl-note dl-note--centre">
          {e.manches.length} manches en {NIVEAUX.find((n) => n.id === e.niveau)?.nom.toLowerCase() ?? "normal"} · {e.manches.map((x) => infoEpreuve(x.e).nom).join(", ")}
        </p>
        {s.estHote ? (
          <div className="dl-actions">
            <button type="button" className="ctrl-btn ctrl-btn--text" onClick={lancer}>
              Rejouer
            </button>
            <button type="button" className="ctrl-btn ctrl-btn--text" onClick={retourSalon}>
              Changer les réglages
            </button>
          </div>
        ) : (
          <p className="dl-note dl-note--centre">L&apos;hôte peut relancer une partie.</p>
        )}
      </div>
    );
  }

  /* ---------- Manche en cours, puis son classement ---------- */
  const bilan = e.phase === "bilan";
  const parManche = Object.entries(e.rendus)
    .map(([id, x]) => ({ id, ...x, nom: e.totaux[id]?.nom ?? e.joueurs.find((j) => j.id === id)?.nom ?? "?", total: e.totaux[id]?.pts ?? 0 }))
    .sort((a, b) => b.pts - a.pts || b.total - a.total);
  const nbFinis = e.joueurs.filter((j) => e.rendus[j.id]).length;

  return (
    <div className="dilemme salon pc-salon" ref={zone}>
      {bandeau}
      {m && (
        <>
          <EnteteManche
            m={m}
            i={e.indice}
            n={e.manches.length}
            droite={!bilan && <Temps restant={restant} />}
          />
          {bilan && (
            <div className="pc-bilan-manche" role="status">
              <h2 className="dl-h">Classement de la manche</h2>
              <ol>
                {parManche.map((x, i) => (
                  <li key={x.id} className={x.id === s.moi ? "est-moi" : ""}>
                    <span className="pc-bilan-manche__rang">{i + 1}</span>
                    <span className="pc-bilan-manche__nom">{x.nom}</span>
                    <span className="pc-bilan-manche__resume">{x.resume}</span>
                    <span className="pc-bilan-manche__pts">+{x.pts}</span>
                    <span className="pc-bilan-manche__total">{x.total.toLocaleString("fr-FR")}</span>
                  </li>
                ))}
              </ol>
              {s.estHote ? (
                <button type="button" className="dl-lancer" onClick={suivante}>
                  {e.indice + 1 >= e.manches.length ? "Classement final →" : "Manche suivante →"}
                </button>
              ) : (
                <p className="dl-note dl-note--centre">La suite arrive dans quelques secondes.</p>
              )}
            </div>
          )}
          {manquante ? (
            <p className="tl-message">Cette manche utilise des œuvres que ta page ne connaît pas : recharge la page pour avoir la dernière version du site.</p>
          ) : (
            <Epreuve key={e.jeton} m={m} d={d} g={g} parCle={parCle} univers={univers} finir={finir} partiel={partiel} tempsEcoule={tempsEcoule} niveau={e.niveau ?? "normal"} progres={progres} />
          )}
          {!bilan && rendu && (
            <p className="sl-etat" role="status">
              {pastille(rendu.score)} {rendu.resume}. En attente des autres : {nbFinis} / {e.joueurs.length}.
            </p>
          )}
          {!bilan && !rendu && <p className="sl-etat">{nbFinis} / {e.joueurs.length} ont fini.</p>}
          {listeJoueurs}
          {s.estHote && !bilan && (
            <div className="dl-actions">
              <button type="button" className="ctrl-btn ctrl-btn--text" onClick={clore}>
                Clore la manche sans attendre
              </button>
              <button type="button" className="ctrl-btn ctrl-btn--text ctrl-btn--danger" onClick={retourSalon}>
                Arrêter la partie
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
