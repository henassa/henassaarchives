import { normaliser } from "./texte";
import type { Titre } from "./types";

/*
 * Le panier de l'hôte : la liste des morceaux parmi lesquels le jeu tire les manches.
 * On n'y garde que l'identifiant Deezer et de quoi l'afficher (titre, artiste, pochette).
 * Le lien de l'extrait, lui, est demandé juste avant chaque manche.
 */

export type ElementPanier = { id: string; titre: string; artiste: string; pochette: string };
export type PanierEnregistre = { nom: string; date: number; titres: ElementPanier[] };

export const PANIER_MAX = 500;
const STOCK_COURANT = "blindtest-panier";
const STOCK_ENREGISTRES = "blindtest-paniers";
const ENREGISTRES_MAX = 30;

/** Deux versions du même morceau (single et album, remaster…) comptent comme un doublon. */
const cle = (t: { titre: string; artiste: string }) => `${normaliser(t.titre)}|${normaliser(t.artiste)}`;

export function ajouter(panier: ElementPanier[], titres: Titre[]) {
  const ids = new Set(panier.map((t) => t.id));
  const cles = new Set(panier.map(cle));
  const nouveaux: ElementPanier[] = [];
  let doublons = 0;
  let sansExtrait = 0;
  let plein = 0;
  for (const t of titres) {
    if (!t.extrait) {
      sansExtrait++;
      continue;
    }
    const k = cle(t);
    if (ids.has(t.id) || cles.has(k)) {
      doublons++;
      continue;
    }
    if (panier.length + nouveaux.length >= PANIER_MAX) {
      plein++;
      continue;
    }
    ids.add(t.id);
    cles.add(k);
    nouveaux.push({ id: t.id, titre: t.titre, artiste: t.artiste, pochette: t.pochette });
  }
  return { panier: [...panier, ...nouveaux], ajoutes: nouveaux.length, doublons, sansExtrait, plein };
}

/** Phrase de compte rendu après un ajout. */
export function bilanAjout(r: ReturnType<typeof ajouter>) {
  const morceaux = (n: number) => `${n} morceau${n > 1 ? "x" : ""}`;
  const parts = [r.ajoutes ? `${morceaux(r.ajoutes)} ajouté${r.ajoutes > 1 ? "s" : ""}` : "Rien de nouveau"];
  if (r.doublons) parts.push(`${r.doublons} déjà dans le panier`);
  if (r.sansExtrait) parts.push(`${r.sansExtrait} sans extrait écarté${r.sansExtrait > 1 ? "s" : ""}`);
  if (r.plein) parts.push(`panier plein (${PANIER_MAX} max)`);
  return parts.join(" · ");
}

/** Mélange équitable (Fisher-Yates, hasard du navigateur). */
export function melanger<T>(liste: T[]) {
  const l = [...liste];
  const hasard = new Uint32Array(l.length);
  crypto.getRandomValues(hasard);
  for (let i = l.length - 1; i > 0; i--) {
    const j = hasard[i] % (i + 1);
    [l[i], l[j]] = [l[j], l[i]];
  }
  return l;
}

/* ---------- Enregistrement dans le navigateur ---------- */

export function valide(l: unknown): ElementPanier[] {
  if (!Array.isArray(l)) return [];
  return l
    .filter((t) => t && typeof t.id === "string" && /^\d{1,15}$/.test(t.id) && typeof t.titre === "string" && typeof t.artiste === "string")
    .slice(0, PANIER_MAX)
    .map((t) => ({ id: t.id, titre: t.titre.slice(0, 200), artiste: t.artiste.slice(0, 200), pochette: typeof t.pochette === "string" && t.pochette.startsWith("https://") ? t.pochette : "" }));
}

function lire(cle: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(cle) ?? "null");
  } catch {
    return null;
  }
}

function ecrire(cle: string, v: unknown) {
  try {
    localStorage.setItem(cle, JSON.stringify(v));
    return true;
  } catch {
    return false;
  }
}

export const lirePanierCourant = () => valide(lire(STOCK_COURANT));
export const garderPanierCourant = (p: ElementPanier[]) => ecrire(STOCK_COURANT, p);

export function lireEnregistres(): PanierEnregistre[] {
  const l = lire(STOCK_ENREGISTRES);
  if (!Array.isArray(l)) return [];
  return l
    .filter((p) => p && typeof p.nom === "string")
    .map((p) => ({ nom: p.nom.slice(0, 40), date: Number(p.date) || 0, titres: valide(p.titres) }))
    .slice(0, ENREGISTRES_MAX);
}

export function enregistrer(nom: string, titres: ElementPanier[]) {
  const propre = nom.trim().slice(0, 40) || "Mon panier";
  const autres = lireEnregistres().filter((p) => p.nom.toLowerCase() !== propre.toLowerCase());
  return ecrire(STOCK_ENREGISTRES, [{ nom: propre, date: Date.now(), titres }, ...autres].slice(0, ENREGISTRES_MAX));
}

export function supprimerEnregistre(nom: string) {
  ecrire(
    STOCK_ENREGISTRES,
    lireEnregistres().filter((p) => p.nom !== nom)
  );
}
