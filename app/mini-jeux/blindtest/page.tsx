import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import Blindtest from "@/components/blindtest/Blindtest";
import { SECTIONS } from "@/lib/sections";
import "./blindtest.css";

export const metadata: Metadata = {
  title: "Blindtest",
  description: "Le blindtest de Henassa : crée une room, invite tes potes avec un code, et trouvez le titre et l'artiste en trente secondes d'extrait.",
};

export default function BlindtestPage() {
  return (
    <div className="page">
      <Header active="jeux" compact />
      <main className="section-page" style={{ ["--accent" as string]: SECTIONS.jeux.couleur }}>
        <div className="echo-title echo-title--center">
          <span className="echo-title__echo" aria-hidden="true">Écoute</span>
          <h1 className="echo-title__main">Blindtest</h1>
        </div>
        <Blindtest />
      </main>
      <Footer />
    </div>
  );
}
