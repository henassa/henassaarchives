"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DataConnection, Peer, PeerOptions } from "peerjs";
import { nettoyerPseudo, PSEUDO_MAX } from "@/components/blindtest/lib/texte";

/*
 * Une room de jeu sans serveur de jeu : les navigateurs se relient directement
 * entre eux (PeerJS). Celui qui crée la room en est l'hôte : son navigateur garde
 * l'état de référence, reçoit les messages des autres et renvoie l'état à tout le monde.
 * Si l'hôte ferme sa page, la room s'arrête pour tout le monde.
 *
 * Repris du salon de HENASSA, avec en plus :
 * - des codes de 6 caractères tirés au hasard « cryptographique » (impossibles à deviner) ;
 * - un jeton secret par joueur : après un rafraîchissement ou une coupure,
 *   l'invité revient automatiquement avec son pseudo et ses points ;
 * - l'exclusion d'un joueur par l'hôte ;
 * - la mesure de la latence de chacun, et une horloge commune (pour lancer le son
 *   au même moment chez tout le monde et chronométrer les réponses équitablement).
 */

export type Joueur = { id: string; nom: string; present: boolean };
export const HOTE = "hote";

/** Lettres du code (sans I, O, 0, 1 : trop faciles à confondre). 32 lettres, 6 caractères : environ un milliard de codes. */
const LETTRES = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const LONGUEUR_CODE = 6;

const STOCK_PSEUDO = "blindtest-pseudo";
const STOCK_JETON = "blindtest-jeton"; // propre à l'onglet (sessionStorage)
const STOCK_ROOM = "blindtest-room"; // la room à rejoindre après un rafraîchissement
const STOCK_FERMEE = "blindtest-room-fermee"; // l'hôte a rechargé sa page : on lui explique pourquoi la room a disparu

/** Signe de vie de l'hôte à ce rythme ; sans nouvelles pendant SILENCE_MAX, la connexion est considérée coupée. */
const SIGNE_DE_VIE = 2000;
const SILENCE_MAX = 9000;
/** Un joueur déconnecté garde sa place (et ses points) pendant ce temps. */
const PLACE_GARDEE = 3 * 60_000;
/** Un invité coupé essaie de revenir pendant ce temps. */
const RECONNEXION_MAX = 30_000;
/** Au-delà de ce nombre de messages par seconde, ceux d'un invité sont ignorés. */
const DEBIT_MAX = 25;

type MsgInvite = { t: "bonjour"; nom: string; jeton: string } | { t: "pong"; h: number } | { t: "depart" } | { t: "nom"; nom: string } | { t: "jeu"; m: unknown };
type MsgHote<E> = { t: "etat"; etat: E; toi: string } | { t: "refus"; raison: string } | { t: "ping"; h: number; rtt: number } | { t: "fin"; raison: string } | { t: "jeu"; m: unknown };

function hasard(n: number) {
  const octets = new Uint8Array(n);
  crypto.getRandomValues(octets);
  return octets;
}

function nouveauCode() {
  // 256 est un multiple de 32 : chaque lettre a exactement la même chance
  return Array.from(hasard(LONGUEUR_CODE), (o) => LETTRES[o % 32]).join("");
}

const hex = (n: number) => Array.from(hasard(n), (o) => o.toString(16).padStart(2, "0")).join("");

/** Un pseudo libre dans la room : un numéro est ajouté s'il est déjà pris. */
export function nomLibre(voulu: unknown, autres: Joueur[], defaut: string) {
  const base = nettoyerPseudo(voulu) || defaut;
  const pris = new Set(autres.map((j) => j.nom.toLowerCase()));
  if (!pris.has(base.toLowerCase())) return base;
  for (let n = 2; n < 99; n++) {
    const essai = `${base.slice(0, PSEUDO_MAX - 3)} ${n}`;
    if (!pris.has(essai.toLowerCase())) return essai;
  }
  return base;
}

export const codeValide = (c: string) => c.length === LONGUEUR_CODE && [...c].every((l) => LETTRES.includes(l));

/** Réglages du serveur de mise en relation. Par défaut : le serveur public gratuit de PeerJS. */
function optionsPeer(): PeerOptions {
  const host = process.env.NEXT_PUBLIC_PEER_HOST;
  const base: PeerOptions = { debug: 0 };
  if (!host) return base;
  return {
    ...base,
    host,
    port: Number(process.env.NEXT_PUBLIC_PEER_PORT) || 443,
    path: process.env.NEXT_PUBLIC_PEER_PATH || "/",
    secure: process.env.NEXT_PUBLIC_PEER_SECURE !== "false",
  };
}

const lireStock = (s: Storage | undefined, cle: string) => {
  try {
    return s?.getItem(cle) ?? "";
  } catch {
    return "";
  }
};
const ecrireStock = (s: Storage | undefined, cle: string, v: string | null) => {
  try {
    if (v === null) s?.removeItem(cle);
    else s?.setItem(cle, v);
  } catch {}
};
const local = () => (typeof window === "undefined" ? undefined : window.localStorage);
const session = () => (typeof window === "undefined" ? undefined : window.sessionStorage);

function monJeton() {
  let j = lireStock(session(), STOCK_JETON);
  if (!/^[0-9a-f]{32}$/.test(j)) {
    j = hex(16);
    ecrireStock(session(), STOCK_JETON, j);
  }
  return j;
}

const mediane = (l: number[]) => {
  const t = [...l].sort((a, b) => a - b);
  return t.length ? t[Math.floor(t.length / 2)] : 0;
};

type Options<E> = {
  /** Préfixe des identifiants de room sur le serveur de mise en relation. */
  prefixe: string;
  vide: () => E;
  max: number;
  /** Côté hôte : un message de jeu arrive (de l'hôte lui-même ou d'un invité). */
  surJeu: (id: string, m: unknown) => void;
  /** Côté invité : un message de jeu envoyé par l'hôte à lui seul. */
  surJeuInvite?: (m: unknown) => void;
  /** Côté hôte : quelqu'un est arrivé, revenu ou parti. */
  surJoueurs?: () => void;
};

type Hote<E> = {
  etat: E;
  conns: Map<string, DataConnection>;
  jetons: Map<string, string>;
  bannis: Set<string>;
  vus: Map<string, number>;
  rtt: Map<string, number>;
  absents: Map<string, number>;
  debit: Map<string, { n: number; t: number }>;
};

export function useSalon<E extends { joueurs: Joueur[] }>(o: Options<E>) {
  const opts = useRef(o);
  opts.current = o;

  const [role, setRole] = useState<"" | "hote" | "invite">("");
  const [code, setCode] = useState("");
  const [moi, setMoi] = useState("");
  const [etat, setEtat] = useState<E>(o.vide);
  const [statut, setStatut] = useState<"" | "connexion" | "ok" | "reconnexion">("");
  const [erreur, setErreur] = useState("");
  const [nom, setNom] = useState("");
  const [codeSaisi, setCodeSaisi] = useState("");

  const peer = useRef<Peer | null>(null);
  const versHote = useRef<DataConnection | null>(null);
  const H = useRef<Hote<E>>(null as unknown as Hote<E>);
  if (!H.current) H.current = { etat: o.vide(), conns: new Map(), jetons: new Map(), bannis: new Set(), vus: new Map(), rtt: new Map(), absents: new Map(), debit: new Map() };
  const hoteVu = useRef(0);
  const decalages = useRef<number[]>([]);
  /** Vrai quand la room est terminée pour de bon (plus de reconnexion). */
  const termine = useRef(false);
  const reconnexion = useRef<{ debut: number; minuteur: ReturnType<typeof setTimeout> | null } | null>(null);
  const roleRef = useRef(role);
  roleRef.current = role;

  /* ---------- Horloge commune ---------- */

  /** L'heure de l'hôte, vue depuis ce navigateur. */
  const maintenantHote = useCallback(() => (roleRef.current === "invite" ? Date.now() + mediane(decalages.current) : Date.now()), []);

  /* ---------- Côté hôte ---------- */

  const diffuser = useCallback(() => {
    const e = H.current.etat;
    setEtat({ ...e });
    for (const [id, c] of H.current.conns) {
      try {
        if (c.open) c.send({ t: "etat", etat: e, toi: id } satisfies MsgHote<E>);
      } catch {}
    }
  }, []);

  const lire = useCallback(() => H.current.etat, []);
  const ecrire = useCallback(
    (e: E) => {
      H.current.etat = e;
      diffuser();
    },
    [diffuser]
  );

  /** Message de jeu de l'hôte vers un seul invité (ou vers lui-même). */
  const envoyerA = useCallback((id: string, m: unknown) => {
    if (id === HOTE) return opts.current.surJeuInvite?.(m);
    try {
      const c = H.current.conns.get(id);
      if (c?.open) c.send({ t: "jeu", m } satisfies MsgHote<E>);
    } catch {}
  }, []);

  /** Latence aller-retour avec un joueur, en millisecondes (0 pour l'hôte). */
  const latence = useCallback((id: string) => (id === HOTE ? 0 : (H.current.rtt.get(id) ?? 150)), []);

  const majJoueurs = useCallback(
    (f: (j: Joueur[]) => Joueur[]) => {
      const h = H.current;
      h.etat = { ...h.etat, joueurs: f(h.etat.joueurs) };
      diffuser();
      opts.current.surJoueurs?.();
    },
    [diffuser]
  );

  const renommer = useCallback(
    (id: string, voulu: unknown) => {
      const h = H.current;
      const actuel = h.etat.joueurs.find((j) => j.id === id);
      if (!actuel) return;
      const nouveau = nomLibre(voulu, h.etat.joueurs.filter((j) => j.id !== id), actuel.nom);
      if (nouveau !== actuel.nom) majJoueurs((l) => l.map((j) => (j.id === id ? { ...j, nom: nouveau } : j)));
    },
    [majJoueurs]
  );

  /** La connexion d'un invité est coupée : il garde sa place un moment. */
  const marquerAbsent = useCallback(
    (id: string, conn?: DataConnection) => {
      const h = H.current;
      if (conn && h.conns.get(id) !== conn) return; // une connexion plus récente l'a déjà remplacée
      try {
        h.conns.get(id)?.close();
      } catch {}
      h.conns.delete(id);
      if (!h.etat.joueurs.some((j) => j.id === id && j.present)) return;
      h.absents.set(id, Date.now());
      majJoueurs((l) => l.map((j) => (j.id === id ? { ...j, present: false } : j)));
    },
    [majJoueurs]
  );

  /** Retire un joueur pour de bon (départ volontaire, exclusion, absence trop longue). */
  const retirer = useCallback(
    (id: string) => {
      const h = H.current;
      try {
        h.conns.get(id)?.close();
      } catch {}
      h.conns.delete(id);
      h.vus.delete(id);
      h.rtt.delete(id);
      h.absents.delete(id);
      for (const [j, i] of h.jetons) if (i === id) h.jetons.delete(j);
      if (h.etat.joueurs.some((j) => j.id === id)) majJoueurs((l) => l.filter((j) => j.id !== id));
    },
    [majJoueurs]
  );

  const exclure = useCallback(
    (id: string) => {
      const h = H.current;
      if (id === HOTE) return;
      for (const [j, i] of h.jetons) if (i === id) h.bannis.add(j);
      try {
        const c = h.conns.get(id);
        if (c?.open) c.send({ t: "refus", raison: "L'hôte t'a exclu de la room." } satisfies MsgHote<E>);
      } catch {}
      // on laisse au message le temps de partir avant de couper
      setTimeout(() => retirer(id), 150);
    },
    [retirer]
  );

  const accueillir = useCallback(
    (conn: DataConnection) => {
      let id = "";
      const h = H.current;
      conn.on("data", (brut) => {
        const m = brut as MsgInvite;
        if (!m || typeof m !== "object" || typeof (m as { t?: unknown }).t !== "string") return;
        if (!id) {
          if (m.t !== "bonjour") return;
          const jeton = typeof m.jeton === "string" && /^[0-9a-f]{32}$/.test(m.jeton) ? m.jeton : "";
          const refuser = (raison: string) => {
            try {
              conn.send({ t: "refus", raison } satisfies MsgHote<E>);
            } catch {}
            setTimeout(() => conn.close(), 300);
          };
          if (!jeton) return refuser("Connexion refusée.");
          if (h.bannis.has(jeton)) return refuser("L'hôte t'a exclu de cette room.");
          const connu = h.jetons.get(jeton);
          if (connu && h.etat.joueurs.some((j) => j.id === connu)) {
            // il revient : même identité, même pseudo, mêmes points
            id = connu;
            const ancienne = h.conns.get(id);
            h.conns.set(id, conn);
            if (ancienne && ancienne !== conn) ancienne.close();
            h.absents.delete(id);
            h.vus.set(id, Date.now());
            majJoueurs((l) => l.map((j) => (j.id === id ? { ...j, present: true } : j)));
            return;
          }
          if (h.etat.joueurs.length >= opts.current.max) return refuser(`La room est complète (${opts.current.max} joueurs au maximum).`);
          id = "j" + hex(5);
          h.jetons.set(jeton, id);
          h.conns.set(id, conn);
          h.vus.set(id, Date.now());
          const nomInvite = nomLibre(m.nom, h.etat.joueurs, `Joueur ${h.etat.joueurs.length + 1}`);
          majJoueurs((l) => [...l, { id, nom: nomInvite, present: true }]);
          return;
        }
        if (h.conns.get(id) !== conn) return;
        const maintenant = Date.now();
        h.vus.set(id, maintenant);
        // garde-fou contre un invité qui inonderait l'hôte de messages
        const d = h.debit.get(id);
        if (!d || maintenant - d.t > 1000) h.debit.set(id, { n: 1, t: maintenant });
        else if (++d.n > DEBIT_MAX) return;
        if (m.t === "pong") {
          const rtt = maintenant - Number(m.h);
          if (rtt >= 0 && rtt < 10_000) h.rtt.set(id, Math.round((h.rtt.get(id) ?? rtt) * 0.7 + rtt * 0.3));
        } else if (m.t === "depart") retirer(id);
        else if (m.t === "nom") renommer(id, m.nom);
        else if (m.t === "jeu") opts.current.surJeu(id, m.m);
      });
      conn.on("close", () => id && marquerAbsent(id, conn));
      conn.on("error", () => id && marquerAbsent(id, conn));
    },
    [majJoueurs, marquerAbsent, renommer, retirer]
  );

  /* ---------- Commun ---------- */

  const toutArreter = useCallback(() => {
    termine.current = true;
    if (reconnexion.current?.minuteur) clearTimeout(reconnexion.current.minuteur);
    reconnexion.current = null;
    try {
      peer.current?.destroy();
    } catch {}
    peer.current = null;
    versHote.current = null;
    H.current = { etat: opts.current.vide(), conns: new Map(), jetons: new Map(), bannis: new Set(), vus: new Map(), rtt: new Map(), absents: new Map(), debit: new Map() };
    decalages.current = [];
    hoteVu.current = 0;
    ecrireStock(session(), STOCK_ROOM, null);
    setRole("");
    setCode("");
    setMoi("");
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

  /* ---------- Créer une room ---------- */

  const creer = async () => {
    const pseudo = nettoyerPseudo(nom) || "Hôte";
    setErreur("");
    setStatut("connexion");
    ecrireStock(local(), STOCK_PSEUDO, pseudo);
    termine.current = false;
    const { Peer } = await import("peerjs");
    const essayer = (essai: number) => {
      const c = nouveauCode();
      const p = new Peer(opts.current.prefixe + c, optionsPeer());
      peer.current = p;
      p.on("open", () => {
        H.current.etat = { ...opts.current.vide(), joueurs: [{ id: HOTE, nom: pseudo, present: true }] };
        setCode(c);
        setMoi(HOTE);
        setRole("hote");
        setStatut("ok");
        setEtat({ ...H.current.etat });
      });
      p.on("connection", accueillir);
      p.on("error", (err) => {
        const type = (err as { type?: string }).type;
        // code déjà pris par une autre room (très improbable) : on en tire un autre
        if (type === "unavailable-id" && essai < 5) {
          p.destroy();
          essayer(essai + 1);
          return;
        }
        if (peer.current === p && roleRef.current !== "hote") {
          setStatut("");
          setErreur("Impossible de créer la room. Vérifie ta connexion et réessaie.");
        }
      });
      // coupure avec le serveur de mise en relation : les invités déjà là restent connectés, on se réinscrit
      p.on("disconnected", () => {
        if (!termine.current && peer.current === p) {
          try {
            p.reconnect();
          } catch {}
        }
      });
    };
    essayer(0);
  };

  /* ---------- Rejoindre une room ---------- */

  const finInvite = useCallback(
    (raison: string) => {
      toutArreter();
      setErreur(raison);
    },
    [toutArreter]
  );

  /** Ouvre (ou rouvre) la connexion vers l'hôte. */
  const brancher = useCallback(
    async (c: string, pseudo: string) => {
      const { Peer } = await import("peerjs");
      if (termine.current) return;
      let p = peer.current;
      if (!p || p.destroyed) {
        p = new Peer(optionsPeer());
        peer.current = p;
        const cePeer = p;
        p.on("error", (err) => {
          if (peer.current !== cePeer) return;
          const type = (err as { type?: string }).type;
          if (type === "peer-unavailable") {
            // l'hôte n'est plus inscrit : sa page est fermée
            if (reconnexion.current || roleRef.current === "invite") finInvite("L'hôte a quitté la room : la partie est terminée.");
            else finInvite("Aucune room avec ce code. Vérifie-le avec la personne qui t'a invité.");
          } else if (!reconnexion.current && roleRef.current !== "invite") {
            finInvite("La connexion a échoué. Vérifie ta connexion et réessaie.");
          }
        });
        p.on("disconnected", () => {
          if (!termine.current && peer.current === cePeer) {
            try {
              cePeer.reconnect();
            } catch {}
          }
        });
        await new Promise<void>((ok) => {
          if (cePeer.open) return ok();
          cePeer.once("open", () => ok());
          setTimeout(ok, 10_000);
        });
        if (peer.current !== cePeer || termine.current) return;
      }
      const conn = p.connect(opts.current.prefixe + c, { reliable: true, serialization: "json" });
      versHote.current = conn;
      conn.on("open", () => conn.send({ t: "bonjour", nom: pseudo, jeton: monJeton() } satisfies MsgInvite));
      conn.on("data", (brut) => {
        if (versHote.current !== conn) return;
        const m = brut as MsgHote<E>;
        hoteVu.current = Date.now();
        if (m?.t === "etat") {
          if (reconnexion.current?.minuteur) clearTimeout(reconnexion.current.minuteur);
          reconnexion.current = null;
          setEtat(m.etat);
          setMoi(m.toi);
          setCode(c);
          setRole("invite");
          setStatut("ok");
          setErreur("");
          ecrireStock(session(), STOCK_ROOM, c);
        } else if (m?.t === "ping") {
          try {
            conn.send({ t: "pong", h: m.h } satisfies MsgInvite);
          } catch {}
          // décalage d'horloge : heure de l'hôte au moment de la réception, moins notre heure
          const d = Number(m.h) + Number(m.rtt) / 2 - Date.now();
          if (Number.isFinite(d)) decalages.current = [...decalages.current.slice(-8), d];
        } else if (m?.t === "jeu") opts.current.surJeuInvite?.(m.m);
        else if (m?.t === "refus") finInvite(m.raison);
        else if (m?.t === "fin") finInvite(m.raison);
      });
      conn.on("close", () => {
        if (versHote.current === conn && !termine.current) relancer(c, pseudo);
      });
      conn.on("error", () => {
        if (versHote.current === conn && !termine.current) relancer(c, pseudo);
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [finInvite]
  );

  /** Connexion perdue : on réessaie régulièrement, sans rien demander au joueur. */
  const relancer = useCallback(
    (c: string, pseudo: string) => {
      if (termine.current) return;
      const r = reconnexion.current ?? { debut: Date.now(), minuteur: null };
      reconnexion.current = r;
      if (r.minuteur) clearTimeout(r.minuteur);
      setStatut("reconnexion");
      try {
        versHote.current?.close();
      } catch {}
      versHote.current = null;
      if (Date.now() - r.debut > RECONNEXION_MAX) return finInvite("Connexion perdue avec la room. Vérifie ton réseau, puis rejoins-la de nouveau.");
      r.minuteur = setTimeout(() => {
        if (reconnexion.current !== r || termine.current) return;
        brancher(c, pseudo);
        // si rien n'arrive, on réessaie
        r.minuteur = setTimeout(() => reconnexion.current === r && relancer(c, pseudo), 4000);
      }, 1200);
    },
    [brancher, finInvite]
  );

  const rejoindre = async (codeVoulu?: string) => {
    const c = (codeVoulu ?? codeSaisi).trim().toUpperCase();
    if (!codeValide(c)) return setErreur(`Le code fait ${LONGUEUR_CODE} caractères (lettres et chiffres).`);
    const pseudo = nettoyerPseudo(nom) || nettoyerPseudo(lireStock(local(), STOCK_PSEUDO)) || "Invité";
    setErreur("");
    setStatut("connexion");
    ecrireStock(local(), STOCK_PSEUDO, pseudo);
    termine.current = false;
    reconnexion.current = null;
    const garde = setTimeout(() => {
      if (roleRef.current !== "invite" && !termine.current && !reconnexion.current) finInvite("Pas de réponse de la room. Vérifie le code, ou change de réseau (certains bloquent ce type de connexion).");
    }, 15_000);
    await brancher(c, pseudo);
    void garde;
  };

  // Au chargement : pseudo retenu, code du lien d'invitation, retour automatique après un rafraîchissement
  const demarre = useRef(false);
  useEffect(() => {
    if (demarre.current) return;
    demarre.current = true;
    setNom(lireStock(local(), STOCK_PSEUDO));
    const fermee = lireStock(session(), STOCK_FERMEE);
    if (fermee) {
      ecrireStock(session(), STOCK_FERMEE, null);
      setErreur(`Ta room ${fermee} a été fermée quand tu as quitté ou rechargé la page.`);
    }
    const duLien = (new URLSearchParams(window.location.search).get("code") ?? "").toUpperCase().slice(0, LONGUEUR_CODE);
    if (duLien) setCodeSaisi(duLien);
    const enCours = lireStock(session(), STOCK_ROOM);
    if (codeValide(enCours) && !fermee) {
      setCodeSaisi(enCours);
      void rejoindre(enCours);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- Signes de vie ---------- */

  useEffect(() => {
    if (!role) return;
    const tic = setInterval(() => {
      const maintenant = Date.now();
      if (role === "hote") {
        const h = H.current;
        for (const [id, c] of h.conns) {
          try {
            if (c.open) c.send({ t: "ping", h: maintenant, rtt: h.rtt.get(id) ?? 150 } satisfies MsgHote<E>);
          } catch {}
          if (maintenant - (h.vus.get(id) ?? maintenant) > SILENCE_MAX) marquerAbsent(id);
        }
        for (const [id, depuis] of h.absents) if (maintenant - depuis > PLACE_GARDEE) retirer(id);
      } else if (statut === "ok" && hoteVu.current && maintenant - hoteVu.current > SILENCE_MAX) {
        // plus de nouvelles de l'hôte : on tente de revenir (s'il est parti, la reconnexion le dira)
        relancer(code, nettoyerPseudo(nom) || "Invité");
      }
    }, SIGNE_DE_VIE);
    return () => clearInterval(tic);
  }, [role, statut, code, nom, marquerAbsent, retirer, relancer]);

  // Retour sur l'onglet (téléphone déverrouillé) : si la connexion a sauté, on la relance tout de suite
  useEffect(() => {
    if (role !== "invite") return;
    const auRetour = () => {
      if (document.visibilityState === "visible" && !versHote.current?.open && !termine.current) relancer(code, nettoyerPseudo(nom) || "Invité");
    };
    document.addEventListener("visibilitychange", auRetour);
    return () => document.removeEventListener("visibilitychange", auRetour);
  }, [role, code, nom, relancer]);

  // L'hôte ferme ou recharge sa page : on prévient tout le monde que la room s'arrête
  useEffect(() => {
    if (role !== "hote") return;
    const fermer = () => {
      for (const c of H.current.conns.values()) {
        try {
          if (c.open) c.send({ t: "fin", raison: "L'hôte a quitté la room : la partie est terminée." } satisfies MsgHote<E>);
        } catch {}
      }
      ecrireStock(session(), STOCK_FERMEE, code);
    };
    window.addEventListener("pagehide", fermer);
    return () => window.removeEventListener("pagehide", fermer);
  }, [role, code]);

  /* ---------- Actions ---------- */

  /** Envoie un message de jeu à l'hôte (l'hôte se l'envoie à lui-même). */
  const envoyer = useCallback(
    (m: unknown) => {
      if (roleRef.current === "hote") opts.current.surJeu(HOTE, m);
      else
        try {
          if (versHote.current?.open) versHote.current.send({ t: "jeu", m } satisfies MsgInvite);
        } catch {}
    },
    []
  );

  const changerMonNom = (voulu: string) => {
    const v = nettoyerPseudo(voulu);
    if (!v) return;
    setNom(v);
    ecrireStock(local(), STOCK_PSEUDO, v);
    if (role === "hote") renommer(HOTE, v);
    else
      try {
        versHote.current?.send({ t: "nom", nom: v } satisfies MsgInvite);
      } catch {}
  };

  /** Quitter volontairement. L'invité prévient l'hôte ; l'hôte ferme la room pour tous. */
  const partir = () => {
    if (role === "hote") {
      for (const c of H.current.conns.values()) {
        try {
          if (c.open) c.send({ t: "fin", raison: "L'hôte a fermé la room." } satisfies MsgHote<E>);
        } catch {}
      }
    } else {
      try {
        versHote.current?.send({ t: "depart" } satisfies MsgInvite);
      } catch {}
    }
    termine.current = true;
    setTimeout(toutArreter, 200);
  };

  const lien = typeof window !== "undefined" && code ? `${window.location.origin}/?code=${code}` : "";

  return {
    role,
    estHote: role === "hote",
    code,
    moi,
    etat,
    statut,
    erreur,
    setErreur,
    nom,
    setNom,
    codeSaisi,
    setCodeSaisi,
    creer,
    rejoindre,
    partir,
    envoyer,
    envoyerA,
    lire,
    ecrire,
    exclure,
    latence,
    maintenantHote,
    changerMonNom,
    lien,
  };
}

export type Salon<E extends { joueurs: Joueur[] }> = ReturnType<typeof useSalon<E>>;
