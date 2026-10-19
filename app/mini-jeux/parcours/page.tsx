import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Parcours } from "@/components/parcours/Parcours";
import { donneesParcours } from "@/lib/jeux";
import { SECTIONS } from "@/lib/sections";

export const metadata: Metadata = {
  title: "Le Parcours",
  description: "Six épreuves sur les œuvres de Henassa : le mot, devine l'œuvre, chronologie, le chemin, la grille, les crédits. Seul ou à plusieurs.",
};

export default function ParcoursPage() {
  return (
    <div className="page">
      <Header active="jeux" compact />
      <main className="section-page" style={{ ["--accent" as string]: SECTIONS.jeux.couleur }}>
        <div className="echo-title echo-title--center">
          <span className="echo-title__echo" aria-hidden="true">Épreuves</span>
          <h1 className="echo-title__main">Le Parcours</h1>
        </div>
        <p className="section-intro">Six épreuves sur les œuvres de Henassa. Choisis les œuvres, les épreuves et le nombre de manches, seul ou à plusieurs.</p>
        <Parcours d={donneesParcours()} />
      </main>
      <Footer />
    </div>
  );
}
