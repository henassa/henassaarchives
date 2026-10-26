"use client";

/*
 * Un seul lecteur audio pour toute la partie.
 *
 * Sur iPhone, un lecteur ne peut jouer du son que s'il a d'abord été lancé
 * par un geste de l'utilisateur. Le bouton « Je suis prêt » le lance une fois
 * (en silence) : ensuite, le jeu peut démarrer chaque extrait tout seul.
 *
 * Les extraits sont téléchargés en avance (dans la mémoire du navigateur)
 * pour que le son parte pile au moment du décompte, même en 4G.
 */

let lecteur: HTMLAudioElement | null = null;
const memoire = new Map<string, Promise<string>>(); // adresse de l'extrait → adresse locale (blob)
let debloque = false;
let volume = 1;

/** Un quart de seconde de silence (WAV), pour débloquer le son. */
const SILENCE =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAAAA";

function el() {
  if (!lecteur) {
    lireVolume();
    lecteur = new Audio();
    lecteur.preload = "auto";
    lecteur.setAttribute("playsinline", "");
    lecteur.crossOrigin = null;
  }
  return lecteur;
}

export const sonDebloque = () => debloque;

/** À appeler pendant un clic : rend le son possible pour la suite de la partie. */
export async function debloquerSon() {
  const a = el();
  try {
    a.src = SILENCE;
    a.volume = 0;
    await a.play();
    a.pause();
    debloque = true;
  } catch {
    debloque = false;
  }
  a.volume = volume;
  return debloque;
}

const CLE_VOLUME = "henassa-blindtest-volume";
let volumeLu = false;

/** Le volume choisi la dernière fois sur cet appareil (1 par défaut). */
export function lireVolume() {
  if (!volumeLu) {
    volumeLu = true;
    try {
      const v = Number(localStorage.getItem(CLE_VOLUME));
      if (localStorage.getItem(CLE_VOLUME) !== null && Number.isFinite(v)) volume = Math.min(1, Math.max(0, v));
    } catch {}
  }
  return volume;
}

export function reglerVolume(v: number) {
  volume = Math.min(1, Math.max(0, v));
  volumeLu = true;
  if (lecteur) lecteur.volume = volume;
  try {
    localStorage.setItem(CLE_VOLUME, String(volume));
  } catch {}
}

/**
 * Télécharge l'extrait en avance. Si le serveur de l'extrait refuse
 * (certains navigateurs ou serveurs l'empêchent), on retombe sur le préchargement classique.
 */
export function telecharger(url: string) {
  if (!url) return Promise.resolve("");
  let p = memoire.get(url);
  if (!p) {
    p = fetch(url, { signal: AbortSignal.timeout(20_000) })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((b) => URL.createObjectURL(b))
      .catch(() => url);
    memoire.set(url, p);
    // on ne garde que les derniers extraits en mémoire
    if (memoire.size > 4) {
      const [ancien, promesse] = memoire.entries().next().value as [string, Promise<string>];
      memoire.delete(ancien);
      void promesse.then((u) => u.startsWith("blob:") && URL.revokeObjectURL(u));
    }
  }
  return p;
}

/** Met l'extrait dans le lecteur et attend qu'il soit prêt à jouer. */
export async function preparer(url: string, delaiMax = 12_000) {
  const a = el();
  arreter();
  const source = await telecharger(url);
  if (!source) return false;
  return new Promise<boolean>((ok) => {
    let fini = false;
    const finir = (v: boolean) => {
      if (fini) return;
      fini = true;
      a.removeEventListener("canplaythrough", oui);
      a.removeEventListener("canplay", oui);
      a.removeEventListener("error", non);
      clearTimeout(minuteur);
      ok(v);
    };
    const oui = () => finir(true);
    const non = () => finir(false);
    const minuteur = setTimeout(() => finir(a.readyState >= 2), delaiMax);
    a.addEventListener("canplaythrough", oui);
    a.addEventListener("canplay", oui);
    a.addEventListener("error", non);
    a.src = source;
    a.volume = volume;
    a.load();
  });
}

let minuteurLecture: ReturnType<typeof setTimeout> | null = null;

/**
 * Lance le son à l'heure prévue (heure locale, en millisecondes).
 * Si on est en retard (chargement lent), on démarre directement au bon endroit de l'extrait.
 * Renvoie false si le navigateur a bloqué le son (il faudra un clic).
 */
export function lancerA(heureLocale: number): Promise<boolean> {
  const a = el();
  if (minuteurLecture) clearTimeout(minuteurLecture);
  return new Promise((ok) => {
    const partir = async () => {
      const retard = Math.max(0, Date.now() - heureLocale) / 1000;
      try {
        if (retard > 0.25 && Number.isFinite(a.duration) && retard < a.duration) a.currentTime = retard;
        else if (retard <= 0.25) a.currentTime = 0;
        await a.play();
        debloque = true;
        ok(true);
      } catch {
        ok(false);
      }
    };
    const attente = heureLocale - Date.now();
    if (attente > 0) minuteurLecture = setTimeout(partir, attente);
    else void partir();
  });
}

export function arreter() {
  if (minuteurLecture) clearTimeout(minuteurLecture);
  minuteurLecture = null;
  if (lecteur && !lecteur.paused) lecteur.pause();
}
