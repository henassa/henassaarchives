import type { Metadata } from "next";
import { Explorer } from "@/components/connexions/Explorer";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { readConnexions } from "@/lib/oeuvres";
import { SECTIONS } from "@/lib/sections";

export const metadata: Metadata = {
  title: "Connexions",
  description: "Les œuvres et les fils qui les relient.",
};

export default function ConnexionsPage() {
  const { oeuvres, liens } = readConnexions();
  return (
    <div className="page">
      <Header active="connexions" compact />
      <main className="section-page" style={{ ["--accent" as string]: SECTIONS.connexions.couleur }}>
        <div className="echo-title echo-title--center">
          <span className="echo-title__echo" aria-hidden="true">Connexions</span>
          <h1 className="echo-title__main">Connexions</h1>
        </div>
        <p className="section-intro">
          Les œuvres qui nous ont marqué, et ce qui les relie.
        </p>
        <Explorer oeuvres={oeuvres} liens={liens} />
      </main>
      <Footer />
    </div>
  );
}
