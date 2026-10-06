"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DataConnection, Peer, PeerOptions } from "peerjs";
import { Pochette } from "@/components/connexions/Pochette";
import { PlayButton } from "@/components/player/Lecteur";
import { TYPES_OEUVRE } from "@/lib/sections";
import { TAILLES, melanger, nomDuTour, type ItemDuel } from "./Dilemme";
import { FiltresJeuBarre, useFiltresJeu } from "./Filtres";

/*
 * Dilemme à plusieurs, en ligne.
 *
 * Un joueur crée un salon (il en devient l'hôte) et partage son code. Les autres le
 * rejoignent. Tout le monde voit le même duel et vote ; l'œuvre qui a le plus de voix
 * passe au tour suivant. En cas d'égalité, c'est tiré au sort.
 *
 * Il n'y a pas de serveur de jeu : les navigateurs se relient directement entre eux
 * (bibliothèque PeerJS). Le navigateur de l'hôte fait l'arbitre : il reçoit les votes,
 * compte, et renvoie l'état de la partie à tout le monde. Si l'hôte ferme sa page,
 * la partie s'arrête.
 */

/** Nombre maximum de joueurs dans un salon, hôte compris. */
const MAX_JOUEURS = 12;
/** Temps d'affichage du résultat d'un duel avant le suivant (millisecondes). */
const PAUSE_RESULTAT = 3400;
/** Lettres du code de salon (sans I, O, 0, 1 : trop faciles à confondre). */
const LETTRES = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LONGUEUR_CODE = 4;
const PREFIXE = "henassa-dilemme-";
const HOTE = "hote";
const PSEUDO_STOCK = "henassa-pseudo";
/** Chacun envoie un petit signe de vie à ce rythme ; sans nouvelles pendant SILENCE_MAX, on le considère parti. */
const SIGNE_DE_VIE = 3000;
const SILENCE_MAX = 11000;

type Joueur = { id: string; nom: string };
type Etat = {
  phase: "salon" | "duel" | "resultat" | "fin";
  joueurs: Joueur[];
  /** Rappel des réglages choisis par l'hôte. */
  taille: number;
  etiquette: string;
  tour: string[];
  suite: string[];
  duel: number;
  sorties: { cle: string; tour: number }[];
  /** Pendant le vote : qui a déjà voté (sans dire pour quoi). */
  ontVote: string[];
  /** Au résultat : le vote de chacun. */
  votes: Record<string, string>;
  gagnant?: string;
  egalite?: boolean;
};
type Message = { t: "bonjour"; nom: string } | { t: "vote"; cle: string } | { t: "signe" } | { t: "depart" } | { t: "nom"; nom: string } | { t: "etat"; etat: Etat; toi: string } | { t: "refus"; raison: string };

const etatVide = (): Etat => ({ phase: "salon", joueurs: [], taille: 16, etiquette: "", tour: [], suite: [], duel: 0, sorties: [], ontVote: [], votes: {} });

/** Un pseudo propre : 16 caractères au plus, et un numéro s'il est déjà pris dans le salon. */
function nomLibre(voulu: string, autres: Joueur[], defaut: string) {
  const base = voulu.trim().replace(/\s+/g, " ").slice(0, 16) || defaut;
  const pris = new Set(autres.map((j) => j.nom.toLowerCase()));
  if (!pris.has(base.toLowerCase())) return base;
  for (let n = 2; n < 99; n++) {
    const essai = `${base.slice(0, 13)} ${n}`;
    if (!pris.has(essai.toLowerCase())) return essai;
  }
  return base;
}

function nouveauCode() {
  let c = "";
  for (let i = 0; i < LONGUEUR_CODE; i++) c += LETTRES[Math.floor(Math.random() * LETTRES.length)];
  return c;
}

/** Réglages du relais de connexion. Par défaut : le relais public gratuit de PeerJS. */
function optionsPeer(): PeerOptions {
  const host = process.env.NEXT_PUBLIC_PEER_HOST;
  if (!host) return {};
  return {
    host,
    port: Number(process.env.NEXT_PUBLIC_PEER_PORT) || 443,
    path: process.env.NEXT_PUBLIC_PEER_PATH || "/",
    secure: process.env.NEXT_PUBLIC_PEER_SECURE !== "false",
  };
}

export function DilemmeSalon({ oeuvres }: { oeuvres: ItemDuel[] }) {
  const parCle = useMemo(() => new Map(oeuvres.map((o) => [o.cle, o])), [oeuvres]);
  const f = useFiltresJeu(oeuvres);
  const [taille, setTaille] = useState(16);

  const [nom, setNom] = useState("");
  const [codeSaisi, setCodeSaisi] = useState("");
  /** "" = écran d'accueil ; sinon on est dans un salon. */
  const [role, setRole] = useState<"" | "hote" | "invite">("");
  const [code, setCode] = useState("");
  const [moi, setMoi] = useState("");
  const [etat, setEtat] = useState<Etat>(etatVide);
  const [statut, setStatut] = useState<"" | "connexion" | "ok">("");
  const [erreur, setErreur] = useState("");
  const [copie, setCopie] = useState(false);

  const peer = useRef<Peer | null>(null);
  /** Côté invité : la liaison avec l'hôte. */
  const versHote = useRef<DataConnection | null>(null);
  /** Côté hôte : l'état de référence, les votes en cours et les liaisons avec les invités. */
  const H = useRef<{ etat: Etat; votes: Map<string, string>; conns: Map<string, DataConnection>; vus: Map<string, number>; minuteur: ReturnType<typeof setTimeout> | null }>({ etat: etatVide(), votes: new Map(), conns: new Map(), vus: new Map(), minuteur: null });
  /** Côté invité : heure du dernier message reçu de l'hôte. */
  const hoteVu = useRef(0);

  // Pseudo retenu d'une fois sur l'autre, et code pré-rempli si on arrive par un lien d'invitation
  useEffect(() => {
    try {
      setNom(localStorage.getItem(PSEUDO_STOCK) ?? "");
    } catch {}
    const c = new URLSearchParams(window.location.search).get("code");
    if (c) setCodeSaisi(c.toUpperCase().slice(0, LONGUEUR_CODE));
  }, []);

  const quitter = useCallback(() => {
    if (H.current.minuteur) clearTimeout(H.current.minuteur);
    try {
      peer.current?.destroy();
    } catch {}
    peer.current = null;
    versHote.current = null;
    H.current = { etat: etatVide(), votes: new Map(), conns: new Map(), vus: new Map(), minuteur: null };
    setRole("");
    setCode("");
    setStatut("");
    setEtat(etatVide());
  }, []);
  useEffect(() => () => {
    try {
      peer.current?.destroy();
    } catch {}
  }, []);

  /* ---------- Côté hôte : l'arbitre ---------- */

  /** Envoie l'état à tout le monde (et l'affiche chez l'hôte). */
  const diffuser = useCallback(() => {
    const e = H.current.etat;
    setEtat({ ...e });
    for (const [id, c] of H.current.conns) {
      try {
        if (c.open) c.send({ t: "etat", etat: e, toi: id } satisfies Message);
      } catch {}
    }
  }, []);

  const avancer = useCallback(() => {
    const h = H.current, e = h.etat;
    if (e.phase !== "resultat" || !e.gagnant) return;
    const a = e.tour[e.duel * 2]!, b = e.tour[e.duel * 2 + 1]!;
    const suite = [...e.suite, e.gagnant];
    const sorties = [...e.sorties, { cle: e.gagnant === a ? b : a, tour: e.tour.length }];
    h.votes.clear();
    const fin = (e.duel + 1) * 2 >= e.tour.length;
    const tour = fin ? suite : e.tour;
    h.etat = { ...e, tour, suite: fin ? [] : suite, duel: fin ? 0 : e.duel + 1, sorties, ontVote: [], votes: {}, gagnant: undefined, egalite: false, phase: tour.length === 1 ? "fin" : "duel" };
    diffuser();
  }, [diffuser]);

  /** Ferme le vote du duel en cours et affiche le résultat. */
  const clore = useCallback(() => {
    const h = H.current, e = h.etat;
    if (e.phase !== "duel") return;
    const a = e.tour[e.duel * 2]!, b = e.tour[e.duel * 2 + 1]!;
    let pourA = 0, pourB = 0;
    for (const v of h.votes.values()) v === a ? pourA++ : pourB++;
    const egalite = pourA === pourB;
    const gagnant = egalite ? (Math.random() < 0.5 ? a : b) : pourA > pourB ? a : b;
    h.etat = { ...e, phase: "resultat", votes: Object.fromEntries(h.votes), gagnant, egalite };
    diffuser();
    if (h.minuteur) clearTimeout(h.minuteur);
    h.minuteur = setTimeout(avancer, PAUSE_RESULTAT);
  }, [diffuser, avancer]);

  const recevoirVote = useCallback(
    (id: string, cle: string) => {
      const h = H.current, e = h.etat;
      if (e.phase !== "duel" || !e.joueurs.some((j) => j.id === id)) return;
      if (cle !== e.tour[e.duel * 2] && cle !== e.tour[e.duel * 2 + 1]) return;
      h.votes.set(id, cle);
      h.etat = { ...e, ontVote: [...h.votes.keys()] };
      // tout le monde a voté : on compte tout de suite
      if (e.joueurs.every((j) => h.votes.has(j.id))) clore();
      else diffuser();
    },
    [clore, diffuser]
  );

  /** Change le pseudo d'un joueur (hôte ou invité), en évitant les doublons. */
  const renommer = useCallback(
    (id: string, voulu: string) => {
      const h = H.current;
      const autres = h.etat.joueurs.filter((j) => j.id !== id);
      const actuel = h.etat.joueurs.find((j) => j.id === id);
      if (!actuel) return;
      const nouveau = nomLibre(voulu, autres, actuel.nom);
      if (nouveau === actuel.nom) return;
      h.etat = { ...h.etat, joueurs: h.etat.joueurs.map((j) => (j.id === id ? { ...j, nom: nouveau } : j)) };
      diffuser();
    },
    [diffuser]
  );

  const retirerJoueur = useCallback(
    (id: string) => {
      const h = H.current;
      if (!h.conns.has(id) && !h.etat.joueurs.some((j) => j.id === id)) return;
      try {
        h.conns.get(id)?.close();
      } catch {}
      h.conns.delete(id);
      h.vus.delete(id);
      h.votes.delete(id);
      h.etat = { ...h.etat, joueurs: h.etat.joueurs.filter((j) => j.id !== id), ontVote: [...h.votes.keys()] };
      if (h.etat.phase === "duel" && h.votes.size > 0 && h.etat.joueurs.every((j) => h.votes.has(j.id))) clore();
      else diffuser();
    },
    [clore, diffuser]
  );

  const creer = async () => {
    const pseudo = nom.trim().slice(0, 16) || "Hôte";
    setErreur("");
    setStatut("connexion");
    try {
      localStorage.setItem(PSEUDO_STOCK, pseudo);
    } catch {}
    const { Peer } = await import("peerjs");
    const essayer = (essai: number) => {
      const c = nouveauCode();
      const p = new Peer(PREFIXE + c, optionsPeer());
      peer.current = p;
      p.on("open", () => {
        H.current.etat = { ...etatVide(), joueurs: [{ id: HOTE, nom: pseudo }] };
        setCode(c);
        setMoi(HOTE);
        setRole("hote");
        setStatut("ok");
        setEtat({ ...H.current.etat });
      });
      p.on("connection", (conn) => {
        conn.on("data", (brut) => {
          const m = brut as Message;
          const h = H.current;
          h.vus.set(conn.peer, Date.now());
          if (m?.t === "depart") return retirerJoueur(conn.peer);
          if (m?.t === "bonjour") {
            if (h.etat.joueurs.length >= MAX_JOUEURS) {
              conn.send({ t: "refus", raison: "Le salon est complet." } satisfies Message);
              return;
            }
            h.conns.set(conn.peer, conn);
            const autres = h.etat.joueurs.filter((j) => j.id !== conn.peer);
            const nomInvite = nomLibre(String(m.nom ?? ""), autres, `Invité ${autres.length}`);
            h.etat = { ...h.etat, joueurs: [...autres, { id: conn.peer, nom: nomInvite }] };
            diffuser();
          } else if (m?.t === "nom") renommer(conn.peer, String(m.nom ?? ""));
          else if (m?.t === "vote") recevoirVote(conn.peer, String(m.cle));
        });
        conn.on("close", () => retirerJoueur(conn.peer));
        conn.on("error", () => retirerJoueur(conn.peer));
      });
      p.on("error", (err) => {
        // code déjà pris : on en tire un autre
        if ((err as { type?: string }).type === "unavailable-id" && essai < 5) {
          p.destroy();
          essayer(essai + 1);
          return;
        }
        if (peer.current === p && !H.current.etat.joueurs.length) {
          setStatut("");
          setErreur("Impossible de créer le salon. Vérifie ta connexion et réessaie.");
        }
      });
      p.on("disconnected", () => {
        // le relais a coupé : les joueurs déjà reliés le restent, on se reconnecte pour les suivants
        try {
          p.reconnect();
        } catch {}
      });
    };
    essayer(0);
  };

  const lancer = () => {
    const h = H.current;
    const n = TAILLES.filter((t) => t <= f.vivier.length).includes(taille) ? taille : 0;
    if (!n) return;
    if (h.minuteur) clearTimeout(h.minuteur);
    h.votes.clear();
    const etiquette = [f.genre, f.sousGenre, f.de || f.a ? `${f.de || "…"}-${f.a || "…"}` : ""].filter(Boolean).join(" · ");
    h.etat = { ...h.etat, phase: "duel", taille: n, etiquette, tour: melanger(f.vivier).slice(0, n).map((o) => o.cle), suite: [], duel: 0, sorties: [], ontVote: [], votes: {}, gagnant: undefined, egalite: false };
    diffuser();
  };
  const retourSalon = () => {
    const h = H.current;
    if (h.minuteur) clearTimeout(h.minuteur);
    h.votes.clear();
    h.etat = { ...h.etat, phase: "salon", tour: [], suite: [], duel: 0, sorties: [], ontVote: [], votes: {}, gagnant: undefined };
    diffuser();
  };

  /* ---------- Côté invité ---------- */

  const rejoindre = async () => {
    const c = codeSaisi.trim().toUpperCase();
    if (c.length !== LONGUEUR_CODE) return setErreur(`Le code fait ${LONGUEUR_CODE} caractères.`);
    const pseudo = nom.trim().slice(0, 16) || "Invité";
    setErreur("");
    setStatut("connexion");
    try {
      localStorage.setItem(PSEUDO_STOCK, pseudo);
    } catch {}
    const { Peer } = await import("peerjs");
    const p = new Peer(optionsPeer());
    peer.current = p;
    const echec = (msg: string) => {
      if (peer.current !== p) return;
      quitter();
      setErreur(msg);
    };
    // sans réponse au bout de quelques secondes, on abandonne proprement
    const garde = setTimeout(() => echec("Pas de réponse du salon. Vérifie le code, ou change de réseau (certains bloquent ce type de connexion)."), 15000);
    p.on("open", () => {
      const conn = p.connect(PREFIXE + c, { reliable: true });
      versHote.current = conn;
      conn.on("open", () => conn.send({ t: "bonjour", nom: pseudo } satisfies Message));
      conn.on("data", (brut) => {
        const m = brut as Message;
        hoteVu.current = Date.now();
        if (m?.t === "etat") {
          clearTimeout(garde);
          setEtat(m.etat);
          setMoi(m.toi);
          setCode(c);
          setRole("invite");
          setStatut("ok");
        } else if (m?.t === "refus") {
          clearTimeout(garde);
          echec(m.raison);
        }
      });
      conn.on("close", () => {
        clearTimeout(garde);
        echec("L'hôte a quitté le salon : la partie est terminée.");
      });
    });
    p.on("error", (err) => {
      clearTimeout(garde);
      echec((err as { type?: string }).type === "peer-unavailable" ? "Aucun salon avec ce code. Vérifie-le avec la personne qui t'a invité." : "La connexion a échoué. Vérifie ta connexion et réessaie.");
    });
  };

  /* ---------- Signes de vie : repérer vite quelqu'un qui a fermé sa page ---------- */
  useEffect(() => {
    if (!role) return;
    const tic = setInterval(() => {
      const maintenant = Date.now();
      if (role === "hote") {
        const h = H.current;
        for (const [id, c] of h.conns) {
          try {
            if (c.open) c.send({ t: "signe" } satisfies Message);
          } catch {}
          if (maintenant - (h.vus.get(id) ?? maintenant) > SILENCE_MAX) retirerJoueur(id);
        }
      } else {
        try {
          versHote.current?.send({ t: "signe" } satisfies Message);
        } catch {}
        if (hoteVu.current && maintenant - hoteVu.current > SILENCE_MAX) {
          quitter();
          setErreur("L'hôte ne répond plus : la partie est terminée.");
        }
      }
    }, SIGNE_DE_VIE);
    // en fermant la page, on prévient tout de suite
    const partir = () => {
      try {
        if (role === "invite") versHote.current?.send({ t: "depart" } satisfies Message);
      } catch {}
    };
    window.addEventListener("pagehide", partir);
    return () => {
      clearInterval(tic);
      window.removeEventListener("pagehide", partir);
    };
  }, [role, retirerJoueur, quitter]);

  /* ---------- Commun ---------- */

  const voter = (cle: string) => {
    if (etat.phase !== "duel") return;
    if (role === "hote") recevoirVote(HOTE, cle);
    else
      try {
        versHote.current?.send({ t: "vote", cle } satisfies Message);
        // affichage immédiat, sans attendre le retour de l'hôte
        setEtat((e) => (e.ontVote.includes(moi) ? e : { ...e, ontVote: [...e.ontVote, moi] }));
      } catch {}
    setMonVote(cle);
  };
  const [monVote, setMonVote] = useState("");
  const numeroDuel = etat.sorties.length;
  useEffect(() => setMonVote(""), [numeroDuel, etat.phase === "salon"]);

  /** Pseudo en cours de modification dans le salon ("" = pas en train de modifier). */
  const [edition, setEdition] = useState<string | null>(null);
  const validerPseudo = () => {
    const voulu = (edition ?? "").trim();
    setEdition(null);
    if (!voulu) return;
    setNom(voulu);
    try {
      localStorage.setItem(PSEUDO_STOCK, voulu.slice(0, 16));
    } catch {}
    if (role === "hote") renommer(HOTE, voulu);
    else
      try {
        versHote.current?.send({ t: "nom", nom: voulu } satisfies Message);
      } catch {}
  };

  const lien = typeof window !== "undefined" && code ? `${window.location.origin}${window.location.pathname}?code=${code}` : "";
  const copierLien = async () => {
    try {
      await navigator.clipboard.writeText(lien);
      setCopie(true);
      setTimeout(() => setCopie(false), 1800);
    } catch {}
  };

  // Au lancement de la partie, on amène le duel en haut de l'écran
  const zone = useRef<HTMLDivElement>(null);
  const enJeu = etat.phase === "duel" || etat.phase === "resultat";
  useEffect(() => {
    if (enJeu) zone.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [enJeu]);

  const estHote = role === "hote";
  const nomDe = (id: string) => etat.joueurs.find((j) => j.id === id)?.nom ?? "?";
  const taillesPossibles = TAILLES.filter((t) => t <= f.vivier.length);
  const tailleChoisie = taillesPossibles.includes(taille) ? taille : taillesPossibles[taillesPossibles.length - 1];
  useEffect(() => {
    if (tailleChoisie && tailleChoisie !== taille) setTaille(tailleChoisie);
  }, [tailleChoisie, taille]);

  /* ---------- Accueil : créer ou rejoindre ---------- */
  if (!role) {
    return (
      <div className="dilemme salon">
        <div className="dl-bloc">
          <h2 className="dl-h">Ton pseudo</h2>
          <label className="sl-champ">
            <span className="visually-hidden">Ton pseudo</span>
            <input id="sl-pseudo" value={nom} maxLength={16} autoComplete="off" placeholder="Comment on t'appelle ?" onChange={(e) => setNom(e.target.value)} />
          </label>
          <p className="dl-note">C&apos;est le nom que les autres verront à côté de tes votes. Tu pourras le changer dans le salon.</p>
        </div>
        <div className="sl-choix">
          <div className="sl-carte">
            <h2 className="dl-h">Créer un salon</h2>
            <p className="dl-note">Tu choisis les œuvres, tu invites tes potes avec un code, et tu lances la partie.</p>
            <button type="button" className="dl-lancer" onClick={creer} disabled={statut === "connexion"}>
              Créer un salon →
            </button>
          </div>
          <div className="sl-carte">
            <h2 className="dl-h">Rejoindre</h2>
            <p className="dl-note">Entre le code que l&apos;on t&apos;a donné.</p>
            <label className="sl-champ sl-champ--code">
              <span className="visually-hidden">Code du salon</span>
              <input
                id="sl-code"
                value={codeSaisi}
                maxLength={LONGUEUR_CODE}
                autoComplete="off"
                autoCapitalize="characters"
                placeholder="CODE"
                onChange={(e) => setCodeSaisi(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && rejoindre()}
              />
            </label>
            <button type="button" className="dl-lancer" onClick={rejoindre} disabled={statut === "connexion" || codeSaisi.length !== LONGUEUR_CODE}>
              Rejoindre →
            </button>
          </div>
        </div>
        {statut === "connexion" && <p className="dl-note dl-note--centre" role="status">Connexion en cours…</p>}
        {erreur && <p className="tl-message" role="alert">{erreur}</p>}
        <p className="dl-note dl-note--centre">
          <Link href="/mini-jeux/dilemme">Jouer seul</Link>
        </p>
      </div>
    );
  }

  const listeJoueurs = (
    <ul className="sl-joueurs" aria-label="Joueurs">
      {etat.joueurs.map((j) => {
        const aVote = etat.phase === "duel" && etat.ontVote.includes(j.id);
        return (
          <li key={j.id} className={`${aVote ? "a-vote" : ""}${j.id === moi ? " est-moi" : ""}`}>
            {etat.phase === "duel" && <span aria-hidden="true">{aVote ? "✓" : "…"}</span>}
            {j.id === moi && edition !== null ? (
              <input
                className="sl-renommer"
                value={edition}
                maxLength={16}
                autoFocus
                aria-label="Ton pseudo"
                onChange={(e) => setEdition(e.target.value)}
                onBlur={validerPseudo}
                onKeyDown={(e) => {
                  if (e.key === "Enter") validerPseudo();
                  if (e.key === "Escape") setEdition(null);
                }}
              />
            ) : j.id === moi ? (
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
        Salon <strong>{code}</strong>
      </span>
      <button type="button" className="ctrl-btn ctrl-btn--text" onClick={copierLien}>
        {copie ? "Lien copié !" : "Copier le lien d'invitation"}
      </button>
      <button
        type="button"
        className="ctrl-btn ctrl-btn--text"
        onClick={() => {
          try {
            if (role === "invite") versHote.current?.send({ t: "depart" } satisfies Message);
          } catch {}
          // on laisse au message le temps de partir avant de couper
          setTimeout(quitter, 120);
        }}
      >
        Quitter
      </button>
    </div>
  );

  /* ---------- Salon d'attente ---------- */
  if (etat.phase === "salon") {
    return (
      <div className="dilemme salon">
        {bandeau}
        <div className="dl-bloc">
          <h2 className="dl-h">
            Joueurs <span className="sl-nb">{etat.joueurs.length}</span>
          </h2>
          {listeJoueurs}
          <p className="dl-note">{estHote ? "Partage le code ou le lien, puis lance la partie quand tout le monde est là." : "En attente de l'hôte, qui choisit les œuvres et lance la partie."}</p>
        </div>
        {estHote && (
          <>
            <div className="dl-bloc">
              <h2 className="dl-h">Quelles œuvres ?</h2>
              <FiltresJeuBarre f={f} id="sl" />
            </div>
            <div className="dl-bloc">
              <h2 className="dl-h">Combien d&apos;œuvres ?</h2>
              <div className="filters" role="group" aria-label="Taille du tournoi">
                {TAILLES.map((t) => (
                  <button key={t} type="button" className={`filter dl-taille${tailleChoisie === t ? " is-on" : ""}`} aria-pressed={tailleChoisie === t} disabled={t > f.vivier.length} onClick={() => setTaille(t)}>
                    {t}
                  </button>
                ))}
              </div>
              <p className="dl-note">
                {tailleChoisie ? `${tailleChoisie} œuvres tirées au hasard, soit ${tailleChoisie - 1} duels à voter.` : "Il faut au moins 8 œuvres : enlève un filtre."}
              </p>
            </div>
            <button type="button" className="dl-lancer" onClick={lancer} disabled={!tailleChoisie}>
              Lancer la partie →
            </button>
          </>
        )}
      </div>
    );
  }

  /* ---------- Fin ---------- */
  if (etat.phase === "fin") {
    const vainqueur = parCle.get(etat.tour[0]!);
    const suivants = [...etat.sorties.filter((s) => s.tour === 2), ...etat.sorties.filter((s) => s.tour === 4)].map((s) => ({ o: parCle.get(s.cle), finale: s.tour === 2 }));
    return (
      <div className="dilemme dl-fin">
        {bandeau}
        <p className="dl-tour">Vainqueur du salon</p>
        {vainqueur && (
          <div className="dl-vainqueur" style={{ ["--type" as string]: TYPES_OEUVRE[vainqueur.type].couleur }}>
            <span className="dl-vainqueur__echo" aria-hidden="true">
              {vainqueur.titre.split(/\s+/)[0]}
            </span>
            <div className="dl-vainqueur__cover">
              <Pochette o={vainqueur} alt="" lazy={false} />
            </div>
            <h2 className="dl-vainqueur__titre">{vainqueur.titre}</h2>
            <p className="dl-carte__auteur">
              {vainqueur.auteur}
              {vainqueur.annee ? ` · ${vainqueur.annee}` : ""}
            </p>
            {vainqueur.media && <PlayButton piste={{ titre: vainqueur.titre, auteur: vainqueur.auteur, cover: vainqueur.cover, media: vainqueur.media, slug: vainqueur.cle }} />}
          </div>
        )}
        <ul className="dl-podium">
          {suivants.map(({ o, finale }) =>
            o ? (
              <li key={o.cle}>
                <div className="dl-podium__cover">
                  <Pochette o={o} alt="" petite />
                </div>
                <span className="dl-podium__rang">{finale ? "Finaliste" : "Demi-finale"}</span>
                <span className="dl-podium__titre">{o.titre}</span>
              </li>
            ) : null
          )}
        </ul>
        {listeJoueurs}
        {estHote ? (
          <div className="dl-actions">
            <button type="button" className="ctrl-btn ctrl-btn--text" onClick={lancer} disabled={!tailleChoisie}>
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

  /* ---------- Duel et résultat ---------- */
  const a = parCle.get(etat.tour[etat.duel * 2]!), b = parCle.get(etat.tour[etat.duel * 2 + 1]!);
  const resultat = etat.phase === "resultat";
  const total = etat.taille - 1, faits = etat.sorties.length;
  const carte = (o: ItemDuel, cote: "gauche" | "droite") => {
    const voix = resultat ? etat.joueurs.filter((j) => etat.votes[j.id] === o.cle) : [];
    const classes = `dl-carte dl-carte--${cote}${monVote === o.cle ? " est-mon-vote" : ""}${resultat ? (etat.gagnant === o.cle ? " est-gagnante" : " est-perdante") : ""}`;
    return (
      <div className={classes} style={{ ["--type" as string]: TYPES_OEUVRE[o.type].couleur }}>
        <button type="button" className="dl-carte__choix" onClick={() => voter(o.cle)} disabled={resultat} aria-pressed={monVote === o.cle} aria-label={`Voter pour ${o.titre}, ${o.auteur}`}>
          <span className="dl-carte__cover">
            <Pochette o={o} alt="" lazy={false} />
            {resultat && <span className="sl-score">{voix.length}</span>}
          </span>
          <span className="dl-carte__titre">{o.titre}</span>
          <span className="dl-carte__auteur">
            {o.auteur}
            {o.annee ? ` · ${o.annee}` : ""}
          </span>
        </button>
        {resultat ? (
          <ul className="sl-voix" aria-label={`Ont voté pour ${o.titre}`}>
            {voix.map((j, k) => (
              <li key={j.id} className={j.id === moi ? "est-moi" : ""} style={{ ["--k" as string]: k }}>
                {j.nom}
              </li>
            ))}
            {voix.length === 0 && <li className="sl-voix__vide">Aucune voix</li>}
          </ul>
        ) : (
          o.media && <PlayButton compact piste={{ titre: o.titre, auteur: o.auteur, cover: o.cover, media: o.media, slug: o.cle }} className="dl-carte__ecouter" />
        )}
      </div>
    );
  };

  return (
    <div className="dilemme dl-jeu salon" ref={zone}>
      {bandeau}
      <div className="dl-entete">
        <p className="dl-tour">{nomDuTour(etat.tour.length)}</p>
        <p className="dl-compte">{etat.tour.length > 2 ? `Duel ${etat.duel + 1} / ${etat.tour.length / 2}` : "Le dernier vote"}</p>
      </div>
      <div className="dl-barre" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={faits} aria-label="Avancement du tournoi">
        <i style={{ width: `${(faits / Math.max(1, total)) * 100}%` }} />
      </div>
      {a && b && (
        <div className={`dl-duel${resultat ? " est-resultat" : ""}`} key={numeroDuel}>
          {carte(a, "gauche")}
          <span className="dl-vs" aria-hidden="true">
            vs
          </span>
          {carte(b, "droite")}
        </div>
      )}
      <p className="sl-etat" role="status">
        {resultat
          ? etat.egalite
            ? `Égalité : le sort a choisi ${parCle.get(etat.gagnant ?? "")?.titre ?? ""}.`
            : `${parCle.get(etat.gagnant ?? "")?.titre ?? ""} passe au tour suivant.`
          : monVote
            ? `Vote enregistré (tu peux encore changer). ${etat.ontVote.length} / ${etat.joueurs.length} ont voté.`
            : `À toi de voter. ${etat.ontVote.length} / ${etat.joueurs.length} ont voté.`}
      </p>
      {listeJoueurs}
      {estHote && (
        <div className="dl-actions">
          {!resultat && (
            <button type="button" className="ctrl-btn ctrl-btn--text" onClick={clore} disabled={etat.ontVote.length === 0}>
              Clore le vote sans attendre
            </button>
          )}
          <button type="button" className="ctrl-btn ctrl-btn--text" onClick={retourSalon}>
            Arrêter la partie
          </button>
        </div>
      )}
      {!estHote && <p className="dl-note dl-note--centre">Le résultat s&apos;affiche dès que tout le monde a voté. Égalité : {nomDe(HOTE)} n&apos;y est pour rien, c&apos;est tiré au sort.</p>}
    </div>
  );
}
