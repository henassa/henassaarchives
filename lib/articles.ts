import crypto from "node:crypto";
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
  /** Image de fond de l'article, fixe derrière le texte (facultatif). */
  fond?: string;
  /** Force du voile noir posé sur le fond, de 0 (aucun) à 1 (noir). Par défaut 0.72. */
  fondVoile: number;
  /** Grain ajouté par le site sur le fond. Par défaut oui. */
  fondGrain: boolean;
  /** Brouillon : absent des listes, lisible seulement par son adresse secrète. */
  brouillon: boolean;
  /** Ce qui suit /articles/ dans l'adresse : le nom du fichier, plus une clé si c'est un brouillon. */
  adresse: string;
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

  // Brouillon : l'adresse reçoit une clé (celle du champ « cle », sinon une clé calculée,
  // toujours la même pour un fichier donné), pour qu'on ne puisse pas la deviner.
  const brouillon = Boolean(data.brouillon);
  const cle = data.cle ? String(data.cle).replace(/[^A-Za-z0-9_-]/g, "") : crypto.createHash("sha1").update(`henassa:${slug}`).digest("hex").slice(0, 8);

  return {
    slug,
    brouillon,
    adresse: brouillon ? `${slug}--${cle}` : slug,
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
    fond: data.fond ? String(data.fond) : undefined,
    fondVoile: typeof data.fondVoile === "number" ? Math.min(1, Math.max(0, data.fondVoile)) : 0.72,
    fondGrain: data.fondGrain !== false,
    content,
  };
}

/** Tous les fichiers d'articles, brouillons compris (sert à fabriquer les pages). */
export function getTousLesArticles(): Article[] {
  if (!fs.existsSync(ARTICLES_DIR)) return [];
  return fs
    .readdirSync(ARTICLES_DIR)
    .filter((f) => /\.mdx?$/.test(f) && !f.startsWith("_"))
    .map(readArticleFile)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** Les articles publiés : c'est cette liste qu'affichent l'accueil et la page Articles. */
export function getAllArticles(): Article[] {
  return getTousLesArticles().filter((a) => !a.brouillon);
}

const EN_LOCAL = process.env.NODE_ENV !== "production";

export function getArticle(slug: string): Article | undefined {
  // Un brouillon ne répond qu'à son adresse secrète (nom--clé).
  // En local (npm run dev), il répond aussi à son nom simple, pour le retrouver facilement.
  const found = getTousLesArticles().find((a) => a.adresse === slug || (EN_LOCAL && a.slug === slug));
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
