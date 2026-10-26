import type { Metadata } from "next";
import "@fontsource/anton/400.css";
import "@fontsource/archivo/400.css";
import "@fontsource/archivo/600.css";
import "@fontsource/archivo/800.css";
import "@fontsource/archivo/600-italic.css";
import "@fontsource/archivo/800-italic.css";
import "@fontsource/dm-serif-display/400-italic.css";
import "@fontsource/unifrakturmaguntia/400.css";
import "./globals.css";
import { Splash } from "@/components/Splash";
import { FOND_SITE } from "@/lib/fond";
import { Ambiance } from "@/components/Ambiance";
import { IMAGE_PARTAGE, SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: {
    default: "HENASSA",
    template: "HENASSA",
  },
  description: "Articles, connexions entre les œuvres et playlist du mois.",
  // Aperçu affiché quand on partage un lien du site
  metadataBase: new URL(SITE_URL),
  openGraph: {
    siteName: "HENASSA",
    title: "HENASSA",
    description: "Blog era is coming back.",
    locale: "fr_FR",
    type: "website",
    images: [{ url: IMAGE_PARTAGE, width: 1200, height: 630, alt: "Henassa" }],
  },
  twitter: { card: "summary_large_image" },
};

// L'écran d'arrivée ne se joue qu'une fois par visite : ce petit script
// s'exécute avant l'affichage pour le masquer si on l'a déjà vu.
const splashScript = `try{if(sessionStorage.getItem("henassa-splash")){document.documentElement.dataset.splash="done"}else{sessionStorage.setItem("henassa-splash","1")}}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: splashScript }} />
      </head>
      <body
        className={FOND_SITE.image ? "a-fond" : undefined}
        style={FOND_SITE.image ? { ["--fond-site" as string]: `url("${FOND_SITE.image}")`, ["--voile-site" as string]: Math.min(1, Math.max(0, FOND_SITE.voile)) } : undefined}
      >
        {FOND_SITE.image && (
          // Image de fond du site (réglages : lib/fond.ts)
          <div
            className={`site-fond${FOND_SITE.grain ? " site-fond--grain" : ""}`}
            aria-hidden="true"
            style={{ ["--fond" as string]: `url("${FOND_SITE.image}")`, ["--voile" as string]: Math.min(1, Math.max(0, FOND_SITE.voile)) }}
          />
        )}
        {/* sans image de fond : le dégradé teinté par la couleur de chaque page */}
        {!FOND_SITE.image && <Ambiance />}
        <Splash />
        {children}
      </body>
    </html>
  );
}
