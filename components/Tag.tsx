import Link from "next/link";

/** Étiquette de couleur : lien si href est fourni. */
export function Tag({
  label,
  couleur,
  href,
  variant = "serif",
}: {
  label: string;
  couleur: string;
  href?: string;
  variant?: "serif" | "sans";
}) {
  const className = `tag tag--${variant}`;
  const style = { background: couleur };
  if (href) {
    return (
      <Link href={href} className={className} style={style}>
        {label}
      </Link>
    );
  }
  return (
    <span className={className} style={style}>
      {label}
    </span>
  );
}
