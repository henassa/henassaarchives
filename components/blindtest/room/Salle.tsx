"use client";

import { useState } from "react";
import { HOTE, type Joueur } from "@/components/blindtest/salon/useSalon";
import { CHOIX_DUREE, CHOIX_MANCHES, MAX_JOUEURS, complet, type Cible, type EtatJeu, type Reglages } from "@/components/blindtest/lib/partie";

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
          className="lien-bouton"
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
  return (
    <ul className="joueurs" aria-label="Joueurs">
      {etat.joueurs.map((j: Joueur) => {
        const t = m?.trouves[j.id];
        const pret = etat.prets.includes(j.id);
        const fini = ecoute && complet(t, etat.reglages.cible);
        return (
          <li key={j.id} className={`joueur${j.id === moi ? " est-moi" : ""}${j.present ? "" : " est-absent"}${fini ? " a-fini" : ""}`}>
            <span className="joueur__nom">{j.nom}</span>
            {j.id === HOTE && <em>hôte</em>}
            {j.id === moi && <em>toi</em>}
            {!j.present && <em>reconnexion…</em>}
            {etat.phase === "lobby" && j.present && <span className={`joueur__son${pret ? " is-on" : ""}`}>{pret ? "prêt" : "son ?"}</span>}
            {ecoute && (t?.titre !== undefined || t?.artiste !== undefined) && (
              <span className="joueur__trouve">{fini ? "✓ tout" : t?.titre !== undefined ? "✓ titre" : "✓ artiste"}</span>
            )}
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

export function compteJoueurs(etat: EtatJeu) {
  return `${etat.joueurs.length}/${MAX_JOUEURS}`;
}

const CIBLES: { v: Cible; nom: string }[] = [
  { v: "les-deux", nom: "Titre + artiste" },
  { v: "titre", nom: "Titre" },
  { v: "artiste", nom: "Artiste" },
];

export const nomCible = (c: Cible) => CIBLES.find((x) => x.v === c)!.nom.toLowerCase();

export function ReglagesHote({ r, nbPanier, onChange }: { r: Reglages; nbPanier: number; onChange: (r: Partial<Reglages>) => void }) {
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
          <button type="button" className="puce is-on" aria-pressed="true">
            Tapées
          </button>
          <button type="button" className="puce" disabled title="Bientôt">
            QCM · bientôt
          </button>
        </div>
      </div>
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
        {manches} manches de {r.duree} s · à trouver : {nomCible(r.cible)}.
      </p>
    </section>
  );
}
