import type { Morceau } from "@/lib/playlist";

export function Tracklist({ morceaux, limit }: { morceaux: Morceau[]; limit?: number }) {
  const list = limit ? morceaux.slice(0, limit) : morceaux;
  return (
    <ol className="tracklist">
      {list.map((m, i) => (
        <li key={i} className="track">
          <span className="track__n">{String(i + 1).padStart(2, "0")}</span>
          <span className="track__text">
            <span className="track__title">{m.titre}</span>
            {m.artiste && <span className="track__artist">{m.artiste}</span>}
          </span>
          {m.url && (
            <a className="track__link" href={m.url} target="_blank" rel="noopener noreferrer" aria-label={`Écouter ${m.titre}`}>
              ↗
            </a>
          )}
        </li>
      ))}
    </ol>
  );
}
