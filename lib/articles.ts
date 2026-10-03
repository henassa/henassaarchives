import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { SECTIONS } from "./sections";

const ARTICLES_DIR = path.join(process.cwd(), "content", "articles");

export type ArticleMeta = {
  slug: string;
  title: string;
  /** Mot(s) affiché(s) en très grand en tête d'article. Par défaut : le titre. */
  display: string;
  /** Mot écrit en gothique derrière le titre. Par défaut : display. */
  echo: string;
  dek?: string;
  date: string; // AAAA-MM-JJ
  /** Étiquette de catégorie : « Jeux », « Cinéma », « Histoire »... */
  categorie?: string;
  /** Affiché « Écrit par … ». */
  auteur?: string;
  /** Couleur de l'article (écho, étiquette, citations). Par défaut : rouge Articles. */
  couleur: string;
  cover?: string;
  coverAlt?: string;
  credit?: string;
  une?: boolean;
};

export type Article = ArticleMeta & { content: string };

function readArticleFile(fileName: string): Article {
  const slug = fileName.replace(/\.mdx?$/, "");
  const raw = fs.readFileSync(path.join(ARTICLES_DIR, fileName), "utf8");
  const { data, content } = matter(raw);

  if (!data.title) throw new Error(`« title » manquant dans ${fileName}`);
  if (!data.date) throw new Error(`« date » manquante dans ${fileName}`);

  const date =
    data.date instanceof Date ? data.date.toISOString().slice(0, 10) : String(data.date);
  const display = data.display ? String(data.display) : String(data.title);

  return {
    slug,
    title: String(data.title),
    display,
    echo: data.echo ? String(data.echo) : display,
    dek: data.dek,
    date,
    categorie: data.categorie ? String(data.categorie) : undefined,
    auteur: data.auteur ? String(data.auteur) : undefined,
    couleur: data.couleur ? String(data.couleur) : SECTIONS.articles.couleur,
    cover: data.cover,
    coverAlt: data.coverAlt,
    credit: data.credit,
    une: Boolean(data.une),
    content,
  };
}

export function getAllArticles(): Article[] {
  if (!fs.existsSync(ARTICLES_DIR)) return [];
  return fs
    .readdirSync(ARTICLES_DIR)
    .filter((f) => /\.mdx?$/.test(f) && !f.startsWith("_"))
    .map(readArticleFile)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getArticle(slug: string): Article | undefined {
  const found = getAllArticles().find((a) => a.slug === slug);
  if (found) return found;
  // En local (npm run dev), les brouillons « _xxx.mdx » sont visibles
  // sur /articles/_xxx, mais jamais publiés sur le site en ligne.
  if (process.env.NODE_ENV !== "production" && slug.startsWith("_")) {
    const file = fs.readdirSync(ARTICLES_DIR).find((f) => f.replace(/\.mdx?$/, "") === slug);
    if (file) return readArticleFile(file);
  }
  return undefined;
}

/** 2026-09-27 → 27.09.2026 */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}
