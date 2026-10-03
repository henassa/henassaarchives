import type { Metadata } from "next";
import { Lines, flat } from "@/components/Lines";
import { MDXRemote } from "next-mdx-remote/rsc";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { mdxComponents, mdxOptions } from "@/components/mdx";
import { Tracklist } from "@/components/Tracklist";
import { formatDate } from "@/lib/articles";
import { getPlaylist } from "@/lib/playlist";
import { SECTIONS } from "@/lib/sections";

export function generateMetadata(): Metadata {
  const p = getPlaylist();
  return { title: p?.mois ? `Playlist — ${p.mois}` : "Playlist", description: p?.dek };
}

export default function PlaylistPage() {
  const p = getPlaylist();
  const couleur = SECTIONS.playlist.couleur;

  return (
    <div className="page">
      <Header active="playlist" compact />

      <article className="article" style={{ ["--accent" as string]: couleur }}>
        {p ? (
          <>
            <header className="article__head">
              <div className="echo-title echo-title--center echo-title--playlist">
                <span className="echo-title__echo" aria-hidden="true">
                  <Lines text={p.echo} />
                </span>
                <h1 className="echo-title__main"><Lines text={p.display} /></h1>
              </div>
              {p.dek && <p className="article__dek">{p.dek}</p>}
              <div className="article__meta">
                <span>{p.morceaux.length} titres</span>
                {p.maj && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>
                      Mise à jour le <time dateTime={p.maj}>{formatDate(p.maj)}</time>
                    </span>
                  </>
                )}
              </div>
            </header>

            {p.morceaux.length > 0 && <Tracklist morceaux={p.morceaux} />}

            {p.liens.length > 0 && (
              <section className="platforms" aria-labelledby="ecouter">
                <h2 id="ecouter" className="platforms__title">
                  Écouter sur
                </h2>
                <ul className="platforms__list">
                  {p.liens.map((l) => (
                    <li key={l.key}>
                      <a className="platform" href={l.url} target="_blank" rel="noopener noreferrer">
                        <span>{l.label}</span>
                        <span aria-hidden="true">↗</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {p.content.trim() && (
              <div className="prose">
                <MDXRemote source={p.content} components={mdxComponents} options={mdxOptions} />
              </div>
            )}
          </>
        ) : (
          <p className="empty">Pas de playlist pour l&apos;instant. Crée le fichier content/playlist.mdx.</p>
        )}
      </article>

      <Footer />
    </div>
  );
}
