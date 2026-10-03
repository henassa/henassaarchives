import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Tierlist } from "@/components/jeux/Tierlist";
import { readConnexions } from "@/lib/oeuvres";
import { SECTIONS } from "@/lib/sections";

export const metadata: Metadata = {
  title: "Tierlist",
  description: "Classe les œuvres de Henassa par rang et télécharge ton classement.",
};

export default function TierlistPage() {
  const { oeuvres } = readConnexions();
  // On n'envoie au navigateur que ce dont le jeu a besoin
  const items = oeuvres.map((o) => ({
    cle: o.slug ?? String(o.id),
    titre: o.titre,
    auteur: o.auteur,
    type: o.type,
    genre: o.genre,
    sousGenres: o.sousGenres ?? [],
    annee: o.annee,
    cover: o.cover,
  }));
  return (
    <div className="page">
      <Header active="jeux" compact />
      <main className="section-page" style={{ ["--accent" as string]: SECTIONS.jeux.couleur }}>
        <div className="echo-title echo-title--center">
          <span className="echo-title__echo" aria-hidden="true">Tier</span>
          <h1 className="echo-title__main">Tierlist</h1>
        </div>
        <p className="section-intro">
          Glisse les œuvres dans les rangs. Sur téléphone : touche une œuvre, puis le rang où la poser.
        </p>
        <Tierlist oeuvres={items} />
      </main>
      <Footer />
    </div>
  );
}
