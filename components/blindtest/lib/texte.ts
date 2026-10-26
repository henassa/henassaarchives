/*
 * Tout ce qui touche au texte tapé par les joueurs :
 * nettoyage des pseudos et des réponses, et comparaison « tolérante »
 * (accents, majuscules, feat., parenthèses, petites fautes de frappe).
 */

export const PSEUDO_MAX = 16;
export const REPONSE_MAX = 80;

/** Retire les caractères invisibles ou de contrôle, resserre les espaces, coupe à la longueur voulue. */
export function nettoyer(brut: unknown, max: number) {
  if (typeof brut !== "string") return "";
  return brut
    .replace(/[\p{Cc}\p{Cf}\p{Co}\p{Cn}\p{Zl}\p{Zp}]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export const nettoyerPseudo = (brut: unknown) => nettoyer(brut, PSEUDO_MAX);

/** Petits mots qu'on ignore en tête : « The Weeknd » = « Weeknd ». */
const ARTICLES = /^(the|le|la|les|l|a|an|el|los|las|die|der|das) /;

/**
 * Forme « comparable » d'un titre, d'un artiste ou d'une réponse :
 * sans accents ni majuscules, sans ce qui est entre parenthèses ou crochets,
 * sans « feat. X », sans « - Remastered 2011 », sans ponctuation.
 */
export function normaliser(s: string) {
  let t = s.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  t = t.replace(/\([^)]*\)|\[[^\]]*\]/g, " ");
  t = t.replace(/\s(feat|ft|featuring|avec|with)\b\.?.*$/, " ");
  // « Titre - Remastered 2009 », « Titre - Radio Edit » : on garde la partie avant le tiret
  t = t.replace(/\s[-–—]\s.*$/, " ");
  t = t.replace(/&/g, " et ").replace(/\$/g, "s");
  t = t.replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
  t = t.replace(/\bet\b|\band\b|\bn\b/g, " ").replace(/\s+/g, " ").trim();
  const sans = t.replace(ARTICLES, "");
  return sans || t;
}

/** Distance d'édition (inversion de deux lettres = une seule faute). */
export function distance(a: string, b: string) {
  const n = a.length;
  const m = b.length;
  if (!n) return m;
  if (!m) return n;
  const d: number[][] = Array.from({ length: n + 1 }, (_, i) => [i, ...new Array(m).fill(0)]);
  for (let j = 1; j <= m; j++) d[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cout = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cout);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[n][m];
}

/** Nombre de fautes acceptées selon la longueur de la bonne réponse. */
function fautesPermises(longueur: number) {
  if (longueur <= 3) return 0;
  if (longueur <= 7) return 1;
  if (longueur <= 15) return 2;
  return 3;
}

function proche(essai: string, cible: string) {
  if (!essai || !cible) return false;
  if (essai === cible) return true;
  // compare aussi sans espaces : « daftpunk » = « daft punk »
  const e = essai.replace(/ /g, "");
  const c = cible.replace(/ /g, "");
  if (e === c) return true;
  return distance(e, c) <= fautesPermises(c.length);
}

/**
 * La réponse contient-elle la cible ?
 * On accepte la réponse entière, ou un morceau de la réponse : « daft punk one more time »
 * trouve à la fois l'artiste et le titre.
 */
export function correspond(reponse: string, cibles: string[]) {
  const r = normaliser(reponse);
  if (!r) return false;
  const mots = r.split(" ");
  for (const brute of cibles) {
    const c = normaliser(brute);
    if (!c) continue;
    if (proche(r, c)) return true;
    const n = c.split(" ").length;
    for (let taille = Math.max(1, n - 1); taille <= n + 1; taille++) {
      for (let i = 0; i + taille <= mots.length; i++) {
        if (taille === mots.length) continue;
        const bout = mots.slice(i, i + taille).join(" ");
        // un mot isolé très court (« a », « on ») ne doit pas suffire à valider un long titre
        if (bout.length < Math.min(4, c.length)) continue;
        if (proche(bout, c)) return true;
      }
    }
  }
  return false;
}

/** Le titre « principal » sans les parties qu'on ignore, pour l'afficher ou pour le QCM plus tard. */
export function cibleTitre(titre: string) {
  const sansParentheses = titre.replace(/\s*[([][^)\]]*[)\]]\s*/g, " ").trim();
  return [titre, sansParentheses].filter((v, i, l) => v && l.indexOf(v) === i);
}
