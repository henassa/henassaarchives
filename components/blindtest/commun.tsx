/* Petits éléments de la direction artistique HENASSA, réutilisés partout. */

/** Titre en Anton avec son « écho » gothique détouré derrière. */
export function EchoTitre({ texte, echo, niveau = 2, centre = false, classe = "" }: { texte: string; echo?: string; niveau?: 1 | 2; centre?: boolean; classe?: string }) {
  const Balise = niveau === 1 ? "h1" : "h2";
  return (
    <div className={`echo-title ${centre ? "echo-title--center" : "echo-title--left"} ${classe}`}>
      <span className="echo-title__echo" aria-hidden="true">
        {echo ?? texte}
      </span>
      <Balise className="echo-title__main">{texte}</Balise>
    </div>
  );
}

/** Pochette carrée qui ne fait jamais sauter la mise en page (taille réservée d'avance). */
export function Pochette({ src, alt = "", classe = "" }: { src?: string; alt?: string; classe?: string }) {
  return (
    <span className={`pochette ${classe}`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} loading="lazy" decoding="async" referrerPolicy="no-referrer" />
      ) : (
        <span className="pochette__vide" aria-hidden="true">
          ?
        </span>
      )}
    </span>
  );
}

/** La mention obligatoire de la source des extraits. */
export function Pied() {
  return <p className="msq-pied">Extraits fournis par Deezer</p>;
}
