import Link from "next/link";
import { Header } from "@/components/Header";

export default function NotFound() {
  return (
    <div className="page">
      <Header compact />
      <main className="section-page" style={{ ["--accent" as string]: "#FF4D3D" }}>
        <div className="echo-title echo-title--center">
          <span className="echo-title__echo" aria-hidden="true">Perdu</span>
          <h1 className="echo-title__main">404</h1>
        </div>
        <p className="empty">
          Cette page n&apos;existe pas (ou plus). <Link href="/">Retour à l&apos;accueil</Link>
        </p>
      </main>
    </div>
  );
}
