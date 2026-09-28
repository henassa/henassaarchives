import Link from "next/link";

export function Logo({ size = "large" }: { size?: "large" | "small" }) {
  return (
    <Link href="/" className={`logo logo--${size}`} aria-label="Henassa, accueil">
      <span className="logo__echo" aria-hidden="true">
        Henassa
      </span>
      <span className="logo__text">HENASSA</span>
    </Link>
  );
}
