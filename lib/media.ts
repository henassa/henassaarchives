/** Extrait l'identifiant d'une vidéo YouTube, ou null. */
export function youtubeId(url?: string): string | null {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|music\.youtube\.com\/watch\?v=)([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : null;
}

export function isAudioFile(url?: string): boolean {
  return !!url && /\.(mp3|ogg|wav|m4a|aac|flac)(\?.*)?$/i.test(url);
}

/** Vrai si le lien peut être lu dans le lecteur du site (YouTube ou fichier audio). */
export function isPlayable(url?: string): boolean {
  return !!youtubeId(url) || isAudioFile(url);
}

/**
 * Ignore les liens média pas encore remplis
 * (ex. "https://www.youtube.com/watch?v=" ou "https://...").
 */
export function mediaRempli(url?: string): string | undefined {
  const u = url?.trim();
  if (!u) return undefined;
  if (u.includes("...") || /[?&]v=$/.test(u) || /^https?:\/\/?$/.test(u)) return undefined;
  if (/youtube\.com|youtu\.be/.test(u) && !youtubeId(u)) return undefined;
  return u;
}

/**
 * Un moment dans une vidéo : « 1:12 », « 01:02:03 », « 72 » ou 72 → nombre de secondes.
 * Renvoie undefined si rien n'est donné ou si ce n'est pas lisible.
 */
export function secondes(t?: string | number): number | undefined {
  if (t === undefined || t === null || t === "") return undefined;
  if (typeof t === "number") return Number.isFinite(t) && t >= 0 ? Math.floor(t) : undefined;
  const parts = String(t).trim().split(":").map((x) => Number(x));
  if (!parts.length || parts.some((x) => !Number.isFinite(x) || x < 0)) return undefined;
  return Math.floor(parts.reduce((total, x) => total * 60 + x, 0));
}
