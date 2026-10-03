"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { OeuvreJeu } from "@/lib/jeux";
import { PlayButton } from "@/components/player/Lecteur";
import { SECTIONS, TYPES_OEUVRE } from "@/lib/sections";
import { ChoixPartie, Mosaique, copier, ecrire, jourLisible, lire, useOeuvreATrouver } from "./commun";

/*
 * Le mot : on devine le titre d'une œuvre, lettre par lettre.
 * - vert : bonne lettre, bonne place ; jaune : lettre présente ailleurs ; gris : absente ;
 * - les espaces et la ponctuation sont donnés d'office ;
 * - la pochette, en mosaïque au départ, devient plus nette à chaque essai.
 */

/** Nombre d'essais. */
const ESSAIS = 6;
/** Netteté de la pochette à chaque essai (nombre de carrés par côté). */
const NETTETE = [5, 8, 12, 18, 28, 44];
/** Titres jouables : entre 3 et 18 lettres. */
const MIN_LETTRES = 3, MAX_LETTRES = 18;

const CLAVIER = ["AZERTYUIOP", "QSDFGHJKLM", "WXCVBN"];
const CHIFFRES = "1234567890";

type Etat = "ok" | "ailleurs" | "absent";
type Sauvegarde = { essais: string[] };

/** « Awaken, My Love! » → AWAKEN, MY LOVE! (sans accents) */
function normaliser(titre: string) {
  return titre
    .replace(/œ/gi, "oe")
    .replace(/æ/gi, "ae")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
const estCase = (c: string) => /[A-Z0-9]/.test(c);
const lettresDe = (t: string) => [...normaliser(t)].filter(estCase);

function jouable(o: OeuvreJeu) {
  const n = lettresDe(o.titre).length;
  return n >= MIN_LETTRES && n <= MAX_LETTRES;
}

/** Compare un essai à la réponse (mêmes règles que Wordle pour les lettres en double). */
function evaluer(essai: string[], reponse: string[]): Etat[] {
  const res: Etat[] = essai.map(() => "absent");
  const reste = new Map<string, number>();
  reponse.forEach((c, i) => {
    if (essai[i] === c) res[i] = "ok";
    else reste.set(c, (reste.get(c) ?? 0) + 1);
  });
  essai.forEach((c, i) => {
    if (res[i] === "ok") return;
    const n = reste.get(c) ?? 0;
    if (n > 0) {
      res[i] = "ailleurs";
      reste.set(c, n - 1);
    }
  });
  return res;
}

export function LeMot({ oeuvres }: { oeuvres: OeuvreJeu[] }) {
  const j = useOeuvreATrouver(oeuvres, jouable, 1);
  const cible = j.cible;
  const [essais, setEssais] = useState<string[]>([]);
  const [saisie, setSaisie] = useState("");
  const [secoue, setSecoue] = useState(false);
  const [copie, setCopie] = useState<"" | "ok" | "non">("");

  const modele = useMemo(() => (cible ? [...normaliser(cible.titre)] : []), [cible]);
  const reponse = useMemo(() => modele.filter(estCase), [modele]);
  const cleStock = j.mode === "jour" && j.jour ? `henassa-mot-${j.jour}` : null;

  // Nouvelle œuvre : on repart de zéro (ou on reprend la partie du jour déjà commencée)
  useEffect(() => {
    setSaisie("");
    setCopie("");
    const s = cleStock ? lire<Sauvegarde>(cleStock) : null;
    setEssais(s?.essais?.filter((e) => e.length === reponse.length) ?? []);
  }, [cible?.cle, j.manche, cleStock, reponse.length]);

  const gagne = essais.some((e) => e === reponse.join(""));
  const fini = gagne || essais.length >= ESSAIS;
  const resultats = useMemo(() => essais.map((e) => evaluer([...e], reponse)), [essais, reponse]);

  // Meilleur état connu de chaque touche du clavier
  const touches = useMemo(() => {
    const m = new Map<string, Etat>();
    const rang = { absent: 0, ailleurs: 1, ok: 2 };
    essais.forEach((e, i) =>
      [...e].forEach((c, k) => {
        const r = resultats[i]![k]!;
        if (!m.has(c) || rang[r] > rang[m.get(c)!]) m.set(c, r);
      })
    );
    return m;
  }, [essais, resultats]);

  const taper = useCallback(
    (c: string) => {
      if (fini || !cible) return;
      if (c === "⌫") return setSaisie((s) => s.slice(0, -1));
      if (c === "⏎") {
        if (saisie.length < reponse.length) {
          setSecoue(true);
          setTimeout(() => setSecoue(false), 400);
          return;
        }
        const suite = [...essais, saisie];
        setEssais(suite);
        setSaisie("");
        if (cleStock) ecrire(cleStock, { essais: suite });
        return;
      }
      if (estCase(c)) setSaisie((s) => (s.length < reponse.length ? s + c : s));
    },
    [fini, cible, saisie, reponse.length, essais, cleStock]
  );

  // Clavier physique
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      // champs de saisie et menus de filtres : on les laisse tranquilles
      if (el?.closest("input, select, textarea, .jf-menu")) return;
      const lettre = e.key.length === 1 ? normaliser(e.key) : "";
      const jeu = e.key === "Enter" || e.key === "Backspace" || (lettre.length === 1 && estCase(lettre));
      if (!jeu || fini) return;
      // Pendant la partie, ces touches ne servent qu'à la grille : si un bouton
      // (« Nouvelle œuvre », « Partie libre »...) avait gardé le focus, Entrée
      // l'aurait déclenché et aurait changé d'œuvre au lieu de valider l'essai.
      e.preventDefault();
      e.stopPropagation();
      if (el?.closest("button, a")) el.blur();
      taper(e.key === "Enter" ? "⏎" : e.key === "Backspace" ? "⌫" : lettre);
    };
    // en « capture » : on passe avant le bouton qui a le focus
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [taper, fini]);

  if (!j.nbJouables) return <p className="mj-vide">Pas encore assez d&apos;œuvres pour jouer.</p>;

  // Une ligne de la grille : les cases suivent la forme du titre (mots, ponctuation)
  const ligne = (lettres: string[], etats: Etat[] | null, active: boolean, cle: string) => {
    let k = 0;
    const mots: React.ReactNode[][] = [[]];
    modele.forEach((c, i) => {
      if (c === " ") return void mots.push([]);
      if (!estCase(c)) return void mots[mots.length - 1]!.push(<span key={i} className="mot-fixe">{c}</span>);
      const idx = k++;
      const l = lettres[idx] ?? "";
      mots[mots.length - 1]!.push(
        <span key={i} className={`mot-case${etats ? ` is-${etats[idx]}` : ""}${l && !etats ? " is-remplie" : ""}${active && idx === lettres.length ? " is-curseur" : ""}`}>
          {l}
        </span>
      );
    });
    return (
      <div key={cle} className={`mot-ligne${active && secoue ? " is-secoue" : ""}`} style={{ ["--n" as string]: Math.max(reponse.length, 5), ["--g" as string]: `${(modele.length - 1) * 4 + (modele.filter((c) => c === " ").length) * 12}px` }}>
        {mots.map((m, i) => (
          <span key={i} className="mot-mot">
            {m}
          </span>
        ))}
      </div>
    );
  };

  const nettete = fini ? 0 : NETTETE[Math.min(essais.length, NETTETE.length - 1)]!;
  const partage = () => {
    const carres = resultats.map((r) => r.map((e) => (e === "ok" ? "🟩" : e === "ailleurs" ? "🟨" : "⬛")).join("")).join("\n");
    const tete = `Henassa · Le mot${j.mode === "jour" && j.jour ? " · " + jourLisible(j.jour) : ""} · ${gagne ? essais.length : "X"}/${ESSAIS}`;
    copier(`${tete}\n${carres}`).then((ok) => setCopie(ok ? "ok" : "non"));
  };

  return (
    <div className="mj mot">
      <ChoixPartie j={j} id="mot" />
      {!cible ? (
        <p className="mj-vide">{j.mode === "libre" ? "Aucune œuvre ne correspond à ces filtres." : "Chargement…"}</p>
      ) : (
        <div className="mot-jeu">
          <div className="mot-gauche">
            <Mosaique o={cible} cases={nettete} />
            <p className="mj-indice">
              {TYPES_OEUVRE[cible.type].label} · {reponse.length} lettres{modele.includes(" ") ? ` · ${modele.join("").split(" ").length} mots` : ""}
            </p>
          </div>
          <div className="mot-droite">
            <div className="mot-grille" aria-label="Essais">
              {essais.map((e, i) => ligne([...e], resultats[i]!, false, `e${i}`))}
              {!fini && ligne([...saisie], null, true, "saisie")}
              {!fini && Array.from({ length: ESSAIS - essais.length - 1 }, (_, i) => ligne([], null, false, `v${i}`))}
            </div>

            {fini ? (
              <div className="mj-fin" role="status">
                <p className="mj-fin__verdict">{gagne ? `Trouvé en ${essais.length} essai${essais.length > 1 ? "s" : ""}` : "Raté"}</p>
                <h2 className="mj-fin__titre">{cible.titre}</h2>
                <p className="mj-fin__auteur">
                  {cible.auteur}
                  {cible.annee ? ` · ${cible.annee}` : ""}
                </p>
                <div className="mj-fin__actions">
                  {cible.media && <PlayButton piste={{ titre: cible.titre, auteur: cible.auteur, cover: cible.cover, media: cible.media, slug: cible.cle }} />}
                  <Link className="ctrl-btn ctrl-btn--text mj-lien" href={`${SECTIONS.connexions.href}?oeuvre=${cible.cle}`}>
                    Voir sa fiche
                  </Link>
                  <button type="button" className="ctrl-btn ctrl-btn--text" onClick={partage}>
                    {copie === "ok" ? "Copié !" : "Copier le résultat"}
                  </button>
                  <button type="button" className="ctrl-btn ctrl-btn--text" onClick={() => (j.mode === "libre" ? j.tirer() : j.changerMode("libre"))}>
                    {j.mode === "libre" ? "Rejouer" : "Partie libre"}
                  </button>
                </div>
                {copie === "non" && <p className="mj-note">La copie a été refusée par le navigateur.</p>}
                {j.mode === "jour" && <p className="mj-note">Une nouvelle œuvre du jour arrive à minuit.</p>}
              </div>
            ) : (
              <div className="mot-clavier" aria-label="Clavier">
                <div className="mot-rang mot-rang--chiffres">
                  {[...CHIFFRES].map((c) => (
                    <button key={c} type="button" className={`mot-touche${touches.has(c) ? ` is-${touches.get(c)}` : ""}`} onClick={() => taper(c)}>
                      {c}
                    </button>
                  ))}
                </div>
                {CLAVIER.map((rang, r) => (
                  <div key={rang} className="mot-rang">
                    {r === 2 && (
                      <button type="button" className="mot-touche mot-touche--large" onClick={() => taper("⏎")} aria-label="Valider">
                        Valider
                      </button>
                    )}
                    {[...rang].map((c) => (
                      <button key={c} type="button" className={`mot-touche${touches.has(c) ? ` is-${touches.get(c)}` : ""}`} onClick={() => taper(c)}>
                        {c}
                      </button>
                    ))}
                    {r === 2 && (
                      <button type="button" className="mot-touche mot-touche--large" onClick={() => taper("⌫")} aria-label="Effacer">
                        ⌫
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
