import { permanentRedirect } from "next/navigation";

// Ce jeu fait maintenant partie du Parcours (une suite d'épreuves).
export default function AncienJeu() {
  permanentRedirect("/mini-jeux/parcours");
}
