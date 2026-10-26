/* Formes des données échangées entre le relais Deezer et le site. */

export type Titre = {
  id: string;
  titre: string;
  artiste: string;
  /** Tous les artistes crédités (pour accepter un featuring comme bonne réponse). */
  artistes: string[];
  album: string;
  pochette: string;
  /** false si Deezer n'a pas d'extrait pour ce morceau. */
  extrait: boolean;
};

export type Artiste = { id: string; nom: string; image: string; fans: number };
export type Album = { id: string; titre: string; artiste: string; pochette: string; nb: number; annee?: string };
export type Playlist = { id: string; titre: string; auteur: string; pochette: string; nb: number };

export type TypeRecherche = "titre" | "artiste" | "album" | "playlist";

export type Extrait = {
  url: string;
  source: "deezer" | "itunes";
  titre: Titre;
  /** Grande pochette pour la révélation. */
  grandePochette: string;
  lien: string;
};

/** Ce qu'un lien collé désigne. */
export type Cible = { type: TypeRecherche; id: string };
