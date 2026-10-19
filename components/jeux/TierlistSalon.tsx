"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pochette } from "@/components/connexions/Pochette";
import { TYPES_OEUVRE } from "@/lib/sections";
import { melanger } from "./Dilemme";
import { FiltresJeuBarre, nomUnivers, useFiltresJeu } from "./Filtres";
import { couleurRang, enregistrerImage, imageTierlist, type ItemJeu } from "./Tierlist";
import { HOTE, LONGUEUR_CODE, useSalon, type Joueur } from "./useSalon";

/*
 * Tierlist à plusieurs, en ligne. Les œuvres passent une par une : tout le monde
 * vote le rang en même temps (on peut changer d'avis tant que le vote est ouvert,
 * ou passer si on ne connaît pas). Puis on révèle qui a mis quoi, et l'œuvre
 * rejoint la tierlist du groupe au rang moyen. L'hôte peut corriger.
 * À la fin : la tierlist du groupe, celle de chacun, et qui était raccord avec le groupe.
 */

const MAX_JOUEURS = 12;
/** Pause sur le résultat avant l'œuvre suivante, en enchaînement automatique (millisecondes). */
const PAUSE_AUTO = 6000;
/** Quand tout le monde a voté, on attend encore un peu (le temps de changer d'avis). */
const ATTENTE_TOUS = 1500;
const MARGE_RESEAU = 1500;
/** Le « vote » de quelqu'un qui ne connaît pas l'œuvre. */
const PASSE = -1;

const NOMBRES = [10, 20, 30, 50];
const TEMPS_VOTE = [15, 30, 60, 0];
const MODELES: { nom: string; rangs: string[] }[] = [
  { nom: "S à D", rangs: ["S", "A", "B", "C", "D"] },
  { nom: "S à F", rangs: ["S", "A", "B", "C", "D", "F"] },
  { nom: "Goat à Nul", rangs: ["Goat", "Classique", "Solide", "Bof", "Nul"] },
  { nom: "Top / Mid / Flop", rangs: ["Top", "Mid", "Flop"] },
];

type Etat = {
  joueurs: Joueur[];
  phase: "salon" | "vote" | "revele" | "fin";
  titre: string;
  rangs: string[];
  /** Les œuvres de la partie, dans l'ordre de passage. */
  oeuvres: string[];
  indice: number;
  /** Change à chaque œuvre : sert à ignorer un vote arrivé en retard. */
  jeton: number;
  /** Secondes pour voter ; 0 = pas de limite. */
  duree: number;
  auto: boolean;
  anonyme: boolean;
  /** Pendant le vote : qui a déjà voté (sans dire quoi). */
  ontVote: string[];
  /** Au résultat : le vote de chacun pour l'œuvre en cours. */
  votes: Record<string, number>;
  /** Rang de chaque œuvre déjà passée dans la tierlist du groupe (PASSE = personne ne la connaissait). */
  place: Record<string, number>;
  corrigee: boolean;
  /** Tous les votes de la partie, pour les tierlists de chacun et le bilan. */
  historique: Record<string, Record<string, number>>;
  /** Les pseudos (on garde ceux qui sont partis). */
  noms: Record<string, string>;
};
type MessageJeu = { t: "vote"; jeton: number; r: number };

const etatVide = (): Etat => ({ joueurs: [], phase: "salon", titre: "Notre tierlist", rangs: MODELES[0]!.rangs, oeuvres: [], indice: 0, jeton: 0, duree: 30, auto: true, anonyme: false, ontVote: [], votes: {}, place: {}, corrigee: false, historique: {}, noms: {} });

/** Le rang du groupe : la moyenne des votes, arrondie. Personne n'a voté : PASSE. */
function rangDuGroupe(votes: Record<string, number>) {
  const v = Object.values(votes).filter((x) => x >= 0);
  if (!v.length) return PASSE;
  return Math.round(v.reduce((a, b) => a + b, 0) / v.length);
}
/** Écart entre le vote le plus haut et le plus bas. */
function ecart(votes: Record<string, number>) {
  const v = Object.values(votes).filter((x) => x >= 0);
  return v.length > 1 ? Math.max(...v) - Math.min(...v) : 0;
}

export function TierlistSalon({ oeuvres }: { oeuvres: ItemJeu[] }) {
  const parCle = useMemo(() => new Map(oeuvres.map((o) => [o.cle, o])), [oeuvres]);
  const f = useFiltresJeu(oeuvres);

  /* ---------- Réglages de l'hôte ---------- */
  const [nombre, setNombre] = useState(20);
  const [modele, setModele] = useState(0);
  const [titre, setTitre] = useState("Notre tierlist");
  const [temps, setTemps] = useState(30);
  const [auto, setAuto] = useState(true);
  const [anonyme, setAnonyme] = useState(false);

  /* ---------- Côté hôte : l'arbitre ---------- */
  const votes = useRef(new Map<string, number>());
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  const s = useSalon<Etat>({
    prefixe: "henassa-tierlist-",
    vide: etatVide,
    max: MAX_JOUEURS,
    surJeu: (id, brut) => recevoir(id, brut as MessageJeu),
    surJoueurs: () => verifierTous(),
  });
  const { lire, ecrire } = s;
  const arreter = () => {
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = null;
  };

  /** Ouvre le vote sur l'œuvre n° indice. */
  const ouvrir = useCallback(
    (e: Etat, indice: number) => {
      arreter();
      votes.current = new Map();
      const n: Etat = { ...e, phase: "vote", indice, jeton: e.jeton + 1, ontVote: [], votes: {}, corrigee: false, noms: { ...e.noms, ...Object.fromEntries(e.joueurs.map((j) => [j.id, j.nom])) } };
      ecrire(n);
      if (n.duree) minuteur.current = setTimeout(() => reveler(), n.duree * 1000 + MARGE_RESEAU);
    },
    [ecrire] // eslint-disable-line react-hooks/exhaustive-deps
  );

  /** Fin du vote : on révèle, l'œuvre rejoint la tierlist du groupe. */
  const reveler = useCallback(() => {
    const e = lire();
    if (e.phase !== "vote") return;
    arreter();
    const v = Object.fromEntries(votes.current);
    const cle = e.oeuvres[e.indice]!;
    const noms = { ...e.noms, ...Object.fromEntries(e.joueurs.map((j) => [j.id, j.nom])) };
    ecrire({ ...e, phase: "revele", votes: v, noms, place: { ...e.place, [cle]: rangDuGroupe(v) }, historique: { ...e.historique, [cle]: v } });
    if (e.auto) minuteur.current = setTimeout(() => suivante(), PAUSE_AUTO);
  }, [lire, ecrire]); // eslint-disable-line react-hooks/exhaustive-deps

  const suivante = useCallback(() => {
    const e = lire();
    if (e.phase !== "revele") return;
    arreter();
    if (e.indice + 1 >= e.oeuvres.length) return ecrire({ ...e, phase: "fin" });
    ouvrir(e, e.indice + 1);
  }, [lire, ecrire, ouvrir]);

  /** Tout le monde a voté : on révèle juste après (on laisse le temps de changer d'avis). */
  const verifierTous = useCallback(() => {
    const e = lire();
    if (e.phase !== "vote" || !e.joueurs.length || !e.joueurs.every((j) => votes.current.has(j.id))) return;
    arreter();
    minuteur.current = setTimeout(() => reveler(), ATTENTE_TOUS);
  }, [lire, reveler]);

  const recevoir = useCallback(
    (id: string, m: MessageJeu) => {
      const e = lire();
      if (m?.t !== "vote" || e.phase !== "vote" || m.jeton !== e.jeton || !e.joueurs.some((j) => j.id === id)) return;
      const r = Math.round(Number(m.r));
      if (!(r === PASSE || (r >= 0 && r < e.rangs.length))) return;
      votes.current.set(id, r);
      if (!e.ontVote.includes(id)) ecrire({ ...e, ontVote: [...e.ontVote, id] });
      verifierTous();
    },
    [lire, ecrire, verifierTous]
  );

  /** L'hôte change le rang décidé par le groupe. */
  const corriger = (r: number) => {
    const e = lire();
    if (e.phase !== "revele") return;
    ecrire({ ...e, place: { ...e.place, [e.oeuvres[e.indice]!]: r }, corrigee: true });
    if (e.auto) {
      arreter();
      minuteur.current = setTimeout(() => suivante(), PAUSE_AUTO);
    }
  };

  const lancer = () => {
    const choix = melanger(f.vivier).slice(0, nombre).map((o) => o.cle);
    if (choix.length < 2) return;
    const e = lire();
    ouvrir({ ...e, titre: titre.trim() || "Notre tierlist", rangs: MODELES[modele]!.rangs, oeuvres: choix, duree: temps, auto, anonyme, place: {}, historique: {}, noms: {} }, 0);
  };
  const retourSalon = () => {
    arreter();
    ecrire({ ...lire(), phase: "salon", oeuvres: [], indice: 0, ontVote: [], votes: {}, place: {}, historique: {} });
  };
  useEffect(() => () => arreter(), []);

  /* ---------- Côté joueur ---------- */
  const e = s.etat;
  const cle = e.phase === "vote" || e.phase === "revele" ? e.oeuvres[e.indice] : undefined;
  const o = cle ? parCle.get(cle) : undefined;
  const [monVote, setMonVote] = useState<number | null>(null);
  const [debut, setDebut] = useState(0);
  const [maintenant, setMaintenant] = useState(0);
  useEffect(() => {
    setMonVote(null);
    setDebut(Date.now());
    setMaintenant(Date.now());
  }, [e.jeton]);
  useEffect(() => {
    if (e.phase !== "vote" || !e.duree) return;
    const t = setInterval(() => setMaintenant(Date.now()), 250);
    return () => clearInterval(t);
  }, [e.phase, e.jeton, e.duree]);
  const restant = e.duree && debut ? Math.max(0, e.duree - (maintenant - debut) / 1000) : Infinity;
  const ferme = e.phase !== "vote" || restant <= 0;

  const voter = (r: number) => {
    if (ferme) return;
    setMonVote(r);
    s.envoyer({ t: "vote", jeton: e.jeton, r } satisfies MessageJeu);
  };
  // raccourcis clavier : 1, 2, 3… pour les rangs, 0 pour passer
  useEffect(() => {
    if (e.phase !== "vote") return;
    const onKey = (x: KeyboardEvent) => {
      if ((x.target as HTMLElement | null)?.closest("input, textarea, select")) return;
      const n = Number(x.key);
      if (x.key === "0") voter(PASSE);
      else if (n >= 1 && n <= e.rangs.length) voter(n - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* ---------- Affichage ---------- */
  const [edition, setEdition] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);
  const [image, setImage] = useState<"" | "encours" | "erreur">("");
  const zone = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (e.phase === "vote" && e.indice === 0) zone.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [e.phase, e.indice]);

  /** Les rangs de la tierlist du groupe (ou de celle d'un joueur), avec leurs œuvres. */
  const rangsDe = useCallback(
    (place: Record<string, number>) => e.rangs.map((nom, i) => ({ nom, items: e.oeuvres.filter((c) => place[c] === i) })),
    [e.rangs, e.oeuvres]
  );
  const placeDe = (id: string) => Object.fromEntries(Object.entries(e.historique).map(([c, v]) => [c, v[id] ?? PASSE]));
  const telecharger = async (place: Record<string, number>, titreImage: string, sousTitre: string) => {
    setImage("encours");
    try {
      await enregistrerImage(await imageTierlist(titreImage, rangsDe(place), parCle, sousTitre), titreImage);
      setImage("");
    } catch {
      setImage("erreur");
    }
  };

  if (!s.role) {
    return (
      <div className="dilemme salon">
        <div className="dl-bloc">
          <h2 className="dl-h">Ton pseudo</h2>
          <label className="sl-champ">
            <span className="visually-hidden">Ton pseudo</span>
            <input id="sl-pseudo" value={s.nom} maxLength={16} autoComplete="off" placeholder="Comment on t'appelle ?" onChange={(x) => s.setNom(x.target.value)} />
          </label>
          <p className="dl-note">C&apos;est le nom que les autres verront à côté de tes votes. Tu pourras le changer dans le salon.</p>
        </div>
        <div className="sl-choix">
          <div className="sl-carte">
            <h2 className="dl-h">Créer un salon</h2>
            <p className="dl-note">Tu choisis les œuvres et les rangs, tu invites tes potes avec un code, et vous classez ensemble.</p>
            <button type="button" className="dl-lancer" onClick={s.creer} disabled={s.statut === "connexion"}>
              Créer un salon →
            </button>
          </div>
          <div className="sl-carte">
            <h2 className="dl-h">Rejoindre</h2>
            <p className="dl-note">Entre le code que l&apos;on t&apos;a donné.</p>
            <label className="sl-champ sl-champ--code">
              <span className="visually-hidden">Code du salon</span>
              <input id="sl-code" value={s.codeSaisi} maxLength={LONGUEUR_CODE} autoComplete="off" autoCapitalize="characters" placeholder="CODE" onChange={(x) => s.setCodeSaisi(x.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} onKeyDown={(x) => x.key === "Enter" && s.rejoindre()} />
            </label>
            <button type="button" className="dl-lancer" onClick={s.rejoindre} disabled={s.statut === "connexion" || s.codeSaisi.length !== LONGUEUR_CODE}>
              Rejoindre →
            </button>
          </div>
        </div>
        {s.statut === "connexion" && <p className="dl-note dl-note--centre" role="status">Connexion en cours…</p>}
        {s.erreur && <p className="tl-message" role="alert">{s.erreur}</p>}
        <p className="dl-note dl-note--centre">
          <Link href="/mini-jeux/tierlist">Faire ma tierlist seul</Link>
        </p>
      </div>
    );
  }

  const validerPseudo = () => {
    const v = (edition ?? "").trim();
    setEdition(null);
    if (v) s.changerMonNom(v);
  };
  const listeJoueurs = (
    <ul className="sl-joueurs" aria-label="Joueurs">
      {e.joueurs.map((j) => {
        const a = e.phase === "vote" && e.ontVote.includes(j.id);
        return (
          <li key={j.id} className={`${a ? "a-vote" : ""}${j.id === s.moi ? " est-moi" : ""}`}>
            {e.phase === "vote" && <span aria-hidden="true">{a ? "✓" : "…"}</span>}
            {j.id === s.moi && edition !== null ? (
              <input className="sl-renommer" value={edition} maxLength={16} autoFocus aria-label="Ton pseudo" onChange={(x) => setEdition(x.target.value)} onBlur={validerPseudo} onKeyDown={(x) => { if (x.key === "Enter") validerPseudo(); if (x.key === "Escape") setEdition(null); }} />
            ) : j.id === s.moi ? (
              <button type="button" className="sl-moi" onClick={() => setEdition(j.nom)} title="Changer mon pseudo">
                {j.nom} <span aria-hidden="true">✎</span>
              </button>
            ) : (
              j.nom
            )}
            {j.id === HOTE && <em>hôte</em>}
          </li>
        );
      })}
    </ul>
  );
  const bandeau = (
    <div className="sl-bandeau">
      <span className="sl-code">
        Salon <strong>{s.code}</strong>
      </span>
      <button
        type="button"
        className="ctrl-btn ctrl-btn--text"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(s.lien);
            setCopie(true);
            setTimeout(() => setCopie(false), 1800);
          } catch {}
        }}
      >
        {copie ? "Lien copié !" : "Copier le lien d'invitation"}
      </button>
      <button type="button" className="ctrl-btn ctrl-btn--text" onClick={s.partir}>
        Quitter
      </button>
    </div>
  );

  /* ---------- Salon d'attente ---------- */
  if (e.phase === "salon") {
    return (
      <div className="dilemme salon">
        {bandeau}
        <div className="dl-bloc">
          <h2 className="dl-h">
            Joueurs <span className="sl-nb">{e.joueurs.length}</span>
          </h2>
          {listeJoueurs}
          <p className="dl-note">{s.estHote ? "Partage le code ou le lien, puis lance quand tout le monde est là." : "En attente de l'hôte, qui choisit les œuvres et les rangs."}</p>
        </div>
        {s.estHote && (
          <>
            <div className="dl-bloc">
              <h2 className="dl-h">Quelles œuvres ?</h2>
              <FiltresJeuBarre f={f} id="tls" />
              <h2 className="dl-h pc-sous-titre">Combien ?</h2>
              <div className="filters" role="group" aria-label="Nombre d'œuvres">
                {NOMBRES.map((n) => (
                  <button key={n} type="button" className={`filter dl-taille${nombre === n ? " is-on" : ""}`} aria-pressed={nombre === n} disabled={f.vivier.length < 2} onClick={() => setNombre(n)}>
                    {n}
                  </button>
                ))}
              </div>
              <p className="dl-note">
                {f.vivier.length < 2 ? "Pas assez d'œuvres avec ces filtres." : `Tirées au hasard parmi ${f.vivier.length} ${nomUnivers(f.type).toLowerCase()}${f.vivier.length < nombre ? ` (il n'y en aura que ${f.vivier.length})` : ""}.`}
              </p>
            </div>
            <div className="dl-bloc">
              <h2 className="dl-h">Les rangs</h2>
              <div className="filters" role="group" aria-label="Rangs">
                {MODELES.map((m, i) => (
                  <button key={m.nom} type="button" className={`filter${modele === i ? " is-on" : ""}`} aria-pressed={modele === i} onClick={() => setModele(i)}>
                    {m.nom}
                  </button>
                ))}
              </div>
              <ul className="tls-apercu" aria-hidden="true">
                {MODELES[modele]!.rangs.map((r, i, l) => (
                  <li key={r} style={{ background: couleurRang(i, l.length) }}>
                    {r}
                  </li>
                ))}
              </ul>
              <label className="sl-champ">
                <span className="visually-hidden">Titre de la tierlist</span>
                <input id="tls-titre" value={titre} maxLength={60} placeholder="Titre de la tierlist" onChange={(x) => setTitre(x.target.value)} />
              </label>
            </div>
            <div className="dl-bloc">
              <h2 className="dl-h">Le vote</h2>
              <div className="filters" role="group" aria-label="Temps pour voter">
                {TEMPS_VOTE.map((t) => (
                  <button key={t} type="button" className={`filter${temps === t ? " is-on" : ""}`} aria-pressed={temps === t} onClick={() => setTemps(t)}>
                    {t ? `${t} s` : "Sans limite"}
                  </button>
                ))}
              </div>
              <p className="dl-note">Le temps pour voter sur chaque œuvre. Dès que tout le monde a voté, on passe au résultat.</p>
              <div className="filters" role="group" aria-label="Enchaînement">
                <button type="button" className={`filter${auto ? " is-on" : ""}`} aria-pressed={auto} onClick={() => setAuto(true)}>
                  Enchaînement auto
                </button>
                <button type="button" className={`filter${!auto ? " is-on" : ""}`} aria-pressed={!auto} onClick={() => setAuto(false)}>
                  L&apos;hôte passe à la suite
                </button>
              </div>
              <p className="dl-note">{auto ? "Le résultat reste affiché quelques secondes, puis l'œuvre suivante arrive." : "Pratique pour débattre : rien ne bouge tant que tu ne passes pas à la suite."}</p>
              <div className="filters" role="group" aria-label="Votes">
                <button type="button" className={`filter${!anonyme ? " is-on" : ""}`} aria-pressed={!anonyme} onClick={() => setAnonyme(false)}>
                  Votes visibles
                </button>
                <button type="button" className={`filter${anonyme ? " is-on" : ""}`} aria-pressed={anonyme} onClick={() => setAnonyme(true)}>
                  Votes anonymes
                </button>
              </div>
              <p className="dl-note">{anonyme ? "On voit seulement combien de voix chaque rang a reçues." : "On voit qui a mis quoi."}</p>
            </div>
            <button type="button" className="dl-lancer" onClick={lancer} disabled={f.vivier.length < 2}>
              Lancer la tierlist →
            </button>
          </>
        )}
      </div>
    );
  }

  const groupe = (
    <TierlistGroupe rangs={rangsDe(e.place)} parCle={parCle} nouvelle={e.phase === "revele" ? cle : undefined} />
  );

  /* ---------- Fin ---------- */
  if (e.phase === "fin") {
    const ids = Object.keys(e.noms);
    const stats = ids
      .map((id) => {
        let n = 0, dist = 0, somme = 0, haut = 0, bas = 0;
        const k = e.rangs.length > 3 ? 2 : 1;
        for (const [c, v] of Object.entries(e.historique)) {
          const r = v[id], g = e.place[c];
          if (r === undefined || r < 0 || g === undefined || g < 0) continue;
          n++;
          dist += Math.abs(r - g);
          somme += r;
          if (r < k) haut++;
          if (r >= e.rangs.length - k) bas++;
        }
        return { id, nom: e.noms[id]!, n, dist: n ? dist / n : 0, moy: n ? somme / n : 0, haut: n ? haut / n : 0, bas: n ? bas / n : 0 };
      })
      .filter((x) => x.n >= 2);
    const tri = (k: (x: (typeof stats)[number]) => number) => [...stats].sort((a, b) => k(a) - k(b));
    const debats = Object.entries(e.historique)
      .map(([c, v]) => ({ c, e: ecart(v), v }))
      .filter((x) => x.e >= 2)
      .sort((a, b) => b.e - a.e);
    const pasClassees = e.oeuvres.filter((c) => e.place[c] === PASSE);
    const titres = stats.length >= 2
      ? [
          { t: "Dans le mood du groupe", x: tri((x) => x.dist)[0]!, d: (x: (typeof stats)[number]) => `à ${x.dist.toFixed(1).replace(".", ",")} rang en moyenne du groupe` },
          { t: "À contre-courant", x: tri((x) => -x.dist)[0]!, d: (x: (typeof stats)[number]) => `à ${x.dist.toFixed(1).replace(".", ",")} rang en moyenne du groupe` },
          { t: "Le plus généreux", x: tri((x) => x.moy)[0]!, d: (x: (typeof stats)[number]) => `${Math.round(x.haut * 100)} % de ses votes en ${e.rangs.slice(0, e.rangs.length > 3 ? 2 : 1).join(" ou ")}` },
          { t: "Le plus sévère", x: tri((x) => -x.moy)[0]!, d: (x: (typeof stats)[number]) => `${Math.round(x.bas * 100)} % de ses votes en ${e.rangs.slice(e.rangs.length > 3 ? -2 : -1).join(" ou ")}` },
        ]
      : [];
    return (
      <div className="dilemme salon tls" ref={zone}>
        {bandeau}
        <p className="dl-tour">{e.titre}</p>
        {groupe}
        {pasClassees.length > 0 && <p className="dl-note">Personne ne connaissait : {pasClassees.map((c) => parCle.get(c)?.titre).join(", ")}.</p>}
        <div className="dl-actions">
          <button type="button" className="ctrl-btn ctrl-btn--text" disabled={image === "encours"} onClick={() => telecharger(e.place, e.titre, `Classée à ${ids.length} : ${ids.map((i) => e.noms[i]).join(", ")}`)}>
            {image === "encours" ? "Préparation…" : "Télécharger la tierlist du groupe"}
          </button>
          {e.noms[s.moi] && (
            <button type="button" className="ctrl-btn ctrl-btn--text" disabled={image === "encours"} onClick={() => telecharger(placeDe(s.moi), `${e.titre} · ${e.noms[s.moi]}`, "D'après mes votes")}>
              Télécharger la mienne
            </button>
          )}
        </div>
        {image === "erreur" && <p className="tl-message">L&apos;image n&apos;a pas pu être créée. Réessaie, ou fais une capture d&apos;écran.</p>}

        {titres.length > 0 && (
          <div className="dl-bloc">
            <h2 className="dl-h">Le bilan</h2>
            <ul className="tls-titres">
              {titres.map(({ t, x, d }) => (
                <li key={t} className={x.id === s.moi ? "est-moi" : ""}>
                  <span className="tls-titres__t">{t}</span>
                  <span className="tls-titres__nom">{x.nom}</span>
                  <span className="tls-titres__d">{d(x)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {debats.length > 0 && (
          <div className="dl-bloc">
            <h2 className="dl-h">Les plus gros débats</h2>
            <ul className="tls-debats">
              {debats.slice(0, 3).map(({ c, v }) => {
                const x = parCle.get(c);
                if (!x) return null;
                return (
                  <li key={c}>
                    <span className="tls-debats__cover">
                      <Pochette o={x} petite />
                    </span>
                    <span className="tls-debats__txt">
                      <strong>{x.titre}</strong> — {x.auteur}
                      <span className="tls-debats__votes">
                        {e.anonyme
                          ? e.rangs.map((r, i) => ({ r, n: Object.values(v).filter((y) => y === i).length })).filter((y) => y.n).map((y) => `${y.n} en ${y.r}`).join(" · ")
                          : Object.entries(v).filter(([, y]) => y >= 0).sort((a, b) => a[1] - b[1]).map(([id, y]) => `${e.noms[id] ?? "?"} : ${e.rangs[y]}`).join(" · ")}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {s.estHote ? (
          <div className="dl-actions">
            <button type="button" className="ctrl-btn ctrl-btn--text" onClick={lancer}>
              Rejouer avec d&apos;autres œuvres
            </button>
            <button type="button" className="ctrl-btn ctrl-btn--text" onClick={retourSalon}>
              Changer les réglages
            </button>
          </div>
        ) : (
          <p className="dl-note dl-note--centre">L&apos;hôte peut relancer une partie.</p>
        )}
        {listeJoueurs}
      </div>
    );
  }

  /* ---------- Vote, puis résultat ---------- */
  const revele = e.phase === "revele";
  const resultat = cle ? e.place[cle] : undefined;
  const nbVotes = Object.values(e.votes).filter((v) => v >= 0).length;
  const verdict = !revele || resultat === undefined
    ? ""
    : resultat === PASSE
      ? "Personne ne connaît : on la laisse de côté"
      : `${e.corrigee ? "L'hôte tranche" : "Le groupe la met"} en ${e.rangs[resultat]}`;
  const ambiance = revele && !e.corrigee && nbVotes > 1 ? (ecart(e.votes) === 0 ? "Unanime" : ecart(e.votes) >= Math.max(2, Math.ceil(e.rangs.length / 2)) ? "Débat !" : "") : "";

  return (
    <div className="dilemme salon tls" ref={zone}>
      {bandeau}
      <div className="dl-entete">
        <p className="dl-tour">{e.titre}</p>
        <p className="dl-compte">
          Œuvre {e.indice + 1} / {e.oeuvres.length}
          {!revele && Number.isFinite(restant) && (
            <span className={`pc-temps${restant <= 5 ? " is-court" : ""}`}>
              {" · "}
              {Math.ceil(restant)} s
            </span>
          )}
        </p>
      </div>
      <div className="dl-barre" role="progressbar" aria-valuemin={0} aria-valuemax={e.oeuvres.length} aria-valuenow={e.indice} aria-label="Avancement">
        <i style={{ width: `${(e.indice / Math.max(1, e.oeuvres.length)) * 100}%` }} />
      </div>

      {o ? (
        <div className="tls-scene">
          <div className="tls-oeuvre" style={{ ["--type" as string]: TYPES_OEUVRE[o.type].couleur }}>
            <span className="tls-oeuvre__cover">
              <Pochette o={o} lazy={false} />
            </span>
            <h2 className="tls-oeuvre__titre">{o.titre}</h2>
            <p className="tls-oeuvre__auteur">
              {o.auteur}
              {o.annee ? ` · ${o.annee}` : ""}
            </p>
            {o.genre && <p className="tls-oeuvre__genre">{[o.genre, ...(o.sousGenres ?? []).filter((x) => x !== o.genre)].slice(0, 3).join(" · ")}</p>}
          </div>

          <div className="tls-vote">
            {revele && (
              <p className="tls-verdict" role="status">
                {verdict}
                {ambiance && <span className={`tls-ambiance${ambiance === "Unanime" ? " is-unanime" : ""}`}>{ambiance}</span>}
              </p>
            )}
            <ol className="tls-rangs" aria-label={revele ? "Votes" : "Ton vote"}>
              {e.rangs.map((r, i) => {
                const qui = Object.entries(e.votes).filter(([, v]) => v === i).map(([id]) => id);
                return (
                  <li key={r} className={`${revele && resultat === i ? "est-resultat" : ""}${monVote === i ? " est-mien" : ""}`} style={{ ["--rang" as string]: couleurRang(i, e.rangs.length) }}>
                    <button type="button" className={`tls-rangs__nom${r.length > 6 ? " est-long" : ""}`} disabled={ferme} aria-pressed={monVote === i} onClick={() => voter(i)} title={`Raccourci : ${i + 1}`}>
                      {r}
                    </button>
                    <span className="tls-rangs__voix">
                      {revele &&
                        (e.anonyme ? (
                          qui.length > 0 && <span className="tls-compte">{qui.length} voix</span>
                        ) : (
                          qui.map((id) => (
                            <span key={id} className={`tls-pseudo${id === s.moi ? " est-moi" : ""}`}>
                              {e.noms[id] ?? "?"}
                            </span>
                          ))
                        ))}
                      {!revele && monVote === i && <span className="tls-pseudo est-moi">Ton vote</span>}
                    </span>
                    {revele && s.estHote && resultat !== i && (
                      <button type="button" className="tls-corriger" onClick={() => corriger(i)} title="Mettre l'œuvre dans ce rang">
                        Mettre ici
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>
            {!revele ? (
              <div className="tls-sous">
                <button type="button" className={`ctrl-btn ctrl-btn--text sl-abstenir${monVote === PASSE ? " is-on" : ""}`} disabled={ferme} aria-pressed={monVote === PASSE} onClick={() => voter(PASSE)}>
                  Je connais pas
                </button>
                <p className="dl-note">
                  {monVote === null ? "Choisis un rang (ou tape 1, 2, 3…)." : "Tu peux changer d'avis tant que le vote est ouvert."} {e.ontVote.length} / {e.joueurs.length} ont voté.
                </p>
              </div>
            ) : (
              <div className="tls-sous">
                {Object.values(e.votes).some((v) => v === PASSE) && (
                  <p className="dl-note">
                    Connaissent pas : {e.anonyme ? Object.values(e.votes).filter((v) => v === PASSE).length : Object.entries(e.votes).filter(([, v]) => v === PASSE).map(([id]) => e.noms[id] ?? "?").join(", ")}
                  </p>
                )}
                {s.estHote ? (
                  <button type="button" className="dl-lancer" onClick={suivante}>
                    {e.indice + 1 >= e.oeuvres.length ? "Voir la tierlist finale →" : "Œuvre suivante →"}
                  </button>
                ) : (
                  <p className="dl-note">{e.auto ? "La suite arrive dans quelques secondes." : "L'hôte passe à la suite quand vous avez fini de débattre."}</p>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        <p className="tl-message">Cette œuvre n&apos;existe pas sur ta version du site : recharge la page.</p>
      )}

      {listeJoueurs}
      <div className="dl-bloc">
        <h2 className="dl-h">La tierlist du groupe</h2>
        {groupe}
      </div>
      {s.estHote && (
        <div className="dl-actions">
          {!revele && (
            <button type="button" className="ctrl-btn ctrl-btn--text" onClick={reveler}>
              Révéler sans attendre
            </button>
          )}
          <button type="button" className="ctrl-btn ctrl-btn--text" onClick={() => ecrire({ ...lire(), phase: "fin" })}>
            Finir maintenant
          </button>
          <button type="button" className="ctrl-btn ctrl-btn--text" onClick={retourSalon}>
            Arrêter
          </button>
        </div>
      )}
    </div>
  );
}

/** La tierlist du groupe, en lecture seule. */
function TierlistGroupe({ rangs, parCle, nouvelle }: { rangs: { nom: string; items: string[] }[]; parCle: Map<string, ItemJeu>; nouvelle?: string }) {
  return (
    <ol className="tl-rangs tls-groupe">
      {rangs.map((r, i) => (
        <li key={r.nom + i} className="tl-rang" style={{ ["--rang" as string]: couleurRang(i, rangs.length) }}>
          <div className="tl-rang__nom">
            <span className={r.nom.length > 6 ? "est-long" : ""}>{r.nom}</span>
          </div>
          <ul className="tl-rang__items">
            {r.items.map((c) => {
              const o = parCle.get(c);
              if (!o) return null;
              return (
                <li key={c} className="tl-tuile-li">
                  <span className={`tl-tuile tls-tuile${c === nouvelle ? " est-nouvelle" : ""}`} title={`${o.titre} — ${o.auteur}`}>
                    <Pochette o={o} petite />
                  </span>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ol>
  );
}
