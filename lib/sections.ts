// Les trois rubriques du site. Chacune a sa couleur (menu, étiquettes,
// écho gothique des titres). Changer une valeur ici la change partout.

export const SECTIONS = {
  articles: { label: "Articles", href: "/articles", couleur: "#FF4D3D" },
  connexions: { label: "Connexions", href: "/connexions", couleur: "#3D7BFF" },
  playlist: { label: "Playlist", href: "/playlist", couleur: "#FFC928" },
} as const;

// Bouton Instagram du menu : colle ici le lien de ton compte.
export const INSTAGRAM = {
  url: "https://www.instagram.com/henassaa",
  couleur: "#E1306C",
};

// Bouton Discord du menu : colle ici ton lien d'invitation
// (Discord → ton serveur → Inviter des gens → « Modifier le lien » → n'expire jamais).
export const DISCORD = {
  url: "https://discord.gg/UBHQhsmFk",
  couleur: "#5865F2",
};

export type SectionSlug = keyof typeof SECTIONS;

export const SECTION_SLUGS = Object.keys(SECTIONS) as SectionSlug[];

// Types d'œuvres utilisés dans les Connexions.
export const TYPES_OEUVRE = {
  album: { label: "Album", pluriel: "Albums", couleur: "#FF4D3D" },
  film: { label: "Film", pluriel: "Films", couleur: "#FFC928" },
  jeu: { label: "Jeu", pluriel: "Jeux", couleur: "#3D7BFF" },
  livre: { label: "Livre", pluriel: "Livres", couleur: "#3FD68A" },
  autre: { label: "Autre", pluriel: "Autres", couleur: "#BDBDBD" },
} as const;

export type TypeOeuvre = keyof typeof TYPES_OEUVRE;

export const TYPE_SLUGS = Object.keys(TYPES_OEUVRE) as TypeOeuvre[];

export function isTypeOeuvre(value: unknown): value is TypeOeuvre {
  return typeof value === "string" && value in TYPES_OEUVRE;
}
