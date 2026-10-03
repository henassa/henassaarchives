import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { LeMot } from "@/components/jeux/LeMot";
import { oeuvresPourJeux } from "@/lib/jeux";
import { SECTIONS } from "@/lib/sections";

export const metadata: Metadata = {
  title: "Le mot",
  description: "Trouve le titre lettre par lettre. La pochette se dévoile à chaque essai.",
};

export default function Page() {
  return (
    <div className="page">
      <Header active="jeux" compact />
      <main className="section-page" style={{ ["--accent" as string]: SECTIONS.jeux.couleur }}>
        <div className="echo-title echo-title--center">
          <span className="echo-title__echo" aria-hidden="true">Mot</span>
          <h1 className="echo-title__main">Le mot</h1>
        </div>
        <p className="section-intro">
          Trouve le titre lettre par lettre. La pochette se dévoile à chaque essai.
        </p>
        <LeMot oeuvres={oeuvresPourJeux()} />
      </main>
      <Footer />
    </div>
  );
}
