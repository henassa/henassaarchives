"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DonneesParcours, OeuvreParcours } from "@/lib/jeux";
import { Pochette } from "@/components/connexions/Pochette";
import { TYPES_OEUVRE } from "@/lib/sections";
import { Mosaique } from "@/components/jeux/commun";
import {
  SCORE_MAX,
  creditsDe,
  estLettre,
  nomCritere,
  normaliserTitre,
  reponsesCase,
  respecte,
  sansAccents,
  type Graphe,
  type Manche,
  type Resultat,
} from "./moteur";

/*
 * Les six épreuves du Parcours. Chacune reçoit sa manche, se joue seule,
 * montre la réponse à la fin et renvoie un score sur 1000 avec « finir ».
 * « tempsEcoule » (multijoueur) : on arrête tout et on montre la réponse ;
 * « partiel » garde à jour ce que vaut la manche si le temps s'arrête là.
 */

export type PropsEpreuve<M extends Manche = Manche> = {
  m: M;
  d: DonneesParcours;
  g: Graphe;
  parCle: Map<string, OeuvreParcours>;
  /** Toutes les œuvres de l'univers, pour les propositions. */
  univers: OeuvreParcours[];
  finir: (r: Resultat) => void;
  partiel?: React.MutableRefObject<Resultat>;
  tempsEcoule?: boolean;
};

/* ---------- Petits morceaux communs ---------- */

/** Une œuvre en petit : pochette, titre, artiste. */
function Vignette({ o, annee, className = "" }: { o: OeuvreParcours; annee?: boolean; className?: string }) {
  return (
    <span className={`pc-vignette ${className}`} style={{ ["--type" as string]: TYPES_OEUVRE[o.type].couleur }}>
      <span className="pc-vignette__cover">
        <Pochette o={o} alt="" petite />
      </span>
      <span className="pc-vignette__txt">
        <span className="pc-vignette__titre">{o.titre}</span>
        <span className="pc-vignette__auteur">
          {o.auteur}
          {annee && o.annee ? ` · ${o.annee}` : ""}
        </span>
      </span>
    </span>
  );
}

/** Champ « tape un titre ou un artiste » avec les propositions dessous. */
function ChoixOeuvre({ oeuvres, exclure, choisir, placeholder = "Tape un titre ou un artiste…", id }: { oeuvres: OeuvreParcours[]; exclure?: Set<string>; choisir: (cle: string) => void; placeholder?: string; id: string }) {
  const [q, setQ] = useState("");
  const [actif, setActif] = useState(0);
  const propositions = useMemo(() => {
    const n = sansAccents(q.trim());
    if (n.length < 2) return [];
    return oeuvres.filter((o) => !exclure?.has(o.cle) && sansAccents(`${o.titre} ${o.auteur}`).includes(n)).slice(0, 8);
  }, [q, oeuvres, exclure]);
  useEffect(() => setActif(0), [q]);
  const valider = (cle: string) => {
    choisir(cle);
    setQ("");
  };
  return (
    <div className="pc-choix">
      <label className="search dv-champ pc-choix__champ">
        <span className="visually-hidden">Ta réponse</span>
        <input
          id={id}
          type="search"
          autoComplete="off"
          placeholder={placeholder}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") (e.preventDefault(), setActif((a) => Math.min(propositions.length - 1, a + 1)));
            if (e.key === "ArrowUp") (e.preventDefault(), setActif((a) => Math.max(0, a - 1)));
            if (e.key === "Enter" && propositions[actif]) (e.preventDefault(), valider(propositions[actif]!.cle));
          }}
        />
      </label>
      {propositions.length > 0 && (
        <ul className="dv-suggestions">
          {propositions.map((o, i) => (
            <li key={o.cle}>
              <button type="button" className={i === actif ? "is-actif" : ""} onClick={() => valider(o.cle)}>
                <span className="dv-suggestions__titre">{o.titre}</span>
                <span className="dv-suggestions__auteur">{o.auteur}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim().length >= 2 && propositions.length === 0 && <p className="mj-note">Aucune œuvre du site ne correspond.</p>}
    </div>
  );
}

/** La réponse, une fois la manche finie. */
function Revelation({ o, verdict }: { o: OeuvreParcours; verdict: string }) {
  return (
    <div className="mj-fin pc-revelation" role="status">
      <p className="mj-fin__verdict">{verdict}</p>
      <Mosaique o={o} cases={0} className="dv-reponse" />
      <h2 className="mj-fin__titre">{o.titre}</h2>
      <p className="mj-fin__auteur">
        {o.auteur}
        {o.annee ? ` · ${o.annee}` : ""}
      </p>
    </div>
  );
}

/** Appelle « finir » une seule fois. */
function useFinUnique(finir: (r: Resultat) => void) {
  const fait = useRef(false);
  return useCallback(
    (r: Resultat) => {
      if (fait.current) return;
      fait.current = true;
      finir(r);
    },
    [finir]
  );
}

/* ---------- Le mot ---------- */

const ESSAIS_MOT = 6;
const NETTETE_MOT = [5, 8, 12, 18, 28, 44];
const CLAVIER = ["AZERTYUIOP", "QSDFGHJKLM", "WXCVBN"];
const CHIFFRES = "1234567890";
type EtatLettre = "ok" | "ailleurs" | "absent";

/** Compare un essai à la réponse (mêmes règles que Wordle pour les lettres en double). */
function evaluer(essai: string[], reponse: string[]): EtatLettre[] {
  const res: EtatLettre[] = essai.map(() => "absent");
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

export function EpreuveMot({ m, parCle, finir, partiel, tempsEcoule }: PropsEpreuve<Extract<Manche, { e: "mot" }>>) {
  const cible = parCle.get(m.cible)!;
  const fin = useFinUnique(finir);
  const [essais, setEssais] = useState<string[]>([]);
  const [saisie, setSaisie] = useState("");
  const [secoue, setSecoue] = useState(false);
  const modele = useMemo(() => [...normaliserTitre(cible.titre)], [cible]);
  const reponse = useMemo(() => modele.filter(estLettre), [modele]);

  const gagne = essais.some((e) => e === reponse.join(""));
  const fini = gagne || essais.length >= ESSAIS_MOT;
  const arrete = fini || !!tempsEcoule;
  const resultats = useMemo(() => essais.map((e) => evaluer([...e], reponse)), [essais, reponse]);
  useEffect(() => {
    if (partiel) partiel.current = { score: 0, resume: "Pas trouvé à temps" };
  });

  useEffect(() => {
    if (!fini) return;
    const n = essais.length;
    fin(gagne ? { score: Math.round((SCORE_MAX * (ESSAIS_MOT + 1 - n)) / ESSAIS_MOT), resume: `Trouvé en ${n} essai${n > 1 ? "s" : ""}` } : { score: 0, resume: "Pas trouvé" });
  }, [fini, gagne, essais.length, fin]);

  const touches = useMemo(() => {
    const t = new Map<string, EtatLettre>();
    const rang = { absent: 0, ailleurs: 1, ok: 2 };
    essais.forEach((e, i) => [...e].forEach((c, k) => {
      const r = resultats[i]![k]!;
      if (!t.has(c) || rang[r] > rang[t.get(c)!]) t.set(c, r);
    }));
    return t;
  }, [essais, resultats]);

  const taper = useCallback(
    (c: string) => {
      if (arrete) return;
      if (c === "⌫") return setSaisie((s) => s.slice(0, -1));
      if (c === "⏎") {
        if (saisie.length < reponse.length) {
          setSecoue(true);
          setTimeout(() => setSecoue(false), 400);
          return;
        }
        setEssais((e) => [...e, saisie]);
        setSaisie("");
        return;
      }
      if (estLettre(c)) setSaisie((s) => (s.length < reponse.length ? s + c : s));
    },
    [arrete, saisie, reponse.length]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, select, textarea, .jf-menu")) return;
      const lettre = e.key.length === 1 ? normaliserTitre(e.key) : "";
      const utile = e.key === "Enter" || e.key === "Backspace" || (lettre.length === 1 && estLettre(lettre));
      if (!utile || arrete) return;
      e.preventDefault();
      e.stopPropagation();
      if (el?.closest("button, a")) el.blur();
      taper(e.key === "Enter" ? "⏎" : e.key === "Backspace" ? "⌫" : lettre);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [taper, arrete]);

  const ligne = (lettres: string[], etats: EtatLettre[] | null, active: boolean, cle: string) => {
    let k = 0;
    const mots: React.ReactNode[][] = [[]];
    modele.forEach((c, i) => {
      if (c === " ") return void mots.push([]);
      if (!estLettre(c)) return void mots[mots.length - 1]!.push(<span key={i} className="mot-fixe">{c}</span>);
      const idx = k++;
      const l = lettres[idx] ?? "";
      mots[mots.length - 1]!.push(
        <span key={i} className={`mot-case${etats ? ` is-${etats[idx]}` : ""}${l && !etats ? " is-remplie" : ""}${active && idx === lettres.length ? " is-curseur" : ""}`}>
          {l}
        </span>
      );
    });
    return (
      <div key={cle} className={`mot-ligne${active && secoue ? " is-secoue" : ""}`} style={{ ["--n" as string]: Math.max(reponse.length, 5), ["--g" as string]: `${(modele.length - 1) * 4 + modele.filter((c) => c === " ").length * 12}px` }}>
        {mots.map((x, i) => (
          <span key={i} className="mot-mot">
            {x}
          </span>
        ))}
      </div>
    );
  };

  const nettete = arrete ? 0 : NETTETE_MOT[Math.min(essais.length, NETTETE_MOT.length - 1)]!;
  return (
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
          {!arrete && ligne([...saisie], null, true, "saisie")}
          {!arrete && Array.from({ length: ESSAIS_MOT - essais.length - 1 }, (_, i) => ligne([], null, false, `v${i}`))}
        </div>
        {arrete ? (
          <div className="mj-fin" role="status">
            <p className="mj-fin__verdict">{gagne ? `Trouvé en ${essais.length} essai${essais.length > 1 ? "s" : ""}` : tempsEcoule && !fini ? "Temps écoulé" : "Raté"}</p>
            <h2 className="mj-fin__titre">{cible.titre}</h2>
            <p className="mj-fin__auteur">
              {cible.auteur}
              {cible.annee ? ` · ${cible.annee}` : ""}
            </p>
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
  );
}

/* ---------- Devine l'œuvre et Les crédits : un indice de plus à chaque essai ---------- */

type Indice = { nom: string; contenu: (rang: number, visibles: number, arrete: boolean) => React.ReactNode };

function JeuIndices({ cible, indices, univers, finir, partiel, tempsEcoule, parCle, id }: { cible: OeuvreParcours; indices: Indice[]; univers: OeuvreParcours[]; finir: (r: Resultat) => void; partiel?: React.MutableRefObject<Resultat>; tempsEcoule?: boolean; parCle: Map<string, OeuvreParcours>; id: string }) {
  const fin = useFinUnique(finir);
  /** Une clé par essai ; "" = « je passe ». */
  const [essais, setEssais] = useState<string[]>([]);
  const gagne = essais.includes(cible.cle);
  const fini = gagne || essais.length >= indices.length;
  const arrete = fini || !!tempsEcoule;
  const visibles = arrete ? indices.length : Math.min(indices.length, essais.length + 1);
  const deja = useMemo(() => new Set(essais), [essais]);
  useEffect(() => {
    if (partiel) partiel.current = { score: 0, resume: "Pas trouvé à temps" };
  });

  useEffect(() => {
    if (!fini) return;
    const k = essais.length, n = indices.length;
    fin(gagne ? { score: Math.round((SCORE_MAX * (n - k + 1)) / n), resume: `Trouvé avec ${k} indice${k > 1 ? "s" : ""} sur ${n}` } : { score: 0, resume: "Pas trouvé" });
  }, [fini, gagne, essais.length, indices.length, fin]);

  const proposer = (cle: string) => {
    if (!arrete) setEssais((e) => [...e, cle]);
  };

  return (
    <div className="dv-jeu">
      <ol className="dv-indices">
        {indices.map((ind, k) => (
          <li key={ind.nom} className={`dv-indice${k < visibles ? " is-ouvert" : ""}`}>
            <span className="dv-indice__num">{k + 1}</span>
            <span className="dv-indice__nom">{ind.nom}</span>
            <div className="dv-indice__contenu">{k < visibles ? ind.contenu(k, visibles, arrete) : <span className="dv-cache">Encore {k - visibles + 1} essai{k - visibles + 1 > 1 ? "s" : ""}</span>}</div>
          </li>
        ))}
      </ol>
      <div className="dv-cote">
        {arrete ? (
          <Revelation o={cible} verdict={gagne ? `Trouvé avec ${essais.length} indice${essais.length > 1 ? "s" : ""}` : tempsEcoule && !fini ? "Temps écoulé" : "Raté"} />
        ) : (
          <div className="dv-saisie">
            <p className="mj-indice">
              {TYPES_OEUVRE[cible.type].label} à trouver · essai {essais.length + 1} / {indices.length}
            </p>
            <ChoixOeuvre oeuvres={univers} exclure={deja} choisir={proposer} id={id} />
            <button type="button" className="ctrl-btn ctrl-btn--text dv-passer" onClick={() => proposer("")}>
              {essais.length + 1 >= indices.length ? "Je donne ma langue au chat" : "Passer : indice suivant"}
            </button>
          </div>
        )}
        {essais.length > 0 && (
          <ul className="dv-essais" aria-label="Tes essais">
            {essais.map((c, k) => {
              const o = c ? parCle.get(c) : undefined;
              const bon = c === cible.cle;
              return (
                <li key={k} className={bon ? "is-bon" : "is-rate"}>
                  <span aria-hidden="true">{bon ? "✓" : "✕"}</span> {o ? `${o.titre} — ${o.auteur}` : "Passé"}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

const NETTETE_POCHETTE = [9, 14, 22];
function indicePochette(cible: OeuvreParcours): Indice {
  return {
    nom: "Pochette",
    contenu: (rang, visibles, arrete) => <Mosaique o={cible} cases={arrete ? 0 : NETTETE_POCHETTE[Math.min(Math.max(0, visibles - 1 - rang), NETTETE_POCHETTE.length - 1)]!} className="dv-pochette" />,
  };
}
const puces = (l: string[]) => (
  <span className="dv-chips">
    {l.map((s) => (
      <span key={s}>{s}</span>
    ))}
  </span>
);

export function EpreuveDevine({ m, parCle, univers, finir, partiel, tempsEcoule }: PropsEpreuve<Extract<Manche, { e: "devine" }>>) {
  const cible = parCle.get(m.cible)!;
  const indices = useMemo(() => {
    const l: Indice[] = [{ nom: "Genre", contenu: () => <span className="dv-gros">{cible.genre}</span> }];
    const sg = cible.sousGenres.filter((s) => s !== cible.genre);
    if (sg.length) l.push({ nom: "Sous-genres", contenu: () => puces(sg) });
    const liees = cible.liees.map((c) => parCle.get(c)).filter(Boolean) as OeuvreParcours[];
    if (liees.length)
      l.push({
        nom: "Œuvres reliées",
        contenu: () => (
          <ul className="dv-liees">
            {liees.map((o) => (
              <li key={o.cle} title={`${o.titre} — ${o.auteur}`}>
                <span className="dv-liees__cover">
                  <Pochette o={o} alt="" petite />
                </span>
                <span className="dv-liees__titre">{o.titre}</span>
              </li>
            ))}
          </ul>
        ),
      });
    if (cible.annee) l.push({ nom: "Année", contenu: () => <span className="dv-gros">{cible.annee}</span> });
    if (cible.cover) l.push(indicePochette(cible));
    return l;
  }, [cible, parCle]);
  return <JeuIndices cible={cible} indices={indices} univers={univers} finir={finir} partiel={partiel} tempsEcoule={tempsEcoule} parCle={parCle} id="pc-devine" />;
}

export function EpreuveCredits({ m, parCle, univers, finir, partiel, tempsEcoule }: PropsEpreuve<Extract<Manche, { e: "credits" }>>) {
  const cible = parCle.get(m.cible)!;
  const indices = useMemo(() => {
    const c = creditsDe(cible);
    const l: Indice[] = [];
    if (c.producteurs.length) l.push({ nom: "Production", contenu: () => puces(c.producteurs.slice(0, 8)) });
    if (c.featurings.length) l.push({ nom: "Invités", contenu: () => puces(c.featurings.slice(0, 8)) });
    if (c.labels.length) l.push({ nom: "Label", contenu: () => puces(c.labels.slice(0, 4)) });
    if (cible.annee) l.push({ nom: "Année", contenu: () => <span className="dv-gros">{cible.annee}</span> });
    const genres = [...new Set([cible.genre, ...cible.sousGenres].filter(Boolean) as string[])];
    if (genres.length) l.push({ nom: "Genres", contenu: () => puces(genres) });
    if (cible.cover) l.push(indicePochette(cible));
    return l;
  }, [cible]);
  return <JeuIndices cible={cible} indices={indices} univers={univers} finir={finir} partiel={partiel} tempsEcoule={tempsEcoule} parCle={parCle} id="pc-credits" />;
}

/* ---------- Chronologie ---------- */

export function EpreuveChrono({ m, parCle, finir, partiel, tempsEcoule }: PropsEpreuve<Extract<Manche, { e: "chrono" }>>) {
  const fin = useFinUnique(finir);
  const [ordre, setOrdre] = useState(m.ordre);
  const [valide, setValide] = useState(false);
  const arrete = valide || !!tempsEcoule;
  const oeuvres = ordre.map((c) => parCle.get(c)!);
  const juste = useMemo(() => [...m.ordre].sort((a, b) => (parCle.get(a)!.annee ?? 0) - (parCle.get(b)!.annee ?? 0)), [m.ordre, parCle]);
  useEffect(() => {
    if (partiel) partiel.current = { score: 0, resume: "Pas validé à temps" };
  });

  const deplacer = (i: number, sens: -1 | 1) => {
    const j = i + sens;
    if (arrete || j < 0 || j >= ordre.length) return;
    const n = [...ordre];
    [n[i], n[j]] = [n[j]!, n[i]!];
    setOrdre(n);
  };
  const valider = () => {
    if (arrete) return;
    setValide(true);
    // paires dans le bon ordre moins paires inversées : un ordre au hasard vaut 0, le bon ordre 1000
    let bonnes = 0, total = 0;
    for (let i = 0; i < ordre.length; i++) for (let j = i + 1; j < ordre.length; j++) {
      total++;
      if ((parCle.get(ordre[i]!)!.annee ?? 0) < (parCle.get(ordre[j]!)!.annee ?? 0)) bonnes++;
    }
    const places = ordre.filter((c, i) => c === juste[i]).length;
    fin({ score: Math.max(0, Math.round((SCORE_MAX * (2 * bonnes - total)) / total)), resume: places === ordre.length ? "Tout dans l'ordre" : `${places} / ${ordre.length} à la bonne place` });
  };

  return (
    <div className="pc-chrono">
      <p className="pc-chrono__sens">
        <span>Plus ancienne</span>
        <span aria-hidden="true">↓</span>
      </p>
      <ol className="pc-chrono__liste">
        {oeuvres.map((o, i) => {
          const bon = arrete && o.cle === juste[i];
          return (
            <li key={o.cle} className={arrete ? (bon ? "is-bon" : "is-rate") : ""}>
              <span className="pc-chrono__rang">{i + 1}</span>
              <Vignette o={o} />
              {arrete ? (
                <span className="pc-chrono__annee">{o.annee}</span>
              ) : (
                <span className="pc-chrono__fleches">
                  <button type="button" className="ctrl-btn" aria-label={`Monter ${o.titre}`} disabled={i === 0} onClick={() => deplacer(i, -1)}>
                    ↑
                  </button>
                  <button type="button" className="ctrl-btn" aria-label={`Descendre ${o.titre}`} disabled={i === oeuvres.length - 1} onClick={() => deplacer(i, 1)}>
                    ↓
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <p className="pc-chrono__sens">
        <span>Plus récente</span>
      </p>
      {arrete ? (
        !valide && <p className="mj-fin__verdict pc-centre">Temps écoulé</p>
      ) : (
        <button type="button" className="dl-lancer" onClick={valider}>
          Valider l&apos;ordre
        </button>
      )}
      {arrete && (
        <p className="mj-note pc-centre">
          Le bon ordre : {juste.map((c) => `${parCle.get(c)!.titre} (${parCle.get(c)!.annee})`).join(" → ")}
        </p>
      )}
    </div>
  );
}

/* ---------- Le chemin ---------- */

/** Au-delà de ce nombre d'étapes en plus du plus court chemin, c'est perdu. */
const MARGE_CHEMIN = 8;

export function EpreuveChemin({ m, d, g, parCle, finir, partiel, tempsEcoule }: PropsEpreuve<Extract<Manche, { e: "chemin" }>>) {
  const fin = useFinUnique(finir);
  const depart = g.index.get(m.depart)!, arrivee = g.index.get(m.arrivee)!;
  const [chemin, setChemin] = useState<number[]>([depart]);
  const [pas, setPas] = useState(0);
  const [abandon, setAbandon] = useState(false);
  const ici = chemin[chemin.length - 1]!;
  const arrive = ici === arrivee;
  const perdu = abandon || (!arrive && pas >= m.min + MARGE_CHEMIN);
  const arrete = arrive || perdu || !!tempsEcoule;
  const o = (i: number) => d.oeuvres[i]!;
  useEffect(() => {
    if (partiel) partiel.current = { score: 0, resume: "Pas arrivé à temps" };
  });

  useEffect(() => {
    if (arrive) fin({ score: Math.round((SCORE_MAX * m.min) / Math.max(m.min, pas)), resume: pas === m.min ? `Arrivé en ${pas} étapes, le plus court` : `Arrivé en ${pas} étapes (le plus court : ${m.min})` });
    else if (perdu) fin({ score: 0, resume: abandon ? "Abandon" : "Perdu en route" });
  }, [arrive, perdu, abandon, pas, m.min, fin]);

  const voisins = useMemo(() => [...g.voisins[ici]!].sort((a, b) => (a === arrivee ? -1 : b === arrivee ? 1 : o(a).titre.localeCompare(o(b).titre, "fr"))), [g, ici, arrivee]); // eslint-disable-line react-hooks/exhaustive-deps
  const aller = (i: number) => {
    if (arrete) return;
    setPas((p) => p + 1);
    const deja = chemin.indexOf(i);
    // revenir sur une œuvre déjà visitée : on reprend le chemin à partir d'elle
    setChemin(deja >= 0 ? chemin.slice(0, deja + 1) : [...chemin, i]);
  };
  const cible = o(arrivee);

  return (
    <div className="pc-chemin">
      <div className="pc-chemin__bornes">
        <div>
          <span className="pc-etiq">Départ</span>
          <Vignette o={o(depart)} annee />
        </div>
        <span className="pc-chemin__fleche" aria-hidden="true">
          →
        </span>
        <div>
          <span className="pc-etiq">Arrivée</span>
          <Vignette o={cible} annee />
          <span className="pc-chemin__genres">{[cible.genre, ...cible.sousGenres.filter((s) => s !== cible.genre)].filter(Boolean).slice(0, 4).join(" · ")}</span>
        </div>
      </div>
      <p className="mj-indice pc-centre">
        Étapes : <strong>{pas}</strong> · le plus court en fait {m.min}
        {!arrete && ` · perdu au-delà de ${m.min + MARGE_CHEMIN}`}
      </p>
      <ol className="pc-chemin__fil" aria-label="Ton chemin">
        {chemin.map((i, k) => (
          <li key={`${i}-${k}`}>
            <button type="button" disabled={arrete || k === chemin.length - 1} onClick={() => aller(i)} title={k < chemin.length - 1 ? "Revenir ici (compte comme une étape)" : undefined}>
              {o(i).titre}
            </button>
          </li>
        ))}
      </ol>
      {arrete ? (
        <p className="mj-fin__verdict pc-centre">{arrive ? (pas === m.min ? "Le chemin le plus court !" : "Arrivé") : tempsEcoule && !perdu ? "Temps écoulé" : abandon ? "Abandon" : "Trop d'étapes"}</p>
      ) : (
        <>
          <p className="dl-h pc-chemin__ici">
            Tu es sur <em>{o(ici).titre}</em>. Elle est reliée à :
          </p>
          <ul className="pc-chemin__voisins">
            {voisins.map((v) => (
              <li key={v}>
                <button type="button" className={v === arrivee ? "est-arrivee" : chemin.includes(v) ? "est-vu" : ""} onClick={() => aller(v)}>
                  <Vignette o={o(v)} />
                </button>
              </li>
            ))}
          </ul>
          <div className="dl-actions">
            <button type="button" className="ctrl-btn ctrl-btn--text" onClick={() => setAbandon(true)}>
              Abandonner
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------- La grille ---------- */

/** Essais en tout : une par case, plus quelques erreurs permises. */
const ESSAIS_GRILLE = 12;

export function EpreuveGrille({ m, univers, parCle, finir, partiel, tempsEcoule }: PropsEpreuve<Extract<Manche, { e: "grille" }>>) {
  const fin = useFinUnique(finir);
  const [cases, setCases] = useState<(string | null)[]>(() => Array(9).fill(null));
  const [choisie, setChoisie] = useState<number | null>(null);
  const [restants, setRestants] = useState(ESSAIS_GRILLE);
  const [rate, setRate] = useState<number | null>(null);
  const [termine, setTermine] = useState(false);
  const remplies = cases.filter(Boolean).length;
  const fini = termine || remplies === 9 || restants <= 0;
  const arrete = fini || !!tempsEcoule;
  const usees = useMemo(() => new Set(cases.filter(Boolean) as string[]), [cases]);
  const reponses = useMemo(() => m.lignes.flatMap((l) => m.colonnes.map((c) => reponsesCase(univers, l, c))), [m, univers]);
  const score = (n: number) => Math.round((SCORE_MAX * n) / 9);
  useEffect(() => {
    if (partiel) partiel.current = { score: score(remplies), resume: `${remplies} / 9 cases` };
  });

  useEffect(() => {
    if (fini) fin({ score: score(remplies), resume: remplies === 9 ? "Grille complète" : `${remplies} / 9 cases` });
  }, [fini, remplies, fin]); // eslint-disable-line react-hooks/exhaustive-deps

  const proposer = (cle: string) => {
    if (arrete || choisie === null) return;
    const o = parCle.get(cle);
    const l = m.lignes[Math.floor(choisie / 3)]!, c = m.colonnes[choisie % 3]!;
    setRestants((r) => r - 1);
    if (o && respecte(o, l) && respecte(o, c)) {
      setCases((x) => x.map((v, i) => (i === choisie ? cle : v)));
      // case suivante encore vide
      const suite = [...Array(9).keys()].map((k) => (choisie + 1 + k) % 9).find((k) => k !== choisie && !cases[k]);
      setChoisie(suite ?? null);
    } else {
      setRate(choisie);
      setTimeout(() => setRate(null), 500);
    }
  };

  return (
    <div className="pc-grille">
      <div className="pc-grille__table" role="grid">
        <span className="pc-grille__coin" aria-hidden="true" />
        {m.colonnes.map((c) => (
          <span key={c.v} className="pc-grille__tete" role="columnheader">
            {nomCritere(c)}
          </span>
        ))}
        {m.lignes.map((l, li) => (
          <div key={l.v} className="pc-grille__ligne" role="row">
            <span className="pc-grille__tete pc-grille__tete--ligne" role="rowheader">
              {nomCritere(l)}
            </span>
            {m.colonnes.map((_, ci) => {
              const k = li * 3 + ci;
              const cle = cases[k];
              const o = cle ? parCle.get(cle) : undefined;
              const exemple = arrete && !o ? reponses[k]![0] : undefined;
              return (
                <button
                  key={k}
                  type="button"
                  role="gridcell"
                  className={`pc-case${o ? " is-remplie" : ""}${choisie === k && !arrete ? " is-choisie" : ""}${rate === k ? " is-ratee" : ""}${exemple ? " is-exemple" : ""}`}
                  disabled={arrete || !!o}
                  onClick={() => setChoisie(k)}
                  aria-label={`${nomCritere(l)} et ${nomCritere(m.colonnes[ci]!)}${o ? ` : ${o.titre}` : ""}`}
                >
                  {o || exemple ? (
                    <>
                      <span className="pc-case__cover">
                        <Pochette o={(o ?? exemple)!} alt="" petite />
                      </span>
                      <span className="pc-case__titre">{(o ?? exemple)!.titre}</span>
                    </>
                  ) : (
                    <span className="pc-case__plus">{arrete ? "" : "+"}</span>
                  )}
                  {arrete && <span className="pc-case__n">{reponses[k]!.length}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="pc-grille__cote">
        <p className="mj-indice">
          {remplies} / 9 cases · {restants} essai{restants > 1 ? "s" : ""} restant{restants > 1 ? "s" : ""}
        </p>
        {arrete ? (
          <>
            <p className="mj-fin__verdict">{remplies === 9 ? "Grille complète" : tempsEcoule && !fini ? "Temps écoulé" : `${remplies} / 9`}</p>
            <p className="mj-note">En gris : une réponse possible pour chaque case vide. Le petit chiffre : combien d&apos;œuvres du site allaient dans la case.</p>
          </>
        ) : choisie === null ? (
          <p className="mj-note">Choisis une case.</p>
        ) : (
          <>
            <p className="pc-grille__case">
              {nomCritere(m.lignes[Math.floor(choisie / 3)]!)} <span aria-hidden="true">×</span> {nomCritere(m.colonnes[choisie % 3]!)}
            </p>
            <ChoixOeuvre key={choisie} oeuvres={univers} exclure={usees} choisir={proposer} id="pc-grille" />
          </>
        )}
        {!arrete && (
          <button type="button" className="ctrl-btn ctrl-btn--text" onClick={() => setTermine(true)}>
            J&apos;ai fini
          </button>
        )}
      </div>
    </div>
  );
}

/** L'épreuve qui correspond à la manche. */
export function Epreuve(p: PropsEpreuve) {
  switch (p.m.e) {
    case "mot":
      return <EpreuveMot {...(p as PropsEpreuve<Extract<Manche, { e: "mot" }>>)} />;
    case "devine":
      return <EpreuveDevine {...(p as PropsEpreuve<Extract<Manche, { e: "devine" }>>)} />;
    case "credits":
      return <EpreuveCredits {...(p as PropsEpreuve<Extract<Manche, { e: "credits" }>>)} />;
    case "chrono":
      return <EpreuveChrono {...(p as PropsEpreuve<Extract<Manche, { e: "chrono" }>>)} />;
    case "chemin":
      return <EpreuveChemin {...(p as PropsEpreuve<Extract<Manche, { e: "chemin" }>>)} />;
    case "grille":
      return <EpreuveGrille {...(p as PropsEpreuve<Extract<Manche, { e: "grille" }>>)} />;
  }
}
