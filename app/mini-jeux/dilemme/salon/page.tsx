import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { DilemmeSalon } from "@/components/jeux/DilemmeSalon";
import { isPlayable } from "@/lib/media";
import { readConnexions } from "@/lib/oeuvres";
import { SECTIONS } from "@/lib/sections";

export const metadata: Metadata = {
  title: "Dilemme à plusieurs",
  description: "Le Dilemme en ligne : crée un salon, invite tes potes, et votez duel après duel.",
};

export default function DilemmeSalonPage() {
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
    mini: o.mini,
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
          À plusieurs, en ligne : tout le monde vote sur le même duel, et l&apos;œuvre qui a le plus de voix continue.
        </p>
        <DilemmeSalon oeuvres={items} />
      </main>
      <Footer />
    </div>
  );
}
