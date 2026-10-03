import type { Metadata } from "next";
import { Lines, flat } from "@/components/Lines";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import { Cover } from "@/components/Cover";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { mdxComponents, mdxOptions } from "@/components/mdx";
import { Tag } from "@/components/Tag";
import { formatDate, getAllArticles, getArticle } from "@/lib/articles";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return getAllArticles().map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) return {};
  return { title: article.title, description: article.dek, authors: article.auteur ? [{ name: article.auteur }] : undefined };
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = getArticle(slug);
  if (!article) notFound();

  return (
    <div className="page">
      <Header active="articles" compact />

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
