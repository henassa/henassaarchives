import Link from "next/link";
import { MINI_JEUX, SECTIONS } from "@/lib/sections";

/** La grille des mini-jeux (page Mini-jeux et accueil). */
export function CartesJeux() {
  return (
    <ul className="jeux-grille" style={{ ["--accent" as string]: SECTIONS.jeux.couleur }}>
      {MINI_JEUX.map((j) => {
        const contenu = (
          <>
            <span className="jeu-carte__echo" aria-hidden="true">{j.echo}</span>
            <span className="jeu-carte__titre">{j.titre}</span>
            <span className="jeu-carte__resume">{j.resume}</span>
            <span className="jeu-carte__action">{j.pret ? "Jouer →" : "Bientôt"}</span>
          </>
        );
        return (
          <li key={j.slug}>
            {j.pret ? (
              <Link href={`${SECTIONS.jeux.href}/${j.slug}`} className="jeu-carte">
                {contenu}
              </Link>
            ) : (
              <div className="jeu-carte jeu-carte--bientot">{contenu}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
