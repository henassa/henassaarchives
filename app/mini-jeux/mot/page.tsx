import { permanentRedirect } from "next/navigation";

// Ce jeu fait maintenant partie de l'Arène (une suite d'épreuves).
export default function AncienJeu() {
  permanentRedirect("/mini-jeux/arene");
}
