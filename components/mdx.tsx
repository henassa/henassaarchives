import type { ReactNode } from "react";
import remarkGfm from "remark-gfm";
import { isPlayable } from "@/lib/media";
import { PlayButton } from "@/components/player/Lecteur";

/*
 * Composants utilisables directement dans les fichiers .mdx.
 * Ils prennent la couleur de l'article (champ « couleur » en tête du fichier).
 * Mode d'emploi complet, avec un exemple de chaque : content/articles/_guide.mdx
 * (visible en local sur http://localhost:3000/articles/_guide).
 */

type Enfants = { children?: ReactNode };

/* ---------- Blocs ---------- */

/** Grande phrase centrée, dans la couleur de l'article. Écho gothique et auteur facultatifs. */
function Citation({ children, auteur, echo }: Enfants & { auteur?: string; echo?: string }) {
  return (
    <figure className={`citation${echo ? " citation--echo" : ""}`}>
      {echo && (
        <span className="citation__echo" aria-hidden="true">
          {echo}
        </span>
      )}
      <blockquote className="citation__texte">« {children} »</blockquote>
      {auteur && <figcaption className="citation__auteur">— {auteur}</figcaption>}
    </figure>
  );
}

/** Intertitre en grand, avec un mot gothique en écho derrière (comme les titres du site). */
function Intertitre({ children, echo }: Enfants & { echo?: string }) {
  const mot = echo ?? (typeof children === "string" ? children.split(/\s+/)[0] : undefined);
  return (
    <div className="intertitre">
      {mot && (
        <span className="intertitre__echo" aria-hidden="true">
          {mot}
        </span>
      )}
      <h2 className="intertitre__texte">{children}</h2>
    </div>
  );
}

/** Paragraphe d'ouverture avec une grande lettrine gothique. */
function Lettrine({ children }: Enfants) {
  return <div className="lettrine">{children}</div>;
}

/** Texte en grand, pour un paragraphe qu'on veut faire ressortir. */
function Grand({ children }: Enfants) {
  return <div className="grand">{children}</div>;
}

/** Encadré : une parenthèse, un contexte, une fiche technique... */
function Encadre({ children, titre }: Enfants & { titre?: string }) {
  return (
    <aside className="encadre">
      {titre && <p className="encadre__titre">{titre}</p>}
      <div className="encadre__corps">{children}</div>
    </aside>
  );
}

/** Un chiffre géant et sa légende. */
function Chiffre({ valeur, children }: Enfants & { valeur: string | number }) {
  return (
    <div className="chiffre">
      <span className="chiffre__valeur">{valeur}</span>
      {children && <span className="chiffre__legende">{children}</span>}
    </div>
  );
}

/** Séparateur entre deux parties (trois barres). */
function Separateur() {
  return (
    <div className="separateur" role="separator">
      <i />
      <i />
      <i />
    </div>
  );
}

/** Image seule, avec légende facultative. */
function Figure({ src, alt, legende, large }: { src: string; alt: string; legende?: string; large?: boolean }) {
  return (
    <figure className={`figure${large ? " figure--large" : ""}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} loading="lazy" />
      {legende && <figcaption>{legende}</figcaption>}
    </figure>
  );
}

/** Plusieurs images côte à côte : mettre des <Image /> à l'intérieur. */
function Galerie({ children, legende }: Enfants & { legende?: string }) {
  return (
    <figure className="galerie">
      <div className="galerie__grille">{children}</div>
      {legende && <figcaption>{legende}</figcaption>}
    </figure>
  );
}

/** Bouton « Écouter » : lance le morceau dans le lecteur du site (YouTube ou fichier audio). */
function Ecouter({ titre, auteur, media }: { titre: string; auteur?: string; media: string }) {
  if (!isPlayable(media)) {
    return (
      <a className="player__link" href={media} target="_blank" rel="noopener noreferrer">
        Écouter {titre} →
      </a>
    );
  }
  return (
    <div className="ecouter">
      <PlayButton piste={{ titre, auteur, media }} />
      <span className="ecouter__info">
        <span className="ecouter__titre">{titre}</span>
        {auteur && <span className="ecouter__auteur">{auteur}</span>}
      </span>
    </div>
  );
}

/* ---------- Dans le texte ---------- */

/** Surligné au marqueur, dans la couleur de l'article. */
function Surligne({ children }: Enfants) {
  return <mark className="surligne">{children}</mark>;
}

/** Mot en écriture gothique, dans la couleur de l'article. */
function Gothique({ children }: Enfants) {
  return <span className="gothique">{children}</span>;
}

/** Texte dans la couleur de l'article (ou une autre : couleur="#3D7BFF"). */
function Couleur({ children, couleur }: Enfants & { couleur?: string }) {
  return (
    <span className="couleur" style={couleur ? { color: couleur } : undefined}>
      {children}
    </span>
  );
}

/** Petite étiquette, comme celles du site. */
function Etiquette({ children }: Enfants) {
  return <span className="etiquette">{children}</span>;
}

export const mdxComponents = {
  Citation,
  Intertitre,
  Lettrine,
  Grand,
  Encadre,
  Chiffre,
  Separateur,
  Image: Figure,
  Galerie,
  Ecouter,
  Surligne,
  Gothique,
  Couleur,
  Etiquette,
};

/** Options Markdown : barré (~~texte~~), tableaux, liens automatiques. */
export const mdxOptions = {
  mdxOptions: { remarkPlugins: [remarkGfm] },
};
