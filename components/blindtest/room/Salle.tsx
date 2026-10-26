"use client";

import { useState } from "react";
import { HOTE, type Joueur } from "@/components/blindtest/salon/useSalon";
import { CHOIX_DUREE, CHOIX_MANCHES, MAX_JOUEURS, NB_CHOIX, complet, type Cible, type EtatJeu, type Frappe, type Reglages } from "@/components/blindtest/lib/partie";

/* La salle : bandeau avec le code, liste des joueurs, réglages de l'hôte. */

export function Bandeau({ code, lien, estHote, statut, enPartie, onQuitter }: { code: string; lien: string; estHote: boolean; statut: string; enPartie: boolean; onQuitter: () => void }) {
  const [copie, setCopie] = useState("");
  const copier = async () => {
    try {
      await navigator.clipboard.writeText(lien);
      setCopie("Lien copié !");
    } catch {
      setCopie(lien);
    }
    setTimeout(() => setCopie(""), 2500);
  };
  const partager = async () => {
    try {
      await navigator.share({ title: "Blindtest Henassa", text: `Viens jouer au blindtest ! Code : ${code}`, url: lien });
    } catch {}
  };
  const peutPartager = typeof navigator !== "undefined" && typeof navigator.share === "function";
  return (
    <div className="bandeau">
      <p className="bandeau__code">
        Room <strong aria-label={`Code ${code.split("").join(" ")}`}>{code}</strong>
      </p>
      <div className={`bandeau__actions${enPartie ? " bandeau__actions--partie" : ""}`}>
        {peutPartager ? (
          <button type="button" className="bouton" onClick={partager}>
            Inviter
          </button>
        ) : null}
        <button type="button" className="bouton bouton--contour" onClick={copier}>
          Copier le lien
        </button>
        <button
          type="button"
          className="lien-bouton lien-bouton--danger"
          onClick={() => {
            if (!estHote || window.confirm("Fermer la room ? La partie s'arrête pour tout le monde.")) onQuitter();
          }}
        >
          {estHote ? "Fermer la room" : "Quitter"}
        </button>
      </div>
      <p className="message" role="status" aria-live="polite">
        {copie}
        {statut === "reconnexion" && <span className="message--alerte">Connexion perdue… on te reconnecte.</span>}
      </p>
    </div>
  );
}

export function Joueurs({ etat, moi, estHote, onExclure, avecScore = false }: { etat: EtatJeu; moi: string; estHote: boolean; onExclure?: (id: string) => void; avecScore?: boolean }) {
  const m = etat.manche;
  const ecoute = etat.phase === "ecoute";
  const qcm = etat.reglages.mode === "qcm";
  return (
    <ul className="joueurs" aria-label="Joueurs">
      {etat.joueurs.map((j: Joueur) => {
        const t = m?.trouves[j.id];
        const pret = etat.prets.includes(j.id);
        const fini = ecoute && complet(t, etat.reglages.cible);
        return (
          <li key={j.id} className={`joueur${j.id === moi ? " est-moi" : ""}${j.present ? "" : " est-absent"}${fini ? " a-fini" : ""}`}>
            <span className="joueur__avatar" aria-hidden="true" style={{ ["--teinte" as string]: teinte(j.nom) }}>
              {initiale(j.nom)}
            </span>
            <span className="joueur__nom">{j.nom}</span>
            {j.id === HOTE && <em>hôte</em>}
            {j.id === moi && <em>toi</em>}
            {!j.present && <em>reconnexion…</em>}
            {etat.phase === "lobby" && j.present && <span className={`joueur__son${pret ? " is-on" : ""}`}>{pret ? "prêt" : "son ?"}</span>}
            {ecoute && qcm && m?.ontChoisi?.includes(j.id) && <span className="joueur__trouve">a répondu</span>}
            {ecoute && !qcm && (t?.titre !== undefined || t?.artiste !== undefined) && (
              <span className="joueur__trouve">{fini ? "✓ tout" : t?.titre !== undefined ? "✓ titre" : "✓ artiste"}</span>
            )}
            {ecoute && !qcm && etat.reglages.voir && j.id !== moi && m?.frappes?.[j.id] && !fini && <Bulle f={m.frappes[j.id]!} />}
            {avecScore && <span className="joueur__pts">{etat.scores[j.id] ?? 0}</span>}
            {estHote && j.id !== HOTE && onExclure && (
              <button
                type="button"
                className="joueur__exclure"
                aria-label={`Exclure ${j.nom}`}
                onClick={() => window.confirm(`Exclure ${j.nom} de la room ?`) && onExclure(j.id)}
              >
                ×
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** La bulle de ce qu'un joueur est en train de taper. */
function Bulle({ f }: { f: Frappe }) {
  if (f.chaud) return <span className="joueur__bulle is-chaud">🔥 brûlant…</span>;
  if (!f.t) return null;
  return <span className={`joueur__bulle${f.r ? " is-rate" : ""}`}>{f.r ? `✕ ${f.t}` : f.t}</span>;
}

/** Initiale et couleur d'un pseudo (toujours les mêmes pour un même pseudo). */
const initiale = (nom: string) => [...nom.trim()][0]?.toUpperCase() ?? "?";
function teinte(nom: string) {
  let h = 0;
  for (const c of nom) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

export function compteJoueurs(etat: EtatJeu) {
  return `${etat.joueurs.length}/${MAX_JOUEURS}`;
}

const CIBLES: { v: Cible; nom: string }[] = [
  { v: "les-deux", nom: "Titre + artiste" },
  { v: "titre", nom: "Titre" },
  { v: "artiste", nom: "Artiste" },
];

export const nomCible = (c: Cible) => CIBLES.find((x) => x.v === c)!.nom.toLowerCase();

export function ReglagesHote({ r, nbPanier, qcmPossible, onChange }: { r: Reglages; nbPanier: number; qcmPossible: boolean; onChange: (r: Partial<Reglages>) => void }) {
  return (
    <section className="bloc" aria-labelledby="reglages-h">
      <h2 className="bloc__h" id="reglages-h">
        Réglages
      </h2>
      <div className="reglage">
        <span className="reglage__nom" id="r-manches">
          Manches
        </span>
        <div className="puces" role="group" aria-labelledby="r-manches">
          {CHOIX_MANCHES.map((n) => (
            <button key={n} type="button" className={`puce${r.manches === n ? " is-on" : ""}`} aria-pressed={r.manches === n} onClick={() => onChange({ manches: n })}>
              {n}
            </button>
          ))}
        </div>
        {nbPanier > 0 && nbPanier < r.manches && <p className="note">Le panier n'a que {nbPanier} morceaux : la partie en fera {nbPanier}.</p>}
      </div>
      <div className="reglage">
        <span className="reglage__nom" id="r-duree">
          Temps par manche
        </span>
        <div className="puces" role="group" aria-labelledby="r-duree">
          {CHOIX_DUREE.map((n) => (
            <button key={n} type="button" className={`puce${r.duree === n ? " is-on" : ""}`} aria-pressed={r.duree === n} onClick={() => onChange({ duree: n })}>
              {n} s
            </button>
          ))}
        </div>
      </div>
      <div className="reglage">
        <span className="reglage__nom" id="r-cible">
          À trouver
        </span>
        <div className="puces" role="group" aria-labelledby="r-cible">
          {CIBLES.map((c) => (
            <button key={c.v} type="button" className={`puce${r.cible === c.v ? " is-on" : ""}`} aria-pressed={r.cible === c.v} onClick={() => onChange({ cible: c.v })}>
              {c.nom}
            </button>
          ))}
        </div>
      </div>
      <div className="reglage">
        <span className="reglage__nom" id="r-mode">
          Réponses
        </span>
        <div className="puces" role="group" aria-labelledby="r-mode">
          <button type="button" className={`puce${r.mode === "tape" ? " is-on" : ""}`} aria-pressed={r.mode === "tape"} onClick={() => onChange({ mode: "tape" })}>
            Tapées
          </button>
          <button type="button" className={`puce${r.mode === "qcm" ? " is-on" : ""}`} aria-pressed={r.mode === "qcm"} onClick={() => onChange({ mode: "qcm" })}>
            QCM
          </button>
        </div>
        <p className="note">
          {r.mode === "qcm"
            ? `${NB_CHOIX} propositions par manche, une seule réponse. Les autres propositions viennent du panier.`
            : "Chacun tape sa réponse, autant d'essais qu'il veut."}
        </p>
        {r.mode === "qcm" && !qcmPossible && nbPanier > 0 && <p className="note note--alerte">Il faut au moins {NB_CHOIX} morceaux différents dans le panier pour un QCM.</p>}
      </div>
      {r.mode === "tape" && (
        <div className="reglage">
          <span className="reglage__nom" id="r-voir">
            Voir ce que les autres tapent
          </span>
          <div className="puces" role="group" aria-labelledby="r-voir">
            <button type="button" className={`puce${r.voir ? " is-on" : ""}`} aria-pressed={r.voir} onClick={() => onChange({ voir: true })}>
              Oui
            </button>
            <button type="button" className={`puce${!r.voir ? " is-on" : ""}`} aria-pressed={!r.voir} onClick={() => onChange({ voir: false })}>
              Non
            </button>
          </div>
          <p className="note">{r.voir ? "Les essais de chacun s'affichent en direct. Dès que quelqu'un approche de la réponse, c'est caché." : "Personne ne voit ce que tapent les autres."}</p>
        </div>
      )}
    </section>
  );
}

export function ResumeReglages({ etat }: { etat: EtatJeu }) {
  const r = etat.reglages;
  const manches = etat.nbPanier ? Math.min(r.manches, etat.nbPanier) : r.manches;
  return (
    <section className="bloc bloc--attente">
      <h2 className="bloc__h">En attente de l'hôte</h2>
      <p className="attente__texte">
        {etat.nbPanier ? (
          <>
            <strong>{etat.nbPanier}</strong> morceau{etat.nbPanier > 1 ? "x" : ""} dans le panier.
          </>
        ) : (
          "L'hôte remplit le panier…"
        )}
      </p>
      <p className="attente__texte">
        {manches} manches de {r.duree} s · à trouver : {nomCible(r.cible)} · {r.mode === "qcm" ? "QCM" : r.voir ? "réponses tapées, visibles en direct" : "réponses tapées"}.
      </p>
    </section>
  );
}
