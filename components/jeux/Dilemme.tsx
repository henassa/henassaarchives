"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pochette } from "@/components/connexions/Pochette";
import { initiales } from "@/components/connexions/utils";
import { PlayButton } from "@/components/player/Lecteur";
import { TYPES_OEUVRE, type TypeOeuvre } from "@/lib/sections";
import { FiltresJeuBarre, useFiltresJeu } from "./Filtres";

/*
 * Dilemme : un tournoi à élimination directe.
 * On choisit un univers, des filtres (genre, sous-genre, années) et une taille (8, 16, 32... œuvres tirées au
 * hasard), puis on tranche duel après duel jusqu'à la finale.
 */

export type ItemDuel = { cle: string; titre: string; auteur: string; annee?: number; type: TypeOeuvre; genre?: string; sousGenres?: string[]; cover?: string; media?: string };

/** Tailles de tournoi proposées (celles qui dépassent le nombre d'œuvres sont grisées). */
export const TAILLES = [8, 16, 32, 64, 128, 256];

type Partie = {
  /** Œuvres encore en lice dans ce tour, dans l'ordre des duels. */
  tour: string[];
  /** Qualifiées pour le tour suivant. */
  suite: string[];
  /** Numéro du duel en cours dans ce tour (0, 1, 2...). */
  duel: number;
  /** Éliminées : la clé et la taille du tour où elles sont sorties. */
  sorties: { cle: string; tour: number }[];
};

export function melanger<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j]!, r[i]!];
  }
  return r;
}

export function nomDuTour(n: number) {
  if (n === 2) return "Finale";
  if (n === 4) return "Demi-finales";
  if (n === 8) return "Quarts de finale";
  if (n === 16) return "Huitièmes de finale";
  return `Tour de ${n}`;
}

export function Dilemme({ oeuvres }: { oeuvres: ItemDuel[] }) {
  const parCle = useMemo(() => new Map(oeuvres.map((o) => [o.cle, o])), [oeuvres]);
  const f = useFiltresJeu(oeuvres);
  const [taille, setTaille] = useState(16);
  const [partie, setPartie] = useState<Partie | null>(null);
  const [export_, setExport] = useState<"" | "encours" | "erreur">("");

  const vivier = f.vivier;
  /** Rappel des filtres sur l'image du résultat : « Hip Hop · Trap · 2015-2020 ». */
  const etiquette = [f.genre, f.sousGenre, f.de || f.a ? (f.de && f.a ? (f.de === f.a ? `${f.de}` : `${f.de}-${f.a}`) : f.de ? `depuis ${f.de}` : `jusqu'à ${f.a}`) : ""].filter(Boolean).join(" · ");
  const taillesPossibles = TAILLES.filter((t) => t <= vivier.length);
  const tailleChoisie = taillesPossibles.includes(taille) ? taille : taillesPossibles[taillesPossibles.length - 1];

  // Au lancement, on amène le duel en haut de l'écran
  const zone = useRef<HTMLDivElement>(null);
  const enCours = !!partie;
  useEffect(() => {
    if (enCours) zone.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [enCours]);

  const lancer = () => {
    if (!tailleChoisie) return;
    setPartie({ tour: melanger(vivier).slice(0, tailleChoisie).map((o) => o.cle), suite: [], duel: 0, sorties: [] });
    setExport("");
  };

  const choisir = useCallback(
    (gagnant: string) => {
      const p = partie;
      if (!p || p.tour.length < 2) return;
      const a = p.tour[p.duel * 2]!, b = p.tour[p.duel * 2 + 1]!;
      if (gagnant !== a && gagnant !== b) return;
      const suite = [...p.suite, gagnant];
      const sorties = [...p.sorties, { cle: gagnant === a ? b : a, tour: p.tour.length }];
      // dernier duel du tour : les qualifiées forment le tour suivant
      setPartie((p.duel + 1) * 2 >= p.tour.length ? { tour: suite, suite: [], duel: 0, sorties } : { ...p, suite, duel: p.duel + 1, sorties });
    },
    [partie]
  );

  const fini = !!partie && partie.tour.length === 1;
  const gauche = partie && !fini ? parCle.get(partie.tour[partie.duel * 2]!) : undefined;
  const droite = partie && !fini ? parCle.get(partie.tour[partie.duel * 2 + 1]!) : undefined;

  // Flèches gauche / droite pour choisir
  useEffect(() => {
    if (!gauche || !droite) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest("input, select, textarea")) return;
      if (e.key === "ArrowLeft") choisir(gauche.cle);
      if (e.key === "ArrowRight") choisir(droite.cle);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [gauche, droite, choisir]);

  /* ---------- Réglages ---------- */
  if (!partie) {
    return (
      <div className="dilemme dl-reglages">
        <div className="dl-bloc">
          <h2 className="dl-h">Quelles œuvres ?</h2>
          <FiltresJeuBarre f={f} id="dl" />
        </div>
        <div className="dl-bloc">
          <h2 className="dl-h">Combien d&apos;œuvres ?</h2>
          <div className="filters" role="group" aria-label="Taille du tournoi">
            {TAILLES.map((t) => (
              <button key={t} type="button" className={`filter dl-taille${tailleChoisie === t ? " is-on" : ""}`} aria-pressed={tailleChoisie === t} disabled={t > vivier.length} onClick={() => setTaille(t)}>
                {t}
              </button>
            ))}
          </div>
          <p className="dl-note">
            {vivier.length} œuvre{vivier.length > 1 ? "s" : ""} correspond{vivier.length > 1 ? "ent" : ""} à ces réglages.
            {tailleChoisie ? ` ${tailleChoisie} seront tirées au hasard, soit ${tailleChoisie - 1} duels.` : " Il en faut au moins 8 : enlève un filtre."}
          </p>
        </div>
        <button type="button" className="dl-lancer" onClick={lancer} disabled={!tailleChoisie}>
          Lancer le dilemme →
        </button>
      </div>
    );
  }

  /* ---------- Résultat ---------- */
  if (fini) {
    const vainqueur = parCle.get(partie.tour[0]!)!;
    const finaliste = partie.sorties.filter((s) => s.tour === 2).map((s) => parCle.get(s.cle)!);
    const demis = partie.sorties.filter((s) => s.tour === 4).map((s) => parCle.get(s.cle)!);

    const telecharger = async () => {
      setExport("encours");
      try {
        const L = 1080, H = 1350, M = 72;
        const c = document.createElement("canvas");
        c.width = L;
        c.height = H;
        const x = c.getContext("2d")!;
        await document.fonts?.ready;
        const charger = (o: ItemDuel) =>
          new Promise<HTMLImageElement | null>((ok) => {
            if (!o.cover) return ok(null);
            const i = new Image();
            i.onload = () => ok(i);
            i.onerror = () => ok(null);
            i.src = o.cover;
          });
        const dessiner = (o: ItemDuel, img: HTMLImageElement | null, px: number, py: number, s: number) => {
          if (img) {
            const k = Math.min(img.naturalWidth, img.naturalHeight);
            x.drawImage(img, (img.naturalWidth - k) / 2, (img.naturalHeight - k) / 2, k, k, px, py, s, s);
          } else {
            x.fillStyle = "#1a1a1a";
            x.fillRect(px, py, s, s);
            x.fillStyle = "#fff";
            x.textAlign = "center";
            x.textBaseline = "middle";
            x.font = `400 ${s * 0.4}px Anton, Impact, sans-serif`;
            x.fillText(initiales(o), px + s / 2, py + s / 2);
          }
        };
        const accent = "#3FD68A";
        x.fillStyle = "#0a0a0a";
        x.fillRect(0, 0, L, H);
        x.textAlign = "left";
        x.textBaseline = "alphabetic";
        x.fillStyle = accent;
        x.font = "800 24px Archivo, sans-serif";
        x.fillText(`DILEMME · ${partie.sorties.length + 1} ŒUVRES${etiquette ? " · " + etiquette.toUpperCase() : ""}`, M, M + 22);
        // Vainqueur
        const s1 = 640, vx = (L - s1) / 2, vy = 150;
        dessiner(vainqueur, await charger(vainqueur), vx, vy, s1);
        x.strokeStyle = accent;
        x.lineWidth = 8;
        x.strokeRect(vx, vy, s1, s1);
        x.textAlign = "center";
        x.fillStyle = "#fff";
        let fs = 72;
        x.font = `400 ${fs}px Anton, Impact, sans-serif`;
        while (fs > 30 && x.measureText(vainqueur.titre.toUpperCase()).width > L - M * 2) x.font = `400 ${--fs}px Anton, Impact, sans-serif`;
        x.fillText(vainqueur.titre.toUpperCase(), L / 2, vy + s1 + 84);
        x.fillStyle = "#a6a6a6";
        x.font = "600 30px Archivo, sans-serif";
        x.fillText(vainqueur.auteur, L / 2, vy + s1 + 130, L - M * 2);
        // Podium : finaliste + demi-finalistes
        const suivants = [...finaliste, ...demis];
        const s2 = 150, gap = 24, total = suivants.length * s2 + (suivants.length - 1) * gap;
        let px = (L - total) / 2;
        const py = 1010;
        for (const [i, o] of suivants.entries()) {
          dessiner(o, await charger(o), px, py, s2);
          x.textAlign = "center";
          x.textBaseline = "alphabetic";
          x.fillStyle = i === 0 ? "#fff" : "#a6a6a6";
          x.font = "800 16px Archivo, sans-serif";
          x.fillText(i === 0 ? "FINALISTE" : "DEMI-FINALE", px + s2 / 2, py + s2 + 26);
          px += s2 + gap;
        }
        // Signature
        x.textAlign = "right";
        x.font = "44px UnifrakturMaguntia, serif";
        x.lineWidth = 1.2;
        x.strokeStyle = "#FF4D3D";
        x.strokeText("Henassa", L - M, H - M + 6);
        x.font = "400 34px Anton, Impact, sans-serif";
        x.lineWidth = 6;
        x.strokeStyle = "#0a0a0a";
        x.strokeText("HENASSA", L - M - 8, H - M + 8);
        x.fillStyle = "#fff";
        x.fillText("HENASSA", L - M - 8, H - M + 8);

        const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/png"));
        if (!blob) throw new Error("image vide");
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "henassa-dilemme.png";
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        setExport("");
      } catch {
        setExport("erreur");
      }
    };

    return (
      <div className="dilemme dl-fin" ref={zone}>
        <p className="dl-tour">Vainqueur</p>
        <div className="dl-vainqueur" style={{ ["--type" as string]: TYPES_OEUVRE[vainqueur.type].couleur }}>
          <span className="dl-vainqueur__echo" aria-hidden="true">
            {vainqueur.titre.split(/\s+/)[0]}
          </span>
          <div className="dl-vainqueur__cover">
            <Pochette o={vainqueur} alt="" lazy={false} />
          </div>
          <h2 className="dl-vainqueur__titre">{vainqueur.titre}</h2>
          <p className="dl-carte__auteur">
            {vainqueur.auteur}
            {vainqueur.annee ? ` · ${vainqueur.annee}` : ""}
          </p>
          {vainqueur.media && <PlayButton piste={{ titre: vainqueur.titre, auteur: vainqueur.auteur, cover: vainqueur.cover, media: vainqueur.media, slug: vainqueur.cle }} />}
        </div>
        {(finaliste.length > 0 || demis.length > 0) && (
          <ul className="dl-podium">
            {[...finaliste, ...demis].map((o, i) => (
              <li key={o.cle}>
                <div className="dl-podium__cover">
                  <Pochette o={o} alt="" />
                </div>
                <span className="dl-podium__rang">{i < finaliste.length ? "Finaliste" : "Demi-finale"}</span>
                <span className="dl-podium__titre">{o.titre}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="dl-actions">
          <button type="button" className="ctrl-btn ctrl-btn--text" onClick={lancer}>
            Rejouer
          </button>
          <button type="button" className="ctrl-btn ctrl-btn--text" onClick={() => setPartie(null)}>
            Changer les réglages
          </button>
          <button type="button" className="ctrl-btn ctrl-btn--text" onClick={telecharger} disabled={export_ === "encours"}>
            {export_ === "encours" ? "Préparation…" : "Télécharger l'image"}
          </button>
        </div>
        {export_ === "erreur" && <p className="tl-message">L&apos;image n&apos;a pas pu être créée. Réessaie, ou fais une capture d&apos;écran.</p>}
      </div>
    );
  }

  /* ---------- Duel ---------- */
  const nbDuels = partie.tour.length / 2;
  const total = partie.sorties.length + partie.tour.length - partie.suite.length - 1; // duels au total = œuvres - 1
  const faits = partie.sorties.length;
  const carte = (o: ItemDuel, cote: "gauche" | "droite") => (
    <div className={`dl-carte dl-carte--${cote}`} style={{ ["--type" as string]: TYPES_OEUVRE[o.type].couleur }}>
      <button type="button" className="dl-carte__choix" onClick={() => choisir(o.cle)} aria-label={`Choisir ${o.titre}, ${o.auteur}`}>
        <span className="dl-carte__cover">
          <Pochette o={o} alt="" lazy={false} />
        </span>
        <span className="dl-carte__titre">{o.titre}</span>
        <span className="dl-carte__auteur">
          {o.auteur}
          {o.annee ? ` · ${o.annee}` : ""}
        </span>
      </button>
      {o.media && <PlayButton compact piste={{ titre: o.titre, auteur: o.auteur, cover: o.cover, media: o.media, slug: o.cle }} className="dl-carte__ecouter" />}
    </div>
  );

  return (
    <div className="dilemme dl-jeu" ref={zone}>
      <div className="dl-entete">
        <p className="dl-tour">{nomDuTour(partie.tour.length)}</p>
        <p className="dl-compte">
          {partie.tour.length > 2 ? `Duel ${partie.duel + 1} / ${nbDuels}` : "Le dernier choix"}
        </p>
      </div>
      <div className="dl-barre" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={faits} aria-label="Avancement du tournoi">
        <i style={{ width: `${(faits / Math.max(1, total)) * 100}%` }} />
      </div>
      {gauche && droite && (
        <div className="dl-duel" key={`${partie.tour.length}-${partie.duel}`}>
          {carte(gauche, "gauche")}
          <span className="dl-vs" aria-hidden="true">
            vs
          </span>
          {carte(droite, "droite")}
        </div>
      )}
      <div className="dl-actions">
        <button type="button" className="ctrl-btn ctrl-btn--text" onClick={() => setPartie(null)}>
          Abandonner
        </button>
      </div>
      <p className="dl-note dl-note--centre">Clique une œuvre pour la garder. Au clavier : flèches gauche et droite.</p>
    </div>
  );
}
