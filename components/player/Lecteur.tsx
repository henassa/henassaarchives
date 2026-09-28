"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { isAudioFile, youtubeId } from "@/lib/media";

/*
 * Lecteur global : il vit dans le layout, donc il continue de jouer
 * quand on change de page. N'importe quel composant peut lancer un
 * morceau avec usePlayer().play({...}).
 *
 * Il sert aussi de « dock » : quand on réduit la fiche d'une œuvre
 * dans Connexions, elle vient se ranger ici (bouton « Fiche » pour la rouvrir).
 */

export type Piste = {
  titre: string;
  auteur?: string;
  cover?: string;
  /** Lien YouTube ou fichier audio. Facultatif : une fiche réduite peut ne rien jouer. */
  media?: string;
  couleur?: string;
  /** Page liée (ex. la page Playlist). */
  href?: string;
  /** Identifiant de l'œuvre dans Connexions : active le bouton « Fiche ». */
  slug?: string;
  /** false = chargé en pause. */
  autoplay?: boolean;
};

type PlayerCtx = {
  piste: Piste | null;
  playing: boolean;
  play: (p: Piste) => void;
  /** Range une œuvre dans le lecteur, réduit, sans lancer la lecture. */
  dock: (p: Piste) => void;
  toggle: () => void;
  stop: () => void;
};

const Ctx = createContext<PlayerCtx | null>(null);

export function usePlayer() {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePlayer doit être utilisé dans <PlayerProvider>");
  return c;
}

/** Événement écouté par Connexions pour rouvrir une fiche. */
export const OUVRIR_FICHE = "henassa:ouvrir-fiche";

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [piste, setPiste] = useState<Piste | null>(null);
  const [playing, setPlaying] = useState(false);
  const [min, setMin] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const pathname = usePathname();
  const router = useRouter();

  const yt = piste ? youtubeId(piste.media) : null;
  const audio = piste && !yt && isAudioFile(piste.media) ? piste.media : null;
  const playable = !!(yt || audio);

  const pisteRef = useRef<Piste | null>(null);
  pisteRef.current = piste;

  const command = (func: "playVideo" | "pauseVideo") => {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args: [] }), "*");
  };

  const play = useCallback((p: Piste) => {
    const cur = pisteRef.current;
    if (cur && cur.media && cur.media === p.media) {
      // Même morceau (déjà chargé, éventuellement en pause) : on relance
      command("playVideo");
      audioRef.current?.play().catch(() => {});
    } else {
      setPiste({ ...p, autoplay: true });
    }
    setPlaying(true);
  }, []);

  const dock = useCallback((p: Piste) => {
    const cur = pisteRef.current;
    if (!cur || (p.slug && cur.slug === p.slug)) {
      if (!cur) {
        setPiste({ ...p, autoplay: false });
        setPlaying(false);
      }
      setMin(true);
    }
  }, []);

  const toggle = useCallback(() => {
    if (yt) {
      command(playing ? "pauseVideo" : "playVideo");
      setPlaying(!playing);
    } else if (audioRef.current) {
      if (audioRef.current.paused) audioRef.current.play().catch(() => {});
      else audioRef.current.pause();
    }
  }, [yt, playing]);

  const stop = useCallback(() => {
    setPiste(null);
    setPlaying(false);
    setMin(false);
  }, []);

  const ouvrirFiche = () => {
    if (!piste?.slug) return;
    if (pathname.startsWith("/connexions")) {
      window.dispatchEvent(new CustomEvent(OUVRIR_FICHE, { detail: piste.slug }));
    } else {
      router.push(`/connexions?oeuvre=${piste.slug}`);
    }
  };

  // État réel de la vidéo YouTube (lecture / pause), envoyé par l'iframe
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      try {
        if (!/youtube(-nocookie)?\.com$/.test(new URL(e.origin).hostname)) return;
        const data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        const state = data?.info?.playerState ?? (data?.event === "onStateChange" ? data.info : undefined);
        if (state === 1) setPlaying(true);
        else if (state === 2 || state === 0) setPlaying(false);
      } catch {}
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  const onIframeLoad = () => {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: "henassa", channel: "widget" }), "*");
  };

  const autoplay = piste?.autoplay !== false;
  const label = !playable ? "Fiche réduite" : playing ? "En lecture" : "En pause";

  return (
    <Ctx.Provider value={{ piste, playing, play, dock, toggle, stop }}>
      {children}
      {piste && (
        <div
          className={`lecteur${min ? " is-min" : ""}${yt ? "" : " lecteur--audio"}`}
          style={{ ["--type" as string]: piste.couleur ?? "#ffffff" }}
          role="region"
          aria-label="Lecteur"
        >
          <div className="lecteur__media">
            {yt ? (
              <iframe
                key={yt}
                ref={iframeRef}
                src={`https://www.youtube-nocookie.com/embed/${yt}?autoplay=${autoplay ? 1 : 0}&rel=0&modestbranding=1&enablejsapi=1`}
                title={`Lecteur : ${piste.titre}`}
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                onLoad={onIframeLoad}
              />
            ) : (
              <>
                {piste.cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={piste.cover} alt="" />
                ) : (
                  <span className="lecteur__fallback">♪</span>
                )}
                {audio && (
                  <audio
                    key={audio}
                    ref={audioRef}
                    src={audio}
                    autoPlay={autoplay}
                    onPlay={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                    onEnded={() => setPlaying(false)}
                  />
                )}
              </>
            )}
          </div>

          <div className="lecteur__info">
            <span className="lecteur__label">{label}</span>
            {piste.slug ? (
              <button type="button" className="lecteur__title" onClick={ouvrirFiche} title="Ouvrir la fiche">
                {piste.titre}
              </button>
            ) : piste.href ? (
              <Link href={piste.href} className="lecteur__title">
                {piste.titre}
              </Link>
            ) : (
              <span className="lecteur__title">{piste.titre}</span>
            )}
            {piste.auteur && <span className="lecteur__author">{piste.auteur}</span>}
          </div>

          <div className="lecteur__ctrl">
            {playable && (min || !yt) && (
              <button type="button" className="ctrl-btn lecteur__play" onClick={toggle} aria-label={playing ? "Pause" : "Lecture"}>
                {playing ? "❚❚" : "▶"}
              </button>
            )}
            {piste.slug && (
              <button type="button" className="ctrl-btn ctrl-btn--text lecteur__fiche" onClick={ouvrirFiche} title="Ouvrir la fiche de l'œuvre">
                Fiche
              </button>
            )}
            {yt && (
              <button
                type="button"
                className="ctrl-btn"
                onClick={() => setMin(!min)}
                aria-label={min ? "Agrandir le lecteur" : "Réduire le lecteur"}
                title={min ? "Agrandir" : "Réduire"}
              >
                {min ? "⤢" : "–"}
              </button>
            )}
            <button type="button" className="ctrl-btn" onClick={stop} aria-label="Fermer le lecteur" title="Fermer">
              ×
            </button>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

/** Bouton « Écouter » réutilisable (fiche d'œuvre, tracklist...). */
export function PlayButton({ piste, className = "", compact = false }: { piste: Piste; className?: string; compact?: boolean }) {
  const { piste: cur, playing, play, toggle } = usePlayer();
  const current = !!cur?.media && cur.media === piste.media;
  const label = current ? (playing ? "Pause" : "Reprendre") : "Écouter";
  return (
    <button
      type="button"
      className={`${compact ? "track__link" : "play-btn"}${current ? " is-current" : ""} ${className}`}
      style={piste.couleur ? { ["--type" as string]: piste.couleur } : undefined}
      onClick={() => (current ? toggle() : play(piste))}
      aria-label={`${label} : ${piste.titre}`}
    >
      {compact ? (current && playing ? "❚❚" : "▶") : (
        <>
          <span aria-hidden="true">{current && playing ? "❚❚" : "▶"}</span> {current && playing ? "En lecture — pause" : label}
        </>
      )}
    </button>
  );
}
