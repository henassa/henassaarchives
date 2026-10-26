"use client";

import { useEffect, useRef, useState } from "react";
import { EchoTitre, Pochette } from "@/components/blindtest/commun";
import { Joueurs } from "@/components/blindtest/room/Salle";
import { REPONSE_MAX } from "@/components/blindtest/lib/texte";
import { classement, complet, demandeArtiste, demandeTitre, type EtatJeu, type Verdict } from "@/components/blindtest/lib/partie";

/* Une manche, vue par chaque joueur : chargement, décompte, écoute, révélation. */

/** L'heure de l'hôte, rafraîchie plusieurs fois par seconde. */
export function useHorloge(maintenantHote: () => number, actif: boolean) {
  const [t, setT] = useState(() => maintenantHote());
  useEffect(() => {
    if (!actif) return;
    const id = setInterval(() => setT(maintenantHote()), 100);
    return () => clearInterval(id);
  }, [actif, maintenantHote]);
  return t;
}

type Props = {
  etat: EtatJeu;
  moi: string;
  estHote: boolean;
  maintenantHote: () => number;
  verdict: (Verdict & { essai: string; le: number }) | null;
  sonBloque: boolean;
  onRelancerSon: () => void;
  onRepondre: (texte: string) => void;
  onSuivante: () => void;
  onArreter: () => void;
  onExclure: (id: string) => void;
  onQuitter: () => void;
};

export function Manche({ etat, moi, estHote, maintenantHote, verdict, sonBloque, onRelancerSon, onRepondre, onSuivante, onArreter, onExclure, onQuitter }: Props) {
  const m = etat.manche!;
  const maintenant = useHorloge(maintenantHote, true);
  const [texte, setTexte] = useState("");
  const champ = useRef<HTMLInputElement>(null);
  const cible = etat.reglages.cible;
  const dureeMs = etat.reglages.duree * 1000;

  const decompte = etat.phase === "ecoute" && maintenant < m.depart;
  const enJeu = etat.phase === "ecoute" && maintenant >= m.depart;
  const reste = enJeu ? Math.max(0, m.fin - maintenant) : etat.phase === "ecoute" ? dureeMs : 0;
  const chiffre = decompte ? Math.min(3, Math.ceil((m.depart - maintenant) / 1000)) : 0;
  const mesTrouves = m.trouves[moi];
  const jaiTout = complet(mesTrouves, cible);
  const presents = etat.joueurs.filter((j) => j.present);

  // Le son part : on place le curseur dans le champ (sur ordinateur, sans ouvrir de clavier imposé sur téléphone)
  useEffect(() => {
    if (enJeu && window.matchMedia("(pointer: fine)").matches) champ.current?.focus();
    if (etat.phase === "preparation") setTexte("");
  }, [enJeu, etat.phase]);

  const envoyer = (e: React.FormEvent) => {
    e.preventDefault();
    const t = texte.trim();
    if (!t || !enJeu || jaiTout) return;
    onRepondre(t);
    setTexte("");
  };

  const placeholder = cible === "titre" ? "Le titre…" : cible === "artiste" ? "L'artiste…" : "Titre, artiste… ou les deux";
  const dernier = verdict && verdict.n === m.n && maintenant - verdict.le < 4000 ? verdict : null;

  return (
    <section className="manche" aria-labelledby="manche-h">
      <div className="manche__tete">
        <h2 className="manche__num" id="manche-h">
          Manche {m.n}
          <span>/{m.total}</span>
        </h2>
        <p className={`manche__temps${enJeu && reste < 5000 ? " is-court" : ""}`} aria-live="off">
          {enJeu ? `${Math.ceil(reste / 1000)} s` : " "}
        </p>
      </div>
      <div className="barre" aria-hidden="true">
        <i style={{ transform: `scaleX(${enJeu ? reste / dureeMs : etat.phase === "revelation" ? 0 : 1})` }} />
      </div>

      {etat.avis && etat.phase === "preparation" && <p className="avis">{etat.avis}</p>}

      <div className={`scene${etat.phase === "revelation" ? " scene--revelation" : ""}`}>
        {etat.phase === "preparation" && (
          <div className="scene__centre">
            <p className="scene__info">Chargement de l'extrait…</p>
            <p className="note">
              {m.charges.filter((id) => presents.some((j) => j.id === id)).length}/{presents.length} prêts
            </p>
          </div>
        )}
        {decompte && (
          <div className="scene__centre" aria-live="assertive">
            <div className="decompte" key={chiffre}>
              <span className="decompte__echo" aria-hidden="true">
                {chiffre}
              </span>
              <span className="decompte__chiffre">{chiffre}</span>
            </div>
          </div>
        )}
        {enJeu && (
          <div className="scene__centre">
            <div className="egaliseur" aria-hidden="true">
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <i key={i} style={{ animationDelay: `${(i * 137) % 600}ms` }} />
              ))}
            </div>
            <p className="scene__info">{jaiTout ? "Bien joué ! Attends les autres…" : "Écoute…"}</p>
            {sonBloque && (
              <button type="button" className="bouton bouton--fort" onClick={onRelancerSon}>
                Toucher pour lancer le son
              </button>
            )}
          </div>
        )}
        {etat.phase === "revelation" && m.revele && (
          <div className="revelation">
            <Pochette src={m.revele.pochette} alt={`Pochette de ${m.revele.album}`} classe="revelation__pochette" />
            <div className="revelation__texte">
              <p className="revelation__titre">{m.revele.titre}</p>
              <p className="revelation__artiste">{m.revele.artiste}</p>
              <p className="note">{m.revele.album}</p>
              <a className="lien-discret" href={m.revele.lien} target="_blank" rel="noopener noreferrer">
                Écouter sur Deezer
              </a>
            </div>
          </div>
        )}
      </div>

      {(etat.phase === "ecoute" || etat.phase === "preparation") && (
        <form className="reponse" onSubmit={envoyer}>
          <label className="visually-hidden" htmlFor="reponse">
            Ta réponse
          </label>
          <input
            ref={champ}
            id="reponse"
            className="champ champ--grand"
            type="text"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="send"
            maxLength={REPONSE_MAX}
            placeholder={placeholder}
            value={texte}
            disabled={!enJeu || jaiTout}
            onChange={(e) => setTexte(e.target.value)}
          />
          <button type="submit" className="bouton bouton--fort" disabled={!enJeu || jaiTout || !texte.trim()}>
            OK
          </button>
        </form>
      )}

      {(etat.phase === "ecoute" || etat.phase === "preparation") && (
        <div className="mes-trouves" aria-live="polite">
          {demandeTitre(cible) && <span className={`etat-trouve${mesTrouves?.titre !== undefined ? " is-on" : ""}`}>Titre {mesTrouves?.titre !== undefined ? "✓" : "…"}</span>}
          {demandeArtiste(cible) && <span className={`etat-trouve${mesTrouves?.artiste !== undefined ? " is-on" : ""}`}>Artiste {mesTrouves?.artiste !== undefined ? "✓" : "…"}</span>}
          {dernier && (
            <span key={dernier.le} className={`verdict${dernier.titre || dernier.artiste ? " is-bon" : " is-rate"}`}>
              {dernier.titre && dernier.artiste ? "Titre et artiste !" : dernier.titre ? "Titre trouvé !" : dernier.artiste ? "Artiste trouvé !" : `Raté : « ${dernier.essai} »`}
            </span>
          )}
        </div>
      )}

      {etat.phase === "revelation" && (
        <div className="classement-manche">
          <h3 className="sous-h">Classement</h3>
          <ol>
            {classement(etat).map((j) => {
              const g = m.gains?.[j.id] ?? 0;
              return (
                <li key={j.id} className={`${j.id === moi ? "est-moi" : ""}${j.rang === 1 ? " est-premier" : ""}`}>
                  <span className="classement__rang">{j.rang}</span>
                  <span className="classement__nom">{j.nom}</span>
                  <span className={`classement__gain${g ? " is-on" : ""}`}>{g ? `+${g}` : "·"}</span>
                  <span className="classement__pts">{j.points}</span>
                </li>
              );
            })}
          </ol>
          <div className="suite">
            <p className="note">
              {m.n >= m.total ? "Résultats" : "Manche suivante"} dans {Math.max(0, Math.ceil(((m.suite ?? maintenant) - maintenant) / 1000))} s
            </p>
            {estHote && (
              <button type="button" className="bouton" onClick={onSuivante}>
                {m.n >= m.total ? "Voir le podium" : "Suivante"}
              </button>
            )}
          </div>
        </div>
      )}

      {etat.phase !== "revelation" && <Joueurs etat={etat} moi={moi} estHote={estHote} onExclure={onExclure} avecScore />}

      {estHote ? (
        <button type="button" className="lien-bouton manche__arreter" onClick={() => window.confirm("Arrêter la partie et revenir à la salle ?") && onArreter()}>
          Arrêter la partie
        </button>
      ) : (
        <button type="button" className="lien-bouton manche__arreter manche__quitter" onClick={() => window.confirm("Quitter la room ?") && onQuitter()}>
          Quitter la room
        </button>
      )}
    </section>
  );
}

export function Fin({ etat, moi, estHote, onRejouer, onSalle, panierVide }: { etat: EtatJeu; moi: string; estHote: boolean; onRejouer: () => void; onSalle: () => void; panierVide: boolean }) {
  const c = classement(etat);
  // ordre d'affichage : 2e, 1er, 3e (le premier au centre, sur la plus haute marche)
  const podium = [c[1], c[0], c[2]].filter(Boolean);
  return (
    <section className="fin">
      <EchoTitre texte="Podium" echo="Podium" centre classe="fin__titre" />
      {etat.avis && <p className="avis">{etat.avis}</p>}
      <ol className="podium" aria-label="Podium">
        {podium.map((j) => (
          <li key={j.id} className={`podium__marche podium__marche--${c.indexOf(j) + 1}${j.id === moi ? " est-moi" : ""}`}>
            <span className="podium__nom">{j.nom}</span>
            <span className="podium__pts">{j.points} pts</span>
            <span className="podium__bloc">
              <span>{j.rang}</span>
            </span>
          </li>
        ))}
      </ol>
      {c.length > 3 && (
        <ol className="classement-final" start={4}>
          {c.slice(3).map((j) => (
            <li key={j.id} className={j.id === moi ? "est-moi" : ""}>
              <span className="classement__rang">{j.rang}</span>
              <span className="classement__nom">{j.nom}</span>
              <span className="classement__pts">{j.points}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="fin__actions">
        {estHote ? (
          <>
            <button type="button" className="bouton bouton--fort" disabled={panierVide} onClick={onRejouer}>
              Rejouer
            </button>
            <button type="button" className="bouton bouton--contour" onClick={onSalle}>
              Changer le panier
            </button>
          </>
        ) : (
          <p className="note">L'hôte peut relancer une partie.</p>
        )}
      </div>

      {etat.historique.length > 0 && (
        <div className="recap">
          <h3 className="sous-h">Les morceaux</h3>
          <ol className="recap__liste">
            {etat.historique.map((t) => (
              <li key={t.n}>
                <a href={t.lien} target="_blank" rel="noopener noreferrer" className="recap__item">
                  <Pochette src={t.pochette} alt="" classe="recap__pochette" />
                  <span className="recap__n">{t.n}</span>
                  <span className="recap__titre">{t.titre}</span>
                  <span className="recap__artiste">{t.artiste}</span>
                </a>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
