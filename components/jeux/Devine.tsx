"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { OeuvreJeu } from "@/lib/jeux";
import { isAudioFile, youtubeId } from "@/lib/media";
import { Pochette } from "@/components/connexions/Pochette";
import { PlayButton, usePlayer } from "@/components/player/Lecteur";
import { SECTIONS, TYPES_OEUVRE } from "@/lib/sections";
import { ChoixPartie, Mosaique, copier, ecrire, jourLisible, lire, useOeuvreATrouver } from "./commun";

/*
 * Devine l'œuvre : un indice de plus à chaque essai raté.
 * Ordre des indices : genre, sous-genres, œuvres reliées, année,
 * pochette en mosaïque, extrait sonore. (Pas l'artiste : trop facile.)
 * Les indices qui n'existent pas pour une œuvre sont simplement sautés.
 */

/** Durée de l'extrait sonore (secondes) et moment du morceau où il commence. */
const DUREE_EXTRAIT = 15;
const DEBUT_EXTRAIT = 45;
/** Netteté de la pochette quand l'indice arrive, puis aux essais suivants. */
const NETTETE_POCHETTE = [9, 14, 22];

type Indice = "genre" | "sousGenres" | "liees" | "annee" | "pochette" | "extrait";
type Sauvegarde = { essais: string[] };

function norm(s: string) {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

// Il faut au moins un genre pour démarrer
const jouable = (o: OeuvreJeu) => !!o.genre;

/** Extrait sonore sans rien montrer : lecteur caché, coupé au bout de quelques secondes. */
function Extrait({ media }: { media: string }) {
  const [joue, setJoue] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  const player = usePlayer();
  const yt = youtubeId(media);

  const arreter = () => {
    if (minuteur.current) clearTimeout(minuteur.current);
    audio.current?.pause();
    setJoue(false);
  };
  useEffect(() => arreter, []); // coupe le son si on quitte la page ou change d'œuvre

  const lancer = () => {
    if (joue) return arreter();
    // le lecteur du site se met en pause pour ne pas couvrir l'extrait
    if (player.playing) player.toggle();
    if (!yt && isAudioFile(media)) {
      const a = audio.current ?? new Audio(media);
      audio.current = a;
      a.currentTime = 0;
      void a.play();
    }
    setJoue(true);
    minuteur.current = setTimeout(arreter, DUREE_EXTRAIT * 1000);
  };

  return (
    <div className="dv-extrait">
      <button type="button" className={`play-btn${joue ? " is-current" : ""}`} onClick={lancer}>
        <span aria-hidden="true">{joue ? "❚❚" : "▶"}</span> {joue ? "Arrêter l'extrait" : `Écouter ${DUREE_EXTRAIT} secondes`}
      </button>
      {joue && yt && (
        // La vidéo YouTube joue hors de l'écran : on n'entend que le son, sans titre ni image
        <iframe
          className="dv-extrait__cache"
          src={`https://www.youtube-nocookie.com/embed/${yt}?autoplay=1&start=${DEBUT_EXTRAIT}&controls=0&playsinline=1`}
          allow="autoplay; encrypted-media"
          title="Extrait sonore"
          tabIndex={-1}
          aria-hidden="true"
        />
      )}
    </div>
  );
}

export function Devine({ oeuvres }: { oeuvres: OeuvreJeu[] }) {
  const j = useOeuvreATrouver(oeuvres, jouable, 2);
  const cible = j.cible;
  const parCle = useMemo(() => new Map(oeuvres.map((o) => [o.cle, o])), [oeuvres]);
  /** Une clé par essai ; "" = « je passe ». */
  const [essais, setEssais] = useState<string[]>([]);
  const [saisie, setSaisie] = useState("");
  const [copie, setCopie] = useState<"" | "ok" | "non">("");
  const cleStock = j.mode === "jour" && j.jour ? `henassa-devine-${j.jour}` : null;

  // Les indices disponibles pour cette œuvre, dans l'ordre
  const indices = useMemo<Indice[]>(() => {
    if (!cible) return [];
    const l: Indice[] = ["genre"];
    if (cible.sousGenres.length) l.push("sousGenres");
    if (cible.liees.length) l.push("liees");
    if (cible.annee) l.push("annee");
    if (cible.cover) l.push("pochette");
    if (cible.media) l.push("extrait");
    return l;
  }, [cible]);

  useEffect(() => {
    setSaisie("");
    setCopie("");
    const s = cleStock ? lire<Sauvegarde>(cleStock) : null;
    setEssais(Array.isArray(s?.essais) ? s!.essais : []);
  }, [cible?.cle, j.manche, cleStock]);

  const gagne = !!cible && essais.includes(cible.cle);
  const fini = gagne || (indices.length > 0 && essais.length >= indices.length);
  const visibles = fini ? indices.length : Math.min(indices.length, essais.length + 1);

  const proposer = (cle: string) => {
    if (fini || !cible) return;
    const suite = [...essais, cle];
    setEssais(suite);
    setSaisie("");
    if (cleStock) ecrire(cleStock, { essais: suite });
  };

  const suggestions = useMemo(() => {
    const q = norm(saisie.trim());
    if (q.length < 2) return [];
    return oeuvres.filter((o) => !essais.includes(o.cle) && norm(`${o.titre} ${o.auteur}`).includes(q)).slice(0, 8);
  }, [saisie, oeuvres, essais]);

  if (!j.nbJouables) return <p className="mj-vide">Pas encore assez d&apos;œuvres pour jouer.</p>;

  const contenu = (i: Indice, rang: number) => {
    if (!cible) return null;
    switch (i) {
      case "genre":
        return <span className="dv-gros">{cible.genre}</span>;
      case "sousGenres":
        return (
          <span className="dv-chips">
            {cible.sousGenres.map((s) => (
              <span key={s}>{s}</span>
            ))}
          </span>
        );
      case "liees":
        return (
          <ul className="dv-liees">
            {cible.liees.map((c) => {
              const o = parCle.get(c);
              return o ? (
                <li key={c} title={`${o.titre} — ${o.auteur}`}>
                  <span className="dv-liees__cover">
                    <Pochette o={o} alt="" />
                  </span>
                  <span className="dv-liees__titre">{o.titre}</span>
                </li>
              ) : null;
            })}
          </ul>
        );
      case "annee":
        return <span className="dv-gros">{cible.annee}</span>;
      case "pochette": {
        // plus nette à chaque essai qui suit l'arrivée de l'indice
        const depuis = Math.max(0, visibles - 1 - rang);
        return <Mosaique o={cible} cases={fini ? 0 : NETTETE_POCHETTE[Math.min(depuis, NETTETE_POCHETTE.length - 1)]!} className="dv-pochette" />;
      }
      case "extrait":
        return <Extrait key={cible.cle} media={cible.media!} />;
    }
  };
  const NOMS: Record<Indice, string> = { genre: "Genre", sousGenres: "Sous-genres", liees: "Œuvres reliées", annee: "Année", pochette: "Pochette", extrait: "Extrait" };

  const partage = () => {
    const carres = indices.map((_, k) => (gagne && k === essais.length - 1 ? "🟩" : k < essais.length ? "🟥" : "⬛")).join("");
    const tete = `Henassa · Devine l'œuvre${j.mode === "jour" && j.jour ? " · " + jourLisible(j.jour) : ""} · ${gagne ? essais.length : "X"}/${indices.length}`;
    copier(`${tete}\n${carres}`).then((ok) => setCopie(ok ? "ok" : "non"));
  };

  return (
    <div className="mj devine">
      <ChoixPartie j={j} id="dv" />
      {!cible ? (
        <p className="mj-vide">{j.mode === "libre" ? "Aucune œuvre ne correspond à ces filtres." : "Chargement…"}</p>
      ) : (
        <div className="dv-jeu">
          <ol className="dv-indices">
            {indices.map((i, k) => (
              <li key={i} className={`dv-indice${k < visibles ? " is-ouvert" : ""}`}>
                <span className="dv-indice__num">{k + 1}</span>
                <span className="dv-indice__nom">{NOMS[i]}</span>
                <div className="dv-indice__contenu">{k < visibles ? contenu(i, k) : <span className="dv-cache">Encore {k - visibles + 1} essai{k - visibles + 1 > 1 ? "s" : ""}</span>}</div>
              </li>
            ))}
          </ol>

          <div className="dv-cote">
            {fini ? (
              <div className="mj-fin" role="status">
                <p className="mj-fin__verdict">{gagne ? `Trouvé avec ${essais.length} indice${essais.length > 1 ? "s" : ""}` : "Raté"}</p>
                <Mosaique o={cible} cases={0} className="dv-reponse" />
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
              <div className="dv-saisie">
                <p className="mj-indice">
                  {TYPES_OEUVRE[cible.type].label} à trouver · essai {essais.length + 1} / {indices.length}
                </p>
                <label className="search dv-champ">
                  <span className="visually-hidden">Ta réponse</span>
                  <input id="dv-reponse" type="search" autoComplete="off" placeholder="Tape un titre ou un artiste…" value={saisie} onChange={(e) => setSaisie(e.target.value)} />
                </label>
                {suggestions.length > 0 && (
                  <ul className="dv-suggestions">
                    {suggestions.map((o) => (
                      <li key={o.cle}>
                        <button type="button" onClick={() => proposer(o.cle)}>
                          <span className="dv-suggestions__titre">{o.titre}</span>
                          <span className="dv-suggestions__auteur">{o.auteur}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {saisie.trim().length >= 2 && suggestions.length === 0 && <p className="mj-note">Aucune œuvre du site ne correspond.</p>}
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
      )}
    </div>
  );
}
