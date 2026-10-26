import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { ParcoursSalon } from "@/components/parcours/ParcoursSalon";
import { donneesParcours } from "@/lib/jeux";
import { SECTIONS } from "@/lib/sections";

export const metadata: Metadata = {
  title: "Arène à plusieurs",
  description: "L'Arène en ligne avec tes potes : les mêmes épreuves en même temps, un classement après chaque manche.",
};

export default function AreneSalonPage() {
  return (
    <div className="page">
      <Header active="jeux" compact />
      <main className="section-page" style={{ ["--accent" as string]: SECTIONS.jeux.couleur }}>
        <div className="echo-title echo-title--center">
          <span className="echo-title__echo" aria-hidden="true">Ensemble</span>
          <h1 className="echo-title__main">Arène</h1>
        </div>
        <p className="section-intro">À plusieurs, en ligne : la même manche pour tout le monde, en même temps. Les points comptent la justesse et la rapidité.</p>
        <ParcoursSalon d={donneesParcours()} />
      </main>
      <Footer />
    </div>
  );
}
