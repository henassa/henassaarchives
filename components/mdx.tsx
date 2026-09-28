import type { ReactNode } from "react";

/**
 * Composants utilisables directement dans les fichiers .mdx.
 *
 *   <Citation>Le brouillard ne cachait pas le monde.</Citation>
 *   <Image src="/images/mon-image.jpg" alt="..." legende="..." />
 */

function Citation({ children }: { children: ReactNode }) {
  return <blockquote className="citation">« {children} »</blockquote>;
}

function Figure({ src, alt, legende }: { src: string; alt: string; legende?: string }) {
  return (
    <figure className="figure">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} loading="lazy" />
      {legende && <figcaption>{legende}</figcaption>}
    </figure>
  );
}

export const mdxComponents = {
  Citation,
  Image: Figure,
};
