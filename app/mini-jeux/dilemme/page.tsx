import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Dilemme } from "@/components/jeux/Dilemme";
import { isPlayable } from "@/lib/media";
import { readConnexions } from "@/lib/oeuvres";
import { SECTIONS } from "@/lib/sections";

export const metadata: Metadata = {
  title: "Dilemme",
  description: "Deux œuvres, un seul choix. De duel en duel jusqu'à la finale.",
};

export default function DilemmePage() {
  const { oeuvres } = readConnexions();
  const items = oeuvres.map((o) => ({
    cle: o.slug ?? String(o.id),
    titre: o.titre,
    auteur: o.auteur,
    annee: o.annee,
    type: o.type,
    genre: o.genre,
    sousGenres: o.sousGenres ?? [],
    cover: o.cover,
    media: isPlayable(o.media) ? o.media : undefined,
  }));
  return (
    <div className="page">
      <Header active="jeux" compact />
      <main className="section-page" style={{ ["--accent" as string]: SECTIONS.jeux.couleur }}>
        <div className="echo-title echo-title--center">
          <span className="echo-title__echo" aria-hidden="true">Duel</span>
          <h1 className="echo-title__main">Dilemme</h1>
        </div>
        <p className="section-intro">
          Deux œuvres, un seul choix. De duel en duel, jusqu&apos;à ce qu&apos;il n&apos;en reste qu&apos;une.
        </p>
        <Dilemme oeuvres={items} />
      </main>
      <Footer />
    </div>
  );
}
