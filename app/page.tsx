import Link from "next/link";
import { Lines, flat } from "@/components/Lines";
import { Card } from "@/components/Card";
import { Cover } from "@/components/Cover";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Tag } from "@/components/Tag";
import { Tracklist } from "@/components/Tracklist";
import { getAllArticles } from "@/lib/articles";
import { readConnexions } from "@/lib/oeuvres";
import { getPlaylist } from "@/lib/playlist";
import { SECTIONS, TYPES_OEUVRE } from "@/lib/sections";

function SectionTitle({ label, href, couleur, more = "Tout voir →" }: { label: string; href: string; couleur: string; more?: string }) {
  return (
    <div className="section-title">
      <h2>{label}</h2>
      <Link href={href} className="section-title__more" style={{ background: couleur }}>
        {more}
      </Link>
    </div>
  );
}

export default function HomePage() {
  const articles = getAllArticles();
  const une = articles.find((a) => a.une) ?? articles[0];
  const autres = articles.filter((a) => a !== une).slice(0, 6);
  const playlist = getPlaylist();

  const { oeuvres, liens } = readConnexions();
  const degree = new Map<number, number>();
  for (const l of liens) {
    degree.set(l.a, (degree.get(l.a) ?? 0) + 1);
    degree.set(l.b, (degree.get(l.b) ?? 0) + 1);
  }
  const vitrine = [...oeuvres]
    .filter((o) => o.cover)
    .sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0))
    .slice(0, 16);

  return (
    <div className="page">
      <Header />

      <main className="home">
        {une ? (
          <section className="une">
            <div className="une__text" style={{ ["--accent" as string]: une.couleur }}>
              <div className="tags">
                <Tag label={`${une.categorie ?? "Article"} · À la une`} couleur={une.couleur} variant="sans" />
                {une.auteur && <span className="tag tag--sans tag--outline">Écrit par {une.auteur}</span>}
              </div>
              <div className="echo-title echo-title--left">
                <span className="echo-title__echo" aria-hidden="true">
                  <Lines text={une.echo} />
                </span>
                <h1 className="echo-title__main">
                  <Link href={`/articles/${une.slug}`}><Lines text={une.display} /></Link>
                </h1>
              </div>
              {flat(une.display) !== une.title && <p className="une__title-full">{une.title}</p>}
              {une.dek && <p className="une__dek">{une.dek}</p>}
            </div>
            <Link href={`/articles/${une.slug}`} className="une__cover-link" tabIndex={-1}>
              <Cover src={une.cover} alt={une.coverAlt} couleur={une.couleur} className="une__cover" sizes="(max-width: 960px) 100vw, 640px" priority />
            </Link>
          </section>
        ) : (
          <p className="empty">Aucun article pour l&apos;instant. Ajoute un fichier dans content/articles.</p>
        )}

        {vitrine.length > 0 && (
          <section>
            <SectionTitle label="Connexions" href={SECTIONS.connexions.href} couleur={SECTIONS.connexions.couleur} />
            <p className="home-connexions__stats">
              {oeuvres.length} œuvres · {liens.length} connexions
            </p>
            <ul className="vitrine">
              {vitrine.map((o) => (
                <li key={o.id} style={{ ["--type" as string]: TYPES_OEUVRE[o.type].couleur }}>
                  <Link href={`/connexions?oeuvre=${o.slug ?? o.id}`} className="vitrine__item" title={`${o.titre} — ${o.auteur}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={o.cover} alt={`${o.titre} — ${o.auteur}`} loading="lazy" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {autres.length > 0 && (
          <section>
            <SectionTitle label="Articles" href={SECTIONS.articles.href} couleur={SECTIONS.articles.couleur} />
            <div className="grid">
              {autres.map((a) => (
                <Card
                  key={a.slug}
                  item={{
                    href: `/articles/${a.slug}`,
                    title: a.title,
                    date: a.date,
                    couleur: a.couleur,
                    label: a.categorie ?? "Article",
                    auteur: a.auteur,
                    cover: a.cover,
                    coverAlt: a.coverAlt,
                  }}
                />
              ))}
            </div>
          </section>
        )}

        {playlist && playlist.morceaux.length > 0 && (
          <section>
            <SectionTitle label="Playlist du mois" href={SECTIONS.playlist.href} couleur={SECTIONS.playlist.couleur} more="Écouter →" />
            <div className="home-playlist" style={{ ["--accent" as string]: SECTIONS.playlist.couleur }}>
              <div className="home-playlist__head">
                <div className="echo-title echo-title--left">
                  <span className="echo-title__echo" aria-hidden="true">
                    <Lines text={playlist.echo} />
                  </span>
                  <p className="echo-title__main"><Lines text={playlist.display} /></p>
                </div>
                {playlist.mois && <p className="home-playlist__mois">{playlist.mois} · {playlist.morceaux.length} titres</p>}
              </div>
              <div>
                <Tracklist morceaux={playlist.morceaux} limit={5} />
                {playlist.morceaux.length > 5 && (
                  <Link href={SECTIONS.playlist.href} className="home-playlist__more">
                    + {playlist.morceaux.length - 5} autres titres
                  </Link>
                )}
              </div>
            </div>
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
}