import { Fragment } from "react";

/**
 * Affiche un texte en coupant la ligne à chaque « | ».
 * Exemple dans un fichier : display: "Henassa|Radio"
 */
export function Lines({ text }: { text: string }) {
  const parts = text.split("|").map((p) => p.trim());
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {p}
        </Fragment>
      ))}
    </>
  );
}

/** Le même texte sans les « | », pour les titres d'onglet ou les comparaisons. */
export function flat(text: string) {
  return text.split("|").map((p) => p.trim()).join(" ");
}