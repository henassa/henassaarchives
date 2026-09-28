import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

// Une seule playlist, celle du mois, dans content/playlist.mdx.
const PLAYLIST_FILE = path.join(process.cwd(), "content", "playlist.mdx");

export type Morceau = {
  titre: string;
  artiste?: string;
  url?: string;
};

export const PLATEFORMES = [
  { key: "youtubeMusic", label: "YouTube Music" },
  { key: "spotify", label: "Spotify" },
  { key: "tidal", label: "Tidal" },
  { key: "deezer", label: "Deezer" },
  { key: "appleMusic", label: "Apple Music" },
  { key: "soundcloud", label: "SoundCloud" },
] as const;

export type PlateformeKey = (typeof PLATEFORMES)[number]["key"];

export type Playlist = {
  /** « Septembre 2026 » */
  mois: string;
  display: string;
  echo: string;
  dek?: string;
  /** Date de la dernière mise à jour (AAAA-MM-JJ). */
  maj?: string;
  morceaux: Morceau[];
  liens: { key: PlateformeKey; label: string; url: string }[];
  content: string;
};

export function getPlaylist(): Playlist | null {
  if (!fs.existsSync(PLAYLIST_FILE)) return null;
  const { data, content } = matter(fs.readFileSync(PLAYLIST_FILE, "utf8"));
  const mois = String(data.mois ?? "");
  const display = data.display ? String(data.display) : mois.split(/\s+/)[0] || "Playlist";
  const maj = data.maj instanceof Date ? data.maj.toISOString().slice(0, 10) : data.maj ? String(data.maj) : undefined;
  const rawLiens = (data.liens ?? {}) as Record<string, unknown>;

  return {
    mois,
    display,
    echo: data.echo ? String(data.echo) : display,
    dek: data.dek ? String(data.dek) : undefined,
    maj,
    morceaux: Array.isArray(data.morceaux)
      ? data.morceaux.map((m: Record<string, unknown>) => ({
          titre: String(m.titre ?? ""),
          artiste: m.artiste ? String(m.artiste) : undefined,
          url: m.url ? String(m.url) : undefined,
        }))
      : [],
    liens: PLATEFORMES.filter((p) => typeof rawLiens[p.key] === "string" && String(rawLiens[p.key]).trim()).map((p) => ({
      key: p.key,
      label: p.label,
      url: String(rawLiens[p.key]).trim(),
    })),
    content,
  };
}
