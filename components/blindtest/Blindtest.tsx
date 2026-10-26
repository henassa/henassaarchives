"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSalon, LONGUEUR_CODE } from "@/components/blindtest/salon/useSalon";
import { useArbitre } from "@/components/blindtest/partie/useArbitre";
import { Manche, Fin } from "@/components/blindtest/partie/Manche";
import { Bandeau, Joueurs, ReglagesHote, ResumeReglages, compteJoueurs } from "@/components/blindtest/room/Salle";
import { Panier } from "@/components/blindtest/panier/Panier";
import { Pied } from "@/components/blindtest/commun";
import { arreter, debloquerSon, lancerA, preparer, telecharger } from "@/components/blindtest/lib/audio";
import { garderPanierCourant, lirePanierCourant, type ElementPanier } from "@/components/blindtest/lib/panier";
import { MAX_JOUEURS, etatVide, type EtatJeu, type MsgJeu, type Verdict } from "@/components/blindtest/lib/partie";
import { PSEUDO_MAX } from "@/components/blindtest/lib/texte";

/*
 * Le blindtest de HENASSA : l'accueil (créer ou rejoindre), puis la room.
 * Tout est rangé dans un bloc « msq » : ses styles (blindtest.css) ne débordent pas sur le reste du site.
 */

export default function Blindtest() {
  const [panier, setPanierBrut] = useState<ElementPanier[]>([]);
  const [verdict, setVerdict] = useState<(Verdict & { essai: string; le: number }) | null>(null);
  const [sonBloque, setSonBloque] = useState(false);
  const [pret, setPret] = useState(false);
  const dernierEssai = useRef("");

  // Les messages de jeu arrivent avant que l'arbitre existe : on passe par une référence
  const arbitreRef = useRef<ReturnType<typeof useArbitre> | null>(null);
  const salon = useSalon<EtatJeu>({
    prefixe: "blindtest-room-",
    vide: etatVide,
    max: MAX_JOUEURS,
    surJeu: (id, m) => arbitreRef.current?.recevoir(id, m),
    surJoueurs: () => arbitreRef.current?.surJoueurs(),
    surJeuInvite: (m) => {
      const v = m as Verdict;
      if (v?.t === "verdict") setVerdict({ ...v, essai: dernierEssai.current, le: Date.now() });
    },
  });
  const arbitre = useArbitre(salon, panier);
  arbitreRef.current = arbitre;

  const { etat, moi, role, maintenantHote } = salon;
  const m = etat.manche;

  // Le panier en cours est gardé dans le navigateur de l'hôte
  useEffect(() => setPanierBrut(lirePanierCourant()), []);
  const setPanier = useCallback((p: ElementPanier[]) => {
    setPanierBrut(p);
    garderPanierCourant(p);
  }, []);

  const envoyerJeu = salon.envoyer as (m: MsgJeu) => void;

  /* ---------- Le son ---------- */

  const chargement = useRef<{ cle: string; promesse: Promise<boolean> } | null>(null);

  // Nouvel extrait : chacun le charge, puis prévient l'hôte
  useEffect(() => {
    if (!role || etat.phase !== "preparation" || !m?.extrait) return;
    const cle = `${m.n}|${m.extrait}`;
    if (chargement.current?.cle === cle) return;
    const promesse = preparer(m.extrait);
    chargement.current = { cle, promesse };
    const n = m.n;
    void promesse.then((ok) => {
      if (chargement.current?.cle === cle) envoyerJeu({ t: "charge", n, ok });
    });
  }, [role, etat.phase, m?.n, m?.extrait, envoyerJeu]);

  // Heure de départ fixée : on lance le son pile à ce moment-là (converti en heure locale)
  const departProgramme = useRef("");
  useEffect(() => {
    if (etat.phase !== "ecoute" || !m?.depart || !m.extrait) return;
    const cle = `${m.n}|${m.depart}`;
    if (departProgramme.current === cle) return;
    departProgramme.current = cle;
    const departLocal = m.depart - (maintenantHote() - Date.now());
    const cleChargement = `${m.n}|${m.extrait}`;
    const charge = chargement.current?.cle === cleChargement ? chargement.current.promesse : preparer(m.extrait);
    if (chargement.current?.cle !== cleChargement) chargement.current = { cle: cleChargement, promesse: charge };
    void charge.then(() => lancerA(departLocal)).then((ok) => setSonBloque(!ok));
  }, [etat.phase, m?.n, m?.depart, m?.extrait, maintenantHote]);

  // Pendant la révélation, on télécharge déjà l'extrait suivant
  useEffect(() => {
    if (etat.prochain) void telecharger(etat.prochain);
  }, [etat.prochain]);

  // Retour à la salle, fin de partie ou départ : on coupe le son
  useEffect(() => {
    if (!role || etat.phase === "lobby" || etat.phase === "fin") {
      arreter();
      setSonBloque(false);
    }
  }, [role, etat.phase]);

  const relancerSon = async () => {
    await debloquerSon();
    if (m?.extrait) await preparer(m.extrait);
    const ok = await lancerA(m ? m.depart - (maintenantHote() - Date.now()) : Date.now());
    setSonBloque(!ok);
  };

  const jeSuisPret = async () => {
    await debloquerSon();
    setPret(true);
    envoyerJeu({ t: "pret" });
  };

  // Après une reconnexion, l'hôte doit savoir que notre son est débloqué
  useEffect(() => {
    if (salon.statut === "ok" && pret && !etat.prets.includes(moi)) envoyerJeu({ t: "pret" });
  }, [salon.statut, pret, etat.prets, moi, envoyerJeu]);

  // L'hôte qui ferme sa page en pleine partie arrête la room pour tous : on lui demande confirmation
  useEffect(() => {
    if (!salon.estHote || (etat.phase === "lobby" && etat.joueurs.length < 2)) return;
    const avant = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", avant);
    return () => window.removeEventListener("beforeunload", avant);
  }, [salon.estHote, etat.phase, etat.joueurs.length]);

  const repondre = (texte: string) => {
    dernierEssai.current = texte;
    if (m) envoyerJeu({ t: "reponse", n: m.n, texte });
  };

  const lancer = async () => {
    await debloquerSon();
    if (!pret) {
      setPret(true);
      envoyerJeu({ t: "pret" });
    }
    arbitre.lancer();
  };

  const quitter = () => {
    arreter();
    setPret(false);
    salon.partir();
  };

  /* ---------- Affichage ---------- */

  if (!role) return <Accueil salon={salon} />;

  const enPartie = etat.phase !== "lobby" && etat.phase !== "fin" && m;
  const nbManches = Math.min(etat.reglages.manches, panier.length);
  const pretsAbsents = etat.joueurs.filter((j) => j.present && j.id !== moi && !etat.prets.includes(j.id)).length;

  return (
    <div className="msq msq--room">
      <div className="msq-tete site-header--room">
        <Bandeau code={salon.code} lien={salon.lien} estHote={salon.estHote} statut={salon.statut} enPartie={etat.phase !== "lobby"} onQuitter={quitter} />
      </div>

      <div className="room">
        {enPartie ? (
          <Manche
            etat={etat}
            moi={moi}
            estHote={salon.estHote}
            maintenantHote={maintenantHote}
            verdict={verdict}
            sonBloque={sonBloque}
            onRelancerSon={relancerSon}
            onRepondre={repondre}
            onSuivante={arbitre.suivante}
            onArreter={arbitre.retourSalle}
            onExclure={salon.exclure}
            onQuitter={quitter}
          />
        ) : etat.phase === "fin" ? (
          <Fin etat={etat} moi={moi} estHote={salon.estHote} onRejouer={lancer} onSalle={arbitre.retourSalle} panierVide={!panier.length} />
        ) : (
          <div className="salle">
            <div className="salle__principal">
              <section className="bloc" aria-labelledby="joueurs-h">
                <h2 className="bloc__h" id="joueurs-h">
                  Joueurs <span className="pastille-n">{compteJoueurs(etat)}</span>
                </h2>
                <Joueurs etat={etat} moi={moi} estHote={salon.estHote} onExclure={salon.exclure} />
                {etat.joueurs.length < 2 && <p className="note">Envoie le lien ou le code {salon.code} à tes potes.</p>}
              </section>

              <section className={`bloc bloc--pret${pret ? " is-on" : ""}`}>
                {pret ? (
                  <p className="pret__ok">Son activé ✓</p>
                ) : (
                  <>
                    <p className="pret__aide">Monte le son de ton téléphone, puis appuie ici (sur iPhone, sinon tu n'entendras rien).</p>
                    <button type="button" className="bouton bouton--fort bouton--large" onClick={jeSuisPret}>
                      Je suis prêt
                    </button>
                  </>
                )}
              </section>

              {etat.avis && <p className="avis">{etat.avis}</p>}

              {salon.estHote ? (
                <ReglagesHote r={etat.reglages} nbPanier={panier.length} onChange={arbitre.regler} />
              ) : (
                <ResumeReglages etat={etat} />
              )}
            </div>

            {salon.estHote && (
              <div className="salle__panier">
                <Panier panier={panier} setPanier={setPanier} />
              </div>
            )}

            {salon.estHote && (
              <div className="lancer">
                <button type="button" className="bouton bouton--fort bouton--large" disabled={!panier.length} onClick={lancer}>
                  {panier.length ? `Lancer la partie · ${nbManches} manche${nbManches > 1 ? "s" : ""}` : "Ajoute des morceaux pour lancer"}
                </button>
                {panier.length > 0 && pretsAbsents > 0 && (
                  <p className="note">
                    {pretsAbsents} joueur{pretsAbsents > 1 ? "s n'ont" : " n'a"} pas encore activé le son.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      <Pied />
    </div>
  );
}

/* ---------- Accueil ---------- */

function Accueil({ salon }: { salon: ReturnType<typeof useSalon<EtatJeu>> }) {
  const viaLien = salon.codeSaisi.length === LONGUEUR_CODE;
  const enCours = salon.statut === "connexion" || salon.statut === "reconnexion";
  const rejoindre = (
    <form
      className="carte"
      onSubmit={(e) => {
        e.preventDefault();
        void salon.rejoindre();
      }}
    >
      <h2 className="carte__h">Rejoindre une room</h2>
      <label className="champ-label" htmlFor="code">
        Code de la room
      </label>
      <input
        id="code"
        className="champ champ--code"
        inputMode="text"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={LONGUEUR_CODE}
        placeholder="ABC234"
        value={salon.codeSaisi}
        onChange={(e) => salon.setCodeSaisi(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
      />
      <button type="submit" className="bouton bouton--fort" disabled={enCours || salon.codeSaisi.length !== LONGUEUR_CODE}>
        {enCours ? "Connexion…" : "Rejoindre"}
      </button>
    </form>
  );
  const creer = (
    <div className="carte">
      <h2 className="carte__h">Créer une room</h2>
      <p className="note">Tu choisis les morceaux, tu envoies le code à tes potes (10 joueurs au maximum).</p>
      <button type="button" className={`bouton ${viaLien ? "bouton--contour" : "bouton--fort"}`} disabled={enCours} onClick={() => void salon.creer()}>
        {enCours ? "Connexion…" : "Créer une room"}
      </button>
    </div>
  );
  return (
    <div className="msq">
      <div className="accueil">
        <p className="accueil__dek">Une room, un code, trente secondes d'extrait. Le premier qui trouve le titre et l'artiste rafle les points.</p>

        <div className="accueil__pseudo">
          <label className="champ-label" htmlFor="pseudo">
            Ton pseudo
          </label>
          <input
            id="pseudo"
            className="champ champ--grand"
            autoComplete="nickname"
            maxLength={PSEUDO_MAX}
            placeholder="Ton pseudo"
            value={salon.nom}
            onChange={(e) => salon.setNom(e.target.value)}
          />
        </div>

        {salon.erreur && (
          <p className="avis avis--erreur" role="alert">
            {salon.erreur}
          </p>
        )}

        <div className="accueil__choix">
          {viaLien ? (
            <>
              {rejoindre}
              {creer}
            </>
          ) : (
            <>
              {creer}
              {rejoindre}
            </>
          )}
        </div>
      </div>
      <Pied />
    </div>
  );
}
