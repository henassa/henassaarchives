import { PANIER_MAX, valide, type ElementPanier } from "./panier";

/*
 * Partager un panier sans compte ni serveur : le panier entier est rangé dans un code
 * (compressé), qu'on peut coller dans un lien. Le lien ou le code redonne le même panier
 * sur n'importe quel appareil, même des semaines plus tard.
 *
 * Code : « BT1- » + le panier compressé (deflate), en base64 adapté aux adresses.
 * Si le navigateur ne sait pas compresser : « BT0- » + le panier non compressé.
 */

const POCHETTE = /^https:\/\/(?:cdn-images|e-cdns-images)\.dzcdn\.net\/images\/cover\/([0-9a-f]{32})\/250x250-000000-80-0-0\.jpg$/;
const pochetteDe = (md5: string) => `https://cdn-images.dzcdn.net/images/cover/${md5}/250x250-000000-80-0-0.jpg`;
/** Au-delà, on refuse de lire (un code collé par erreur, ou trafiqué). */
const CODE_MAX = 300_000;

function versBase64Url(octets: Uint8Array) {
  let s = "";
  for (let i = 0; i < octets.length; i += 0x8000) s += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function depuisBase64Url(t: string) {
  const s = atob(t.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((t.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

async function transformer(octets: Uint8Array, flux: CompressionStream | DecompressionStream) {
  const sortie = new Blob([octets as BlobPart]).stream().pipeThrough(flux as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  return new Uint8Array(await new Response(sortie).arrayBuffer());
}

/** Le code d'un panier. */
export async function codeDuPanier(panier: ElementPanier[]) {
  // forme courte : [id, titre, artiste, pochette] ; la pochette Deezer réduite à son identifiant
  const court = panier.slice(0, PANIER_MAX).map((t) => {
    const m = POCHETTE.exec(t.pochette);
    return [t.id, t.titre, t.artiste, m ? m[1] : t.pochette];
  });
  const brut = new TextEncoder().encode(JSON.stringify(court));
  if (typeof CompressionStream === "function") {
    try {
      return "BT1-" + versBase64Url(await transformer(brut, new CompressionStream("deflate-raw")));
    } catch {}
  }
  return "BT0-" + versBase64Url(brut);
}

/** Le lien qui ouvre le Blindtest avec ce panier. */
export async function lienDuPanier(panier: ElementPanier[]) {
  return `${window.location.origin}/mini-jeux/blindtest?panier=${await codeDuPanier(panier)}`;
}

/** Retrouve un code dans ce qu'on a collé : le code seul, ou un lien qui le contient. */
export function extraireCode(texte: string) {
  const t = texte.trim();
  const m = /(?:^|[?&]panier=)(BT[01]-[A-Za-z0-9_-]+)/.exec(t);
  return m ? m[1] : null;
}

export const ressembleAUnCode = (texte: string) => extraireCode(texte) !== null;

/** Le panier contenu dans un code (ou un lien). null si le code est abîmé. */
export async function panierDuCode(texte: string): Promise<ElementPanier[] | null> {
  const code = extraireCode(texte);
  if (!code || code.length > CODE_MAX) return null;
  try {
    let octets = depuisBase64Url(code.slice(4));
    if (code.startsWith("BT1-")) octets = await transformer(octets, new DecompressionStream("deflate-raw"));
    const court = JSON.parse(new TextDecoder().decode(octets));
    if (!Array.isArray(court)) return null;
    const l = valide(
      court.map((x: unknown) => {
        const [id, titre, artiste, p] = Array.isArray(x) ? x : [];
        const pochette = typeof p === "string" ? (/^[0-9a-f]{32}$/.test(p) ? pochetteDe(p) : p) : "";
        return { id: String(id ?? ""), titre, artiste, pochette };
      })
    );
    return l.length ? l : null;
  } catch {
    return null;
  }
}
