import type { Metadata } from "next";
import { Card } from "@/components/Card";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { getAllArticles } from "@/lib/articles";
import { SECTIONS } from "@/lib/sections";

export const metadata: Metadata = { title: "Articles" };

export default function ArticlesPage() {
  const articles = getAllArticles();
  return (
    <div className="page">
      <Header active="articles" compact />
      <main className="section-page" style={{ ["--accent" as string]: SECTIONS.articles.couleur }}>
        <div className="echo-title echo-title--center">
          <span className="echo-title__echo" aria-hidden="true">Articles</span>
          <h1 className="echo-title__main">Articles</h1>
        </div>
        {articles.length > 0 ? (
          <div className="grid">
            {articles.map((a) => (
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
        ) : (
          <p className="empty">Aucun article pour l&apos;instant.</p>
        )}
      </main>
      <Footer />
    </div>
  );
}
