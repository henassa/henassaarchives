import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { CartesJeux } from "@/components/jeux/CartesJeux";
import { SECTIONS } from "@/lib/sections";

export const metadata: Metadata = {
  title: "Mini-jeux",
  description: "Tierlist, dilemme, mot à trouver, œuvre à deviner : joue avec les œuvres de Henassa.",
};

export default function MiniJeuxPage() {
  return (
    <div className="page">
      <Header active="jeux" compact />
      <main className="section-page" style={{ ["--accent" as string]: SECTIONS.jeux.couleur }}>
        <div className="echo-title echo-title--center">
          <span className="echo-title__echo" aria-hidden="true">Jeux</span>
          <h1 className="echo-title__main">Mini-jeux</h1>
        </div>
        <p className="section-intro">Classer, départager, deviner les œuvres présents sur le site.</p>
        <CartesJeux />
      </main>
      <Footer />
    </div>
  );
}
