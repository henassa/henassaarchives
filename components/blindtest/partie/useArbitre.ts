"use client";

import { useCallback, useEffect, useRef } from "react";
import { HOTE, type Salon } from "@/components/blindtest/salon/useSalon";
import { relais, ErreurRelais } from "@/components/blindtest/lib/api";
import { melanger, type ElementPanier } from "@/components/blindtest/lib/panier";
import { nettoyer, REPONSE_MAX } from "@/components/blindtest/lib/texte";
import type { Extrait } from "@/components/blindtest/lib/types";
import {
  ATTENTE_CHARGEMENT,
  DECOMPTE,
  DUREE_REVELATION,
  NB_CHOIX,
  complet,
  demandeArtiste,
  demandeTitre,
  faireChoix,
  gainsManche,
  masquer,
  propositionsPossibles,
  verifier,
  type EtatJeu,
  type Frappe,
  type Reglages,
  type Verdict,
} from "@/components/blindtest/lib/partie";

/*
 * L'arbitre : la partie telle que la mène le navigateur de l'hôte.
 * C'est lui qui tire les morceaux, demande les extraits, fixe l'heure de départ du son,
 * reçoit les réponses, les vérifie et compte les points.
 * Le titre et l'artiste ne quittent jamais ce navigateur avant la révélation.
 */

const REPONSES_MAX_PAR_MANCHE = 40;

type Secret = {
  file: ElementPanier[];
  courant: Extrait | null;
  prochain: Promise<Extrait | null> | null;
  prochainUrl: string;
  essais: Map<string, number>;
  generation: number;
  minuteur: ReturnType<typeof setTimeout> | null;
  /** QCM : l'index de la bonne proposition, et le choix de chacun (gardés ici jusqu'à la révélation). */
  bonne: number;
  choisis: Map<string, number>;
  /** Frappes en attente d'envoi (on les regroupe pour ne pas inonder le réseau). */
  frappes: Record<string, Frappe>;
  minuteurFrappes: ReturnType<typeof setTimeout> | null;
};
/** Les frappes des joueurs sont renvoyées à tout le monde au plus à ce rythme (ms). */
const RYTHME_FRAPPES = 200;

export function useArbitre(salon: Salon<EtatJeu>, panier: ElementPanier[]) {
  const s = useRef<Secret>({ file: [], courant: null, prochain: null, prochainUrl: "", essais: new Map(), generation: 0, minuteur: null, bonne: -1, choisis: new Map(), frappes: {}, minuteurFrappes: null });
  const salonRef = useRef(salon);
  salonRef.current = salon;
  const panierRef = useRef(panier);
  panierRef.current = panier;

  const lire = () => salonRef.current.lire();
  const maj = (f: (e: EtatJeu) => EtatJeu) => salonRef.current.ecrire(f(salonRef.current.lire()));
  const programmer = (ms: number, f: () => void) => {
    if (s.current.minuteur) clearTimeout(s.current.minuteur);
    s.current.minuteur = setTimeout(f, Math.max(0, ms));
  };
  const presents = (e: EtatJeu) => e.joueurs.filter((j) => j.present).map((j) => j.id);
  /** Garde la frappe d'un joueur, et la renvoie à tout le monde avec les autres, au plus toutes les RYTHME_FRAPPES ms. */
  const pousserFrappe = (id: string, f: Frappe) => {
    s.current.frappes[id] = f;
    if (s.current.minuteurFrappes) return;
    s.current.minuteurFrappes = setTimeout(() => {
      s.current.minuteurFrappes = null;
      const lot = s.current.frappes;
      s.current.frappes = {};
      if (!Object.keys(lot).length || lire().phase !== "ecoute") return;
      maj((a) => ({ ...a, manche: a.manche && { ...a.manche, frappes: { ...a.manche.frappes, ...lot } } }));
    }, RYTHME_FRAPPES);
  };

  /** Prend le prochain morceau jouable dans la file (ceux sans extrait sont sautés). */
  const reserver = useCallback(async (): Promise<Extrait | null> => {
    const gen = s.current.generation;
    let echecsReseau = 0;
    while (s.current.file.length && gen === s.current.generation) {
      const candidat = s.current.file[0];
      try {
        const x = await relais("extrait", { id: candidat.id });
        if (gen !== s.current.generation) return null;
        s.current.file.shift();
        return x;
      } catch (e) {
        if (e instanceof ErreurRelais && (e.statut === 404 || e.statut === 400)) {
          s.current.file.shift(); // pas d'extrait : on passe au suivant
          continue;
        }
        if (++echecsReseau >= 3) {
          s.current.file.shift();
          echecsReseau = 0;
          continue;
        }
        await new Promise((r) => setTimeout(r, 1500 * echecsReseau));
      }
    }
    return null;
  }, []);

  const reserverSuivant = useCallback(() => {
    s.current.prochainUrl = "";
    const gen = s.current.generation;
    const p = reserver();
    s.current.prochain = p;
    void p.then((x) => {
      if (gen !== s.current.generation || s.current.prochain !== p) return;
      s.current.prochainUrl = x?.url ?? "";
      // pendant la révélation, on donne l'adresse du prochain extrait pour que chacun le télécharge
      if (x && lire().phase === "revelation") maj((e) => ({ ...e, prochain: x.url }));
    });
  }, [reserver]);

  const finir = useCallback((avis = "") => {
    if (s.current.minuteur) clearTimeout(s.current.minuteur);
    s.current.prochain = null;
    maj((e) => ({ ...e, phase: "fin", prochain: "", avis }));
  }, []);

  const reveler = useCallback(() => {
    const e = lire();
    const m = e.manche;
    const x = s.current.courant;
    if (e.phase !== "ecoute" || !m || !x) return;
    const gains = gainsManche(m.trouves, e.reglages.duree * 1000);
    const scores = { ...e.scores };
    for (const [id, g] of Object.entries(gains)) scores[id] = (scores[id] ?? 0) + g;
    if (s.current.minuteurFrappes) clearTimeout(s.current.minuteurFrappes);
    s.current.minuteurFrappes = null;
    s.current.frappes = {};
    const qcm = e.reglages.mode === "qcm" && m.choix;
    const revele = {
      titre: x.titre.titre,
      artiste: x.titre.artistes.join(", "),
      album: x.titre.album,
      pochette: x.grandePochette,
      lien: x.lien,
      source: x.source,
    };
    const suite = Date.now() + DUREE_REVELATION;
    maj((a) => ({
      ...a,
      phase: "revelation",
      scores,
      prochain: s.current.prochainUrl,
      historique: [...a.historique, { ...revele, n: m.n }],
      manche: { ...m, revele, gains, suite, frappes: {}, ...(qcm ? { bonne: s.current.bonne, choisis: Object.fromEntries(s.current.choisis) } : {}) },
    }));
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    programmer(DUREE_REVELATION, () => suivante());
  }, []);

  const demarrer = useCallback(() => {
    const e = lire();
    if (e.phase !== "preparation" || !e.manche || !e.manche.extrait || e.manche.depart) return;
    const depart = Date.now() + DECOMPTE;
    const fin = depart + e.reglages.duree * 1000;
    maj((a) => ({ ...a, phase: "ecoute", manche: a.manche && { ...a.manche, depart, fin } }));
    // une petite marge pour les réponses envoyées à la dernière seconde
    programmer(fin - Date.now() + 400, reveler);
  }, [reveler]);

  const preparerManche = useCallback(
    async (n: number, avis = "") => {
      const gen = s.current.generation;
      const total = lire().manche?.total ?? 0;
      maj((e) => ({
        ...e,
        phase: "preparation",
        prochain: "",
        avis,
        manche: { n, total: e.manche?.total ?? total, extrait: "", depart: 0, fin: 0, charges: [], trouves: {} },
      }));
      const attente = s.current.prochain ?? reserver();
      s.current.prochain = null;
      const x = await attente;
      if (gen !== s.current.generation) return;
      if (!x) {
        if (n === 1) {
          maj((e) => ({ ...e, phase: "lobby", manche: null, avis: "Aucun morceau du panier n'a d'extrait disponible. Ajoute d'autres morceaux." }));
        } else finir("Plus de morceaux avec un extrait disponible : la partie s'arrête ici.");
        return;
      }
      s.current.courant = x;
      s.current.essais = new Map();
      s.current.choisis = new Map();
      s.current.frappes = {};
      // QCM : la bonne réponse et trois autres morceaux du panier
      let choix: string[] | undefined;
      s.current.bonne = -1;
      if (lire().reglages.mode === "qcm") {
        const q = faireChoix({ titre: x.titre.titre, artiste: x.titre.artiste }, panierRef.current, lire().reglages.cible);
        choix = q.choix;
        s.current.bonne = q.bonne;
      }
      maj((e) => ({ ...e, manche: e.manche && { ...e.manche, extrait: x.url, ...(choix ? { choix, ontChoisi: [] } : {}) } }));
      if (n < (lire().manche?.total ?? 0)) reserverSuivant();
      programmer(ATTENTE_CHARGEMENT, demarrer);
    },
    [reserver, reserverSuivant, demarrer, finir]
  );

  const suivante = useCallback(() => {
    const e = lire();
    if (e.phase !== "revelation" || !e.manche) return;
    if (e.manche.n >= e.manche.total) return finir();
    void preparerManche(e.manche.n + 1);
  }, [finir, preparerManche]);

  /* ---------- Actions de l'hôte ---------- */

  const lancer = useCallback(() => {
    const e = lire();
    if (!panier.length || (e.phase !== "lobby" && e.phase !== "fin")) return;
    // QCM avec trop peu de morceaux différents : on joue en réponses tapées
    if (e.reglages.mode === "qcm" && propositionsPossibles(panier, e.reglages.cible) < NB_CHOIX) {
      maj((a) => ({ ...a, avis: `Le QCM demande au moins ${NB_CHOIX} morceaux différents dans le panier.` }));
      return;
    }
    s.current.generation++;
    s.current.file = melanger(panier);
    s.current.prochain = null;
    s.current.prochainUrl = "";
    const total = Math.min(e.reglages.manches, panier.length);
    maj((a) => ({
      ...a,
      scores: Object.fromEntries(a.joueurs.map((j) => [j.id, 0])),
      historique: [],
      avis: "",
      manche: { n: 1, total, extrait: "", depart: 0, fin: 0, charges: [], trouves: {} },
    }));
    void preparerManche(1);
  }, [panier, preparerManche]);

  /** Retour à la salle d'attente (fin d'une partie, ou partie arrêtée en cours). */
  const retourSalle = useCallback(() => {
    s.current.generation++;
    if (s.current.minuteur) clearTimeout(s.current.minuteur);
    s.current.prochain = null;
    s.current.courant = null;
    maj((e) => ({ ...e, phase: "lobby", manche: null, prochain: "", avis: "" }));
  }, []);

  const regler = useCallback((r: Partial<Reglages>) => {
    if (lire().phase !== "lobby") return;
    maj((e) => ({ ...e, reglages: { ...e.reglages, ...r } }));
  }, []);

  /* ---------- Messages des joueurs ---------- */

  const verifierChargement = useCallback(() => {
    const e = lire();
    if (e.phase !== "preparation" || !e.manche?.extrait) return;
    if (presents(e).every((id) => e.manche!.charges.includes(id))) demarrer();
  }, [demarrer]);

  const recevoir = useCallback(
    (id: string, brut: unknown) => {
      const m = brut as { t?: unknown; n?: unknown; ok?: unknown; texte?: unknown; i?: unknown };
      if (!m || typeof m !== "object") return;
      const e = lire();
      if (m.t === "pret") {
        if (!e.prets.includes(id)) maj((a) => ({ ...a, prets: [...a.prets, id] }));
        return;
      }
      const man = e.manche;
      if (!man || m.n !== man.n) return;

      if (m.t === "charge") {
        if (e.phase !== "preparation" || !man.extrait) return;
        if (m.ok !== true) {
          // l'hôte n'arrive pas à charger cet extrait : on passe au morceau suivant
          if (id === HOTE) {
            s.current.courant = null;
            void preparerManche(man.n, "Extrait indisponible : on passe au morceau suivant.");
          }
          return;
        }
        if (!man.charges.includes(id)) maj((a) => ({ ...a, manche: a.manche && { ...a.manche, charges: [...a.manche.charges, id] } }));
        verifierChargement();
        return;
      }

      // Ce qu'un joueur est en train de taper : renvoyé aux autres, masqué s'il approche de la réponse
      if (m.t === "frappe") {
        const x = s.current.courant;
        if (e.phase !== "ecoute" || !x || !e.reglages.voir || e.reglages.mode !== "tape" || complet(man.trouves[id], e.reglages.cible)) return;
        pousserFrappe(id, masquer(nettoyer(m.texte, REPONSE_MAX), x.titre));
        return;
      }

      // QCM : une seule réponse par manche
      if (m.t === "choix") {
        const x = s.current.courant;
        const maintenant = Date.now();
        const i = Number(m.i);
        if (e.phase !== "ecoute" || !x || !man.choix || maintenant > man.fin + 400 || maintenant < man.depart - 200) return;
        if (!Number.isInteger(i) || i < 0 || i >= man.choix.length || s.current.choisis.has(id)) return;
        s.current.choisis.set(id, i);
        const bon = i === s.current.bonne;
        const ms = Math.min(e.reglages.duree * 1000, Math.max(0, maintenant - salonRef.current.latence(id) / 2 - man.depart));
        const cible = e.reglages.cible;
        const verdict: Verdict = { t: "verdict", n: man.n, titre: bon && demandeTitre(cible), artiste: bon && demandeArtiste(cible), deja: false, qcm: true };
        salonRef.current.envoyerA(id, verdict);
        const trouves = bon ? { ...man.trouves, [id]: { ...(demandeTitre(cible) ? { titre: ms } : {}), ...(demandeArtiste(cible) ? { artiste: ms } : {}) } } : man.trouves;
        const ontChoisi = [...(man.ontChoisi ?? []), id];
        maj((a) => ({ ...a, manche: a.manche && { ...a.manche, trouves, ontChoisi } }));
        if (presents(lire()).every((j) => ontChoisi.includes(j))) programmer(900, reveler);
        return;
      }

      if (m.t === "reponse") {
        const x = s.current.courant;
        const maintenant = Date.now();
        if (e.phase !== "ecoute" || !x || maintenant > man.fin + 400 || maintenant < man.depart - 200) return;
        const nb = (s.current.essais.get(id) ?? 0) + 1;
        s.current.essais.set(id, nb);
        if (nb > REPONSES_MAX_PAR_MANCHE) return;
        const texte = nettoyer(m.texte, REPONSE_MAX);
        if (!texte) return;
        const deja = man.trouves[id] ?? {};
        const v = verifier(texte, x.titre, e.reglages.cible, deja);
        // temps de réponse vu par l'hôte, moins le trajet du message
        const ms = Math.min(e.reglages.duree * 1000, Math.max(0, maintenant - salonRef.current.latence(id) / 2 - man.depart));
        const verdict: Verdict = { t: "verdict", n: man.n, titre: v.titre, artiste: v.artiste, deja: complet(deja, e.reglages.cible) };
        salonRef.current.envoyerA(id, verdict);
        // la réponse ratée s'affiche chez les autres (masquée si elle approche de la réponse)
        if (!v.titre && !v.artiste) {
          if (e.reglages.voir) {
            pousserFrappe(id, { ...masquer(texte, x.titre), r: true });
          }
          return;
        }
        const nouveau = { ...deja, ...(v.titre ? { titre: ms } : {}), ...(v.artiste ? { artiste: ms } : {}) };
        const trouves = { ...man.trouves, [id]: nouveau };
        // il a tout trouvé : on efface ce qu'il tapait
        const fini = complet(nouveau, e.reglages.cible);
        if (fini) delete s.current.frappes[id];
        maj((a) => ({ ...a, manche: a.manche && { ...a.manche, trouves, ...(fini && a.manche.frappes?.[id] ? { frappes: { ...a.manche.frappes, [id]: { t: "" } } } : {}) } }));
        // tout le monde a tout trouvé : on révèle sans attendre la fin du temps
        const apres = lire();
        if (presents(apres).every((j) => complet(trouves[j], apres.reglages.cible))) programmer(900, reveler);
      }
    },
    [preparerManche, reveler, verifierChargement]
  );

  // Un joueur part ou revient pendant le chargement : peut-être que tout le monde est prêt
  const surJoueurs = useCallback(() => verifierChargement(), [verifierChargement]);

  // Le nombre de morceaux du panier est affiché aux invités (pas leur contenu)
  useEffect(() => {
    if (!salon.estHote) return;
    if (lire().nbPanier !== panier.length) maj((e) => ({ ...e, nbPanier: panier.length }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salon.estHote, panier.length, salon.etat.joueurs.length]);

  useEffect(
    () => () => {
      if (s.current.minuteur) clearTimeout(s.current.minuteur);
      if (s.current.minuteurFrappes) clearTimeout(s.current.minuteurFrappes);
    },
    []
  );

  return { lancer, retourSalle, regler, suivante, recevoir, surJoueurs };
}
