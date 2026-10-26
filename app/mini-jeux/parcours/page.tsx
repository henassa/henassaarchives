import { permanentRedirect } from "next/navigation";

// Le Parcours s'appelle maintenant l'Arène : les anciens liens y mènent.
export default function AncienParcours() {
  permanentRedirect("/mini-jeux/arene");
}
