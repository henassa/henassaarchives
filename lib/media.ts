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
