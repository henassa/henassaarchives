import type { Metadata } from "next";
import { Lines, flat } from "@/components/Lines";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import { Cover } from "@/components/Cover";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { mdxComponents, mdxOptions } from "@/components/mdx";
import { Tag } from "@/components/Tag";
import { formatDate, getArticle, getTousLesArticles } from "@/lib/articles";
import { IMAGE_PARTAGE } from "@/lib/site";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  // les brouillons ont leur page aussi, mais à une adresse secrète
  return getTousLesArticles().map((a) => ({ slug: a.adresse }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) return {};
  return {
    title: article.title,
    description: article.dek,
    authors: article.auteur ? [{ name: article.auteur }] : undefined,
    // un brouillon ne doit pas apparaître dans Google
    robots: article.brouillon ? { index: false, follow: false } : undefined,
    // Aperçu de partage : le titre, le chapô et l'image de couverture de l'article
    openGraph: {
      type: "article",
      siteName: "Henassa",
      locale: "fr_FR",
      title: article.title,
      description: article.dek,
      url: `/articles/${article.adresse}`,
      publishedTime: article.date,
      authors: article.auteur ? [article.auteur] : undefined,
      images: [{ url: article.cover ?? IMAGE_PARTAGE, alt: article.coverAlt ?? article.title }],
    },
    twitter: { card: "summary_large_image", title: article.title, description: article.dek, images: [article.cover ?? IMAGE_PARTAGE] },
  };
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) notFound();

  return (
    <div className={`page${article.fond ? " page--fond" : ""}`}>
      {article.fond && (
        // Image de fond : fixe derrière le texte, avec un voile noir et un grain
        <div
          className={`article-fond${article.fondGrain ? " article-fond--grain" : ""}`}
          aria-hidden="true"
          style={{ ["--fond" as string]: `url("${article.fond}")`, ["--voile" as string]: article.fondVoile }}
        />
      )}
      <Header active="articles" compact />

      {article.brouillon && (
        <p className="brouillon" role="note">
          <strong>Brouillon</strong>
          <span>
            Cet article n&apos;est pas publié. Il n&apos;apparaît nulle part sur le site : seules les personnes qui ont ce lien peuvent le lire.
            {slug !== article.adresse && (
              <>
                {" "}
                Lien à partager une fois en ligne : <code>/articles/{article.adresse}</code>
              </>
            )}
          </span>
        </p>
      )}

      <article className="article" style={{ ["--accent" as string]: article.couleur }}>
        <header className="article__head">
          <div className="echo-title echo-title--center">
            <span className="echo-title__echo" aria-hidden="true">
              <Lines text={article.echo} />
            </span>
            <h1 className="echo-title__main"><Lines text={article.display} /></h1>
          </div>
          {flat(article.display) !== article.title && <p className="article__title-full">{article.title}</p>}
          {article.dek && <p className="article__dek">{article.dek}</p>}
          <div className="article__meta">
            <Tag label={article.categorie ?? "Article"} couleur={article.couleur} variant="sans" />
            {article.auteur && <span className="tag tag--sans tag--outline">Écrit par {article.auteur}</span>}
            <time dateTime={article.date}>{formatDate(article.date)}</time>
          </div>
        </header>

        <figure className="article__figure">
          <Cover src={article.cover} alt={article.coverAlt} couleur={article.couleur} className="article__cover" priority />
          {article.credit && <figcaption>{article.credit}</figcaption>}
        </figure>

        <div className="prose">
          <MDXRemote source={article.content} components={mdxComponents} options={mdxOptions} />
        </div>
      </article>

      <Footer />
    </div>
  );
}
