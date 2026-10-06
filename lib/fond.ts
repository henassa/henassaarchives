// Image de fond de tout le site : fixe, derrière toutes les pages.
// Dépose ton image dans public/images/ et mets son adresse dans « image ».
// Laisse « image » vide ("") pour revenir au fond noir uni.
export const FOND_SITE = {
  /** Adresse de l'image, par exemple "/images/fond-site.jpg". 2400 x 1600 px conseillé, JPEG de 300 à 500 Ko. */
  image: "/images/fond-site.jpg",
  /** Force du voile noir posé dessus, de 0 (aucun) à 1 (noir complet). Plus c'est haut, plus le texte est lisible. */
  voile: 0,
  /** Grain ajouté par le site (ne pèse rien dans l'image). */
  grain: false,
};
