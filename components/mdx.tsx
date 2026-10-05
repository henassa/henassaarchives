import type { ReactNode } from "react";
import remarkGfm from "remark-gfm";
import { isPlayable, secondes } from "@/lib/media";
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

/** Image seule, avec légende facultative. « large » déborde du texte, « petite » la réduit et la centre. */
function Figure({ src, alt, legende, large, petite }: { src: string; alt: string; legende?: string; large?: boolean; petite?: boolean }) {
  return (
    <figure className={`figure${large ? " figure--large" : ""}${petite ? " figure--petite" : ""}`}>
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
function Ecouter({ titre, auteur, media, debut, fin }: { titre: string; auteur?: string; media: string; debut?: string | number; fin?: string | number }) {
  if (!isPlayable(media)) {
    return (
      <a className="player__link" href={media} target="_blank" rel="noopener noreferrer">
        Écouter {titre} →
      </a>
    );
  }
  return (
    <div className="ecouter">
      <PlayButton piste={{ titre, auteur, media, debut: secondes(debut), fin: secondes(fin) }} />
      <span className="ecouter__info">
        <span className="ecouter__titre">{titre}</span>
        {auteur && <span className="ecouter__auteur">{auteur}</span>}
      </span>
    </div>
  );
}

/* ---------- Blocs « d'atelier » : gothique, presse, archives ---------- */

/** Ouverture de chapitre : un grand chiffre gothique (I, II, 3...), puis le titre. */
function Chapitre({ numero, titre, children }: Enfants & { numero: string | number; titre?: string }) {
  return (
    <header className="chapitre">
      <span className="chapitre__numero" aria-hidden="true">
        {numero}
      </span>
      <span className="chapitre__label">Chapitre {numero}</span>
      <h2 className="chapitre__titre">{titre ?? children}</h2>
    </header>
  );
}

/**
 * Paroles d'un morceau : chaque retour à la ligne du fichier est gardé.
 * Crédit dessous (artiste, morceau, année) et bouton d'écoute si « media » est donné.
 */
function Paroles({ children, artiste, morceau, annee, media, debut, fin }: Enfants & { artiste?: string; morceau?: string; annee?: string | number; media?: string; debut?: string | number; fin?: string | number }) {
  const credit = [artiste, morceau ? `« ${morceau} »` : "", annee].filter(Boolean).join(" · ");
  return (
    <figure className="paroles">
      <span className="paroles__guillemet" aria-hidden="true">
        «
      </span>
      <blockquote className="paroles__texte">{children}</blockquote>
      {(credit || media) && (
        <figcaption className="paroles__credit">
          {media && isPlayable(media) && <PlayButton compact piste={{ titre: morceau ?? "Extrait", auteur: artiste, media, debut: secondes(debut), fin: secondes(fin) }} />}
          <span>{credit}</span>
        </figcaption>
      )}
    </figure>
  );
}

/** Frise : mettre des <Date an="1983">…</Date> à l'intérieur. */
function Chronologie({ children }: Enfants) {
  return <ol className="chronologie">{children}</ol>;
}
function DateFrise({ an, children }: Enfants & { an: string | number }) {
  return (
    <li className="chronologie__date">
      <span className="chronologie__an">{an}</span>
      <div className="chronologie__texte">{children}</div>
    </li>
  );
}

/** Face-à-face : deux <Cote titre="…">…</Cote> séparés par un « vs » gothique. */
function Duel({ children }: Enfants) {
  return (
    <div className="duel">
      {children}
      <span className="duel__vs" aria-hidden="true">
        vs
      </span>
    </div>
  );
}
function Cote({ titre, children }: Enfants & { titre: string }) {
  return (
    <div className="duel__cote">
      <p className="duel__titre">{titre}</p>
      <div className="duel__texte">{children}</div>
    </div>
  );
}

/** Entrée de dictionnaire : le mot en gothique, sa nature, sa prononciation, puis la définition. */
function Definition({ mot, nature, prononciation, children }: Enfants & { mot: string; nature?: string; prononciation?: string }) {
  return (
    <aside className="definition">
      <p className="definition__tete">
        <dfn className="definition__mot">{mot}</dfn>
        {prononciation && <span className="definition__pron">[{prononciation}]</span>}
        {nature && <span className="definition__nature">{nature}</span>}
      </p>
      <div className="definition__texte">{children}</div>
    </aside>
  );
}

/** Note en marge, comme une glose de manuscrit (dans le texte sur petit écran). */
function Marge({ children }: Enfants) {
  return <aside className="marge">{children}</aside>;
}

/** Séparateur orné : une lettre gothique entre deux traits (H par défaut). */
function Ornement({ lettre = "H" }: { lettre?: string }) {
  return (
    <div className="ornement" role="separator">
      <i />
      <span aria-hidden="true">{lettre}</span>
      <i />
    </div>
  );
}

/** Tampon penché, comme un coup d'encre : « Classique », « Coup de cœur »... */
function Tampon({ children, cote = "droite" }: Enfants & { cote?: "gauche" | "centre" | "droite" }) {
  return (
    <div className={`tampon tampon--${cote}`}>
      <span>{children}</span>
    </div>
  );
}

/** Hommage : le nom en grand avec son écho gothique, les années, puis une phrase. */
function Epitaphe({ nom, echo, dates, children }: Enfants & { nom: string; echo?: string; dates?: string }) {
  return (
    <div className="epitaphe">
      <div className="epitaphe__nom">
        <span className="epitaphe__echo" aria-hidden="true">
          {echo ?? nom.split(/\s+/).pop()}
        </span>
        <strong>{nom}</strong>
      </div>
      {dates && <p className="epitaphe__dates">{dates}</p>}
      <i className="epitaphe__trait" />
      {children && <div className="epitaphe__texte">{children}</div>}
    </div>
  );
}

/** Manchette de journal : une bande blanche, le texte en très gros dessus. */
function Manchette({ children, surtitre }: Enfants & { surtitre?: string }) {
  return (
    <div className="manchette">
      {surtitre && <span className="manchette__surtitre">{surtitre}</span>}
      <p className="manchette__texte">{children}</p>
    </div>
  );
}

/* ---------- Dans le texte ---------- */

/** Passage caviardé : une barre noire qui se lève au survol ou au toucher. */
function Censure({ children }: Enfants) {
  return (
    <span className="censure" tabIndex={0} title="Survole ou touche pour lire">
      {children}
    </span>
  );
}


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
  Chapitre,
  Paroles,
  Chronologie,
  Date: DateFrise,
  Duel,
  Cote,
  Definition,
  Marge,
  Ornement,
  Tampon,
  Epitaphe,
  Manchette,
  Censure,
};

/** Options Markdown : barré (~~texte~~), tableaux, liens automatiques. */
export const mdxOptions = {
  mdxOptions: { remarkPlugins: [remarkGfm] },
};
