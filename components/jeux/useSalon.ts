"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DataConnection, Peer, PeerOptions } from "peerjs";

/*
 * Un salon de jeu en ligne, sans serveur de jeu : les navigateurs se relient
 * directement entre eux (bibliothèque PeerJS). Celui qui crée le salon en est
 * l'hôte : son navigateur garde l'état de référence, reçoit les messages des
 * autres et renvoie l'état à tout le monde. Si l'hôte ferme sa page, la partie s'arrête.
 *
 * Ce crochet gère tout ce qui n'est pas le jeu : code du salon, arrivées et départs,
 * pseudos, signes de vie. Le jeu, lui, reçoit ses messages dans « surJeu » (côté hôte).
 */

export type Joueur = { id: string; nom: string };
export const HOTE = "hote";

/** Lettres du code de salon (sans I, O, 0, 1 : trop faciles à confondre). */
const LETTRES = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const LONGUEUR_CODE = 4;
const PSEUDO_STOCK = "henassa-pseudo";
/** Chacun envoie un petit signe de vie à ce rythme ; sans nouvelles pendant SILENCE_MAX, on le considère parti. */
const SIGNE_DE_VIE = 3000;
const SILENCE_MAX = 11000;

type Message<E> =
  | { t: "bonjour"; nom: string }
  | { t: "signe" }
  | { t: "depart" }
  | { t: "nom"; nom: string }
  | { t: "etat"; etat: E; toi: string }
  | { t: "refus"; raison: string }
  | { t: "jeu"; m: unknown };

/** Un pseudo propre : 16 caractères au plus, et un numéro s'il est déjà pris dans le salon. */
export function nomLibre(voulu: string, autres: Joueur[], defaut: string) {
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

type Options<E> = {
  /** Préfixe des codes, propre à chaque jeu : « henassa-parcours- ». */
  prefixe: string;
  vide: () => E;
  max: number;
  /** Côté hôte : un message de jeu arrive (de l'hôte lui-même ou d'un invité). */
  surJeu: (id: string, m: unknown) => void;
  /** Côté hôte : quelqu'un est arrivé ou parti. */
  surJoueurs?: () => void;
};

export function useSalon<E extends { joueurs: Joueur[] }>(o: Options<E>) {
  const opts = useRef(o);
  opts.current = o;

  const [role, setRole] = useState<"" | "hote" | "invite">("");
  const [code, setCode] = useState("");
  const [moi, setMoi] = useState("");
  const [etat, setEtat] = useState<E>(o.vide);
  const [statut, setStatut] = useState<"" | "connexion" | "ok">("");
  const [erreur, setErreur] = useState("");
  const [nom, setNom] = useState("");
  const [codeSaisi, setCodeSaisi] = useState("");

  const peer = useRef<Peer | null>(null);
  const versHote = useRef<DataConnection | null>(null);
  const H = useRef<{ etat: E; conns: Map<string, DataConnection>; vus: Map<string, number> }>({ etat: o.vide(), conns: new Map(), vus: new Map() });
  const hoteVu = useRef(0);

  // Pseudo retenu d'une fois sur l'autre, et code pré-rempli si on arrive par un lien d'invitation
  useEffect(() => {
    try {
      setNom(localStorage.getItem(PSEUDO_STOCK) ?? "");
    } catch {}
    const c = new URLSearchParams(window.location.search).get("code");
    if (c) setCodeSaisi(c.toUpperCase().slice(0, LONGUEUR_CODE));
  }, []);

  /* ---------- Côté hôte ---------- */

  const diffuser = useCallback(() => {
    const e = H.current.etat;
    setEtat({ ...e });
    for (const [id, c] of H.current.conns) {
      try {
        if (c.open) c.send({ t: "etat", etat: e, toi: id } satisfies Message<E>);
      } catch {}
    }
  }, []);
  /** L'état de référence (hôte seulement). */
  const lire = useCallback(() => H.current.etat, []);
  /** Change l'état de référence et l'envoie à tout le monde (hôte seulement). */
  const ecrire = useCallback(
    (e: E) => {
      H.current.etat = e;
      diffuser();
    },
    [diffuser]
  );

  const renommer = useCallback(
    (id: string, voulu: string) => {
      const h = H.current;
      const autres = h.etat.joueurs.filter((j) => j.id !== id);
      const actuel = h.etat.joueurs.find((j) => j.id === id);
      if (!actuel) return;
      const nouveau = nomLibre(voulu, autres, actuel.nom);
      if (nouveau === actuel.nom) return;
      ecrire({ ...h.etat, joueurs: h.etat.joueurs.map((j) => (j.id === id ? { ...j, nom: nouveau } : j)) });
    },
    [ecrire]
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
      h.etat = { ...h.etat, joueurs: h.etat.joueurs.filter((j) => j.id !== id) };
      diffuser();
      opts.current.surJoueurs?.();
    },
    [diffuser]
  );

  const quitter = useCallback(() => {
    try {
      peer.current?.destroy();
    } catch {}
    peer.current = null;
    versHote.current = null;
    H.current = { etat: opts.current.vide(), conns: new Map(), vus: new Map() };
    setRole("");
    setCode("");
    setStatut("");
    setEtat(opts.current.vide());
  }, []);
  useEffect(
    () => () => {
      try {
        peer.current?.destroy();
      } catch {}
    },
    []
  );

  const garderPseudo = (p: string) => {
    try {
      localStorage.setItem(PSEUDO_STOCK, p);
    } catch {}
  };

  const creer = async () => {
    const pseudo = nom.trim().slice(0, 16) || "Hôte";
    setErreur("");
    setStatut("connexion");
    garderPseudo(pseudo);
    const { Peer } = await import("peerjs");
    const essayer = (essai: number) => {
      const c = nouveauCode();
      const p = new Peer(opts.current.prefixe + c, optionsPeer());
      peer.current = p;
      p.on("open", () => {
        H.current.etat = { ...opts.current.vide(), joueurs: [{ id: HOTE, nom: pseudo }] };
        setCode(c);
        setMoi(HOTE);
        setRole("hote");
        setStatut("ok");
        setEtat({ ...H.current.etat });
      });
      p.on("connection", (conn) => {
        conn.on("data", (brut) => {
          const m = brut as Message<E>;
          const h = H.current;
          h.vus.set(conn.peer, Date.now());
          if (m?.t === "depart") return retirerJoueur(conn.peer);
          if (m?.t === "bonjour") {
            if (h.etat.joueurs.length >= opts.current.max) {
              conn.send({ t: "refus", raison: "Le salon est complet." } satisfies Message<E>);
              return;
            }
            h.conns.set(conn.peer, conn);
            const autres = h.etat.joueurs.filter((j) => j.id !== conn.peer);
            const nomInvite = nomLibre(String(m.nom ?? ""), autres, `Invité ${autres.length}`);
            h.etat = { ...h.etat, joueurs: [...autres, { id: conn.peer, nom: nomInvite }] };
            diffuser();
            opts.current.surJoueurs?.();
          } else if (m?.t === "nom") renommer(conn.peer, String(m.nom ?? ""));
          else if (m?.t === "jeu") opts.current.surJeu(conn.peer, m.m);
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
        try {
          p.reconnect();
        } catch {}
      });
    };
    essayer(0);
  };

  /* ---------- Côté invité ---------- */

  const rejoindre = async () => {
    const c = codeSaisi.trim().toUpperCase();
    if (c.length !== LONGUEUR_CODE) return setErreur(`Le code fait ${LONGUEUR_CODE} caractères.`);
    const pseudo = nom.trim().slice(0, 16) || "Invité";
    setErreur("");
    setStatut("connexion");
    garderPseudo(pseudo);
    const { Peer } = await import("peerjs");
    const p = new Peer(optionsPeer());
    peer.current = p;
    const echec = (msg: string) => {
      if (peer.current !== p) return;
      quitter();
      setErreur(msg);
    };
    const garde = setTimeout(() => echec("Pas de réponse du salon. Vérifie le code, ou change de réseau (certains bloquent ce type de connexion)."), 15000);
    p.on("open", () => {
      const conn = p.connect(opts.current.prefixe + c, { reliable: true });
      versHote.current = conn;
      conn.on("open", () => conn.send({ t: "bonjour", nom: pseudo } satisfies Message<E>));
      conn.on("data", (brut) => {
        const m = brut as Message<E>;
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

  /* ---------- Signes de vie ---------- */
  useEffect(() => {
    if (!role) return;
    const tic = setInterval(() => {
      const maintenant = Date.now();
      if (role === "hote") {
        const h = H.current;
        for (const [id, c] of h.conns) {
          try {
            if (c.open) c.send({ t: "signe" } satisfies Message<E>);
          } catch {}
          if (maintenant - (h.vus.get(id) ?? maintenant) > SILENCE_MAX) retirerJoueur(id);
        }
      } else {
        try {
          versHote.current?.send({ t: "signe" } satisfies Message<E>);
        } catch {}
        if (hoteVu.current && maintenant - hoteVu.current > SILENCE_MAX) {
          quitter();
          setErreur("L'hôte ne répond plus : la partie est terminée.");
        }
      }
    }, SIGNE_DE_VIE);
    const partirVite = () => {
      try {
        if (role === "invite") versHote.current?.send({ t: "depart" } satisfies Message<E>);
      } catch {}
    };
    window.addEventListener("pagehide", partirVite);
    return () => {
      clearInterval(tic);
      window.removeEventListener("pagehide", partirVite);
    };
  }, [role, retirerJoueur, quitter]);

  /* ---------- Commun ---------- */

  /** Envoie un message de jeu à l'hôte (l'hôte se l'envoie à lui-même). */
  const envoyer = useCallback(
    (m: unknown) => {
      if (role === "hote") opts.current.surJeu(HOTE, m);
      else
        try {
          versHote.current?.send({ t: "jeu", m } satisfies Message<E>);
        } catch {}
    },
    [role]
  );

  const changerMonNom = (voulu: string) => {
    const v = voulu.trim();
    if (!v) return;
    setNom(v);
    garderPseudo(v.slice(0, 16));
    if (role === "hote") renommer(HOTE, v);
    else
      try {
        versHote.current?.send({ t: "nom", nom: v } satisfies Message<E>);
      } catch {}
  };

  /** Quitter en prévenant l'hôte (on laisse au message le temps de partir). */
  const partir = () => {
    try {
      if (role === "invite") versHote.current?.send({ t: "depart" } satisfies Message<E>);
    } catch {}
    setTimeout(quitter, 120);
  };

  const lien = typeof window !== "undefined" && code ? `${window.location.origin}${window.location.pathname}?code=${code}` : "";

  return { role, estHote: role === "hote", code, moi, etat, statut, erreur, nom, setNom, codeSaisi, setCodeSaisi, creer, rejoindre, partir, envoyer, lire, ecrire, changerMonNom, lien };
}
export type Salon<E extends { joueurs: Joueur[] }> = ReturnType<typeof useSalon<E>>;
