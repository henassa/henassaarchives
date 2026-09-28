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
