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
import { PlayerProvider } from "@/components/player/Lecteur";

export const metadata: Metadata = {
  title: {
    default: "HENASSA",
    template: "HENASSA",
  },
  description: "Articles, connexions entre les œuvres et playlist du mois.",
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
      <body>
        <Splash />
        <PlayerProvider>{children}</PlayerProvider>
      </body>
    </html>
  );
}
