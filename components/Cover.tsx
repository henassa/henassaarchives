import Image from "next/image";

/**
 * Image de couverture. Sans image, affiche un bloc sombre
 * avec un filet de la couleur donnée.
 */
export function Cover({
  src,
  alt,
  couleur,
  className = "",
  priority = false,
  sizes = "(max-width: 1100px) 100vw, 1000px",
}: {
  src?: string;
  alt?: string;
  couleur: string;
  className?: string;
  priority?: boolean;
  /** Largeur réelle d'affichage, pour que le navigateur charge la bonne taille. */
  sizes?: string;
}) {
  if (src) {
    return (
      <div className={`cover ${className}`}>
        <Image
          src={src}
          alt={alt ?? ""}
          fill
          sizes={sizes}
          quality={90}
          priority={priority}
          style={{ objectFit: "cover" }}
        />
      </div>
    );
  }
  return (
    <div
      className={`cover cover--empty ${className}`}
      style={{ borderTopColor: couleur }}
      role="img"
      aria-label={alt ?? "Pas encore d'illustration"}
    >
      <span>[ illustration ]</span>
    </div>
  );
}
