import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { TierlistSalon } from "@/components/jeux/TierlistSalon";
import { readConnexions } from "@/lib/oeuvres";
import { SECTIONS } from "@/lib/sections";

export const metadata: Metadata = {
  title: "Tierlist à plusieurs",
  description: "La Tierlist en ligne : crée un salon, invite tes potes, et remplissez la même tierlist ensemble, en direct.",
};

export default function TierlistSalonPage() {
  const { oeuvres } = readConnexions();
  // On n'envoie au navigateur que ce dont le jeu a besoin
  const items = oeuvres.map((o) => ({
    cle: o.slug ?? String(o.id),
    titre: o.titre,
    auteur: o.auteur,
    type: o.type,
    genre: o.genre,
    sousGenres: o.sousGenres ?? [],
    parents: o.parents,
    scenes: o.scenes,
    annee: o.annee,
    cover: o.cover,
    mini: o.mini,
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
          À plusieurs, en ligne : la même tierlist pour tout le monde. Chacun glisse les œuvres, crée et renomme les rangs, et tout s&apos;affiche en direct chez les autres.
        </p>
        <TierlistSalon oeuvres={items} />
      </main>
      <Footer />
    </div>
  );
}
