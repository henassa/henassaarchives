import fs from "node:fs";
import path from "node:path";
import { isTypeOeuvre, type TypeOeuvre } from "./sections";

export const CONNEXIONS_FILE = path.join(process.cwd(), "content", "connexions.json");

/*
 * Format du fichier content/connexions.json :
 *
 * {
 *   "oeuvres": [
 *     {
 *       "id": "barter-6",                 ← identifiant lisible, unique
 *       "titre": "Barter 6",
 *       "auteur": "Young Thug",
 *       "annee": 2015,
 *       "type": "album",
 *       "liens": ["so-much-fun", "slime-language-2"]
 *     }
 *   ]
 * }
 *
 * Un lien n'a besoin d'être écrit que d'un seul côté : si A cite B,
 * B est automatiquement relié à A. L'admin, elle, l'écrit des deux côtés
 * pour que chaque œuvre montre toutes ses connexions.
 *
 * Dans le code, chaque œuvre reçoit en plus un numéro interne (id).
 */

export type Oeuvre = {
  /** Numéro interne, attribué au chargement. */
  id: number;
  /** Identifiant lisible utilisé dans le fichier et dans les adresses. */
  slug?: string;
  titre: string;
  auteur: string;
  annee?: number;
  type: TypeOeuvre;
  genre?: string;
  cover?: string;
  /** Lien YouTube, fichier audio (/audio/x.mp3) ou n'importe quelle URL. */
  media?: string;
  description?: string;
};

export type Lien = {
  a: number;
  b: number;
};

export type ConnexionsData = {
  oeuvres: Oeuvre[];
  liens: Lien[];
};

export function slugify(s: string) {
  return (
    s
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "oeuvre"
  );
}

function str(v: unknown) {
  return v === undefined || v === null || v === "" ? undefined : String(v);
}

export function readConnexions(): ConnexionsData {
  if (!fs.existsSync(CONNEXIONS_FILE)) return { oeuvres: [], liens: [] };
  const raw = JSON.parse(fs.readFileSync(CONNEXIONS_FILE, "utf8"));
  const rawOeuvres: Record<string, unknown>[] = Array.isArray(raw.oeuvres) ? raw.oeuvres : [];

  // Chaque œuvre reçoit un numéro interne ; on garde la correspondance
  // avec l'identifiant écrit dans le fichier.
  const byKey = new Map<string, number>();
  const oeuvres: Oeuvre[] = rawOeuvres.map((r, i) => {
    const id = i + 1;
    const slug = str(r.id) ?? slugify(String(r.titre ?? `oeuvre-${id}`));
    byKey.set(slug, id);
    return {
      id,
      slug,
      titre: String(r.titre ?? ""),
      auteur: String(r.auteur ?? ""),
      annee: r.annee ? Number(r.annee) : undefined,
      type: isTypeOeuvre(r.type) ? r.type : "autre",
      genre: str(r.genre),
      cover: str(r.cover),
      media: str(r.media),
      description: str(r.description),
    };
  });

  const seen = new Set<string>();
  const liens: Lien[] = [];
  const add = (a?: number, b?: number) => {
    if (!a || !b || a === b) return;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (seen.has(key)) return;
    seen.add(key);
    liens.push({ a, b });
  };

  rawOeuvres.forEach((r, i) => {
    const targets = Array.isArray(r.liens) ? r.liens : [];
    for (const t of targets) add(i + 1, byKey.get(String(t)));
  });

  // Ancien format ({ "liens": [{ "a": 1, "b": 2 }] } à la racine), toujours accepté.
  if (Array.isArray(raw.liens)) {
    for (const l of raw.liens) add(byKey.get(String(l.a)), byKey.get(String(l.b)));
  }

  return { oeuvres, liens };
}

/**
 * Modèle affiché en haut du fichier, avec tous les champs possibles.
 * Il est ignoré par le site et réécrit à chaque enregistrement de l'admin.
 */
const MODELE = {
  _info: "Modèle : copie ce bloc dans « oeuvres » pour ajouter une œuvre. Ce bloc-ci n'est pas affiché sur le site.",
  id: "identifiant-unique (obligatoire, minuscules et tirets, ex : barter-6)",
  titre: "Titre de l'œuvre (obligatoire)",
  auteur: "Artiste, réalisateur, studio, écrivain... (obligatoire)",
  annee: 2024,
  type: "album | film | jeu | livre | autre (obligatoire)",
  genre: "Hip-Hop, science-fiction, RPG...",
  cover: "/images/oeuvres/nom-de-l-image.jpg",
  media: "https://www.youtube.com/watch?v=... (ou /audio/extrait.mp3)",
  description: "Une ou deux phrases, affichées dans la fiche de l'œuvre.",
  liens: ["id-d-une-autre-oeuvre", "id-d-une-troisieme"],
};

export function writeConnexions(data: ConnexionsData) {
  // Identifiants lisibles et uniques
  const used = new Set<string>();
  const slugOf = new Map<number, string>();
  for (const o of data.oeuvres) {
    const base = o.slug?.trim() ? slugify(o.slug) : slugify(o.titre);
    let s = base;
    let n = 2;
    while (used.has(s)) s = `${base}-${n++}`;
    used.add(s);
    slugOf.set(o.id, s);
  }

  const voisins = new Map<number, number[]>();
  for (const l of data.liens) {
    if (!slugOf.has(l.a) || !slugOf.has(l.b) || l.a === l.b) continue;
    voisins.set(l.a, [...(voisins.get(l.a) ?? []), l.b]);
    voisins.set(l.b, [...(voisins.get(l.b) ?? []), l.a]);
  }
  const order = new Map(data.oeuvres.map((o, i) => [o.id, i]));

  const out = {
    _modele: MODELE,
    oeuvres: data.oeuvres.map((o) => {
      const r: Record<string, unknown> = { id: slugOf.get(o.id), titre: o.titre, auteur: o.auteur };
      if (o.annee) r.annee = o.annee;
      r.type = o.type;
      if (o.genre) r.genre = o.genre;
      if (o.cover) r.cover = o.cover;
      if (o.media) r.media = o.media;
      if (o.description) r.description = o.description;
      const v = [...new Set(voisins.get(o.id) ?? [])].sort((a, b) => order.get(a)! - order.get(b)!);
      r.liens = v.map((id) => slugOf.get(id));
      return r;
    }),
  };

  // Les listes de liens tiennent sur une ligne pour rester lisibles.
  const json = JSON.stringify(out, null, 2).replace(/"liens": \[([^\]]*)\]/g, (_m, inner: string) => {
    const items = inner
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return `"liens": [${items.join(", ")}]`;
  });
  fs.writeFileSync(CONNEXIONS_FILE, json + "\n");
}