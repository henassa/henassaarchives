import { permanentRedirect } from "next/navigation";

// Le Parcours s'appelle maintenant l'Arène : les anciens liens (et les invitations) y mènent.
export default async function AncienParcoursSalon({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  permanentRedirect(code ? `/mini-jeux/arene/salon?code=${encodeURIComponent(code)}` : "/mini-jeux/arene/salon");
}
