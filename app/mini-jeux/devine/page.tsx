import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Devine } from "@/components/jeux/Devine";
import { oeuvresPourJeux } from "@/lib/jeux";
import { SECTIONS } from "@/lib/sections";

export const metadata: Metadata = {
  title: "Devine l'œuvre",
  description: "Un indice de plus à chaque essai : genre, sous-genres, connexions, année, pochette, extrait.",
};

export default function Page() {
  return (
    <div className="page">
      <Header active="jeux" compact />
      <main className="section-page" style={{ ["--accent" as string]: SECTIONS.jeux.couleur }}>
        <div className="echo-title echo-title--center">
          <span className="echo-title__echo" aria-hidden="true">Devine</span>
          <h1 className="echo-title__main">Devine l&apos;œuvre</h1>
        </div>
        <p className="section-intro">
          Un indice de plus à chaque essai : genre, sous-genres, connexions, année, pochette, extrait.
        </p>
        <Devine oeuvres={oeuvresPourJeux()} />
      </main>
      <Footer />
    </div>
  );
}
