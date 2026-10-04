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
 * Le lecteur a sa propre interface (pochette, lecture, barre de temps, volume).
 * La vidéo YouTube joue en coulisses ; le bouton « Vidéo » l'affiche si on veut la voir.
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
const VOLUME_STOCK = "henassa-volume";

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [piste, setPiste] = useState<Piste | null>(null);
  const [playing, setPlaying] = useState(false);
  const [min, setMin] = useState(false);
  /** Position et durée du morceau, en secondes. */
  const [temps, setTemps] = useState(0);
  const [duree, setDuree] = useState(0);
  /** La vidéo YouTube est-elle affichée ? (cachée par défaut) */
  const [video, setVideo] = useState(false);
  /** YouTube a refusé de démarrer tout seul : on montre la vidéo pour que le visiteur appuie dessus. */
  const [bloque, setBloque] = useState(false);
  const aJoue = useRef(false);
  /** Pendant qu'on déplace le curseur de temps, on n'écoute plus la position envoyée par YouTube. */
  const glisse = useRef(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const pathname = usePathname();
  const router = useRouter();

  const yt = piste ? youtubeId(piste.media) : null;
  const audio = piste && !yt && isAudioFile(piste.media) ? piste.media : null;
  const playable = !!(yt || audio);

  const pisteRef = useRef<Piste | null>(null);
  pisteRef.current = piste;

  const command = (func: "playVideo" | "pauseVideo" | "setVolume" | "mute" | "unMute" | "seekTo", args: unknown[] = []) => {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), "*");
  };

  // Volume (0 à 100) : réglé ici plutôt que dans la vidéo YouTube, trop petite pour ça.
  // Il est gardé d'un morceau à l'autre et d'une visite à l'autre.
  const [volume, setVolume] = useState(100);
  const avantMuet = useRef(100);
  const volumeRef = useRef(100);
  volumeRef.current = volume;
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(VOLUME_STOCK));
      if (localStorage.getItem(VOLUME_STOCK) !== null && v >= 0 && v <= 100) setVolume(v);
    } catch {}
  }, []);
  const appliquerVolume = useCallback((v: number) => {
    command("setVolume", [v]);
    command(v === 0 ? "mute" : "unMute");
    if (audioRef.current) audioRef.current.volume = v / 100;
  }, []);
  const changerVolume = (v: number) => {
    setVolume(v);
    appliquerVolume(v);
    try {
      localStorage.setItem(VOLUME_STOCK, String(v));
    } catch {}
  };
  const basculerMuet = () => {
    if (volume > 0) {
      avantMuet.current = volume;
      changerVolume(0);
    } else changerVolume(avantMuet.current || 60);
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
        const info = data?.info;
        if (info && typeof info.duration === "number" && info.duration > 0) setDuree(info.duration);
        if (info && typeof info.currentTime === "number" && !glisse.current) setTemps(info.currentTime);
        if (state === 1) {
          aJoue.current = true;
          setBloque(false);
        }
        // la vidéo démarre : on lui redonne le volume choisi
        if (state === 1) appliquerVolume(volumeRef.current);
        if (state === 1) setPlaying(true);
        else if (state === 2 || state === 0) setPlaying(false);
      } catch {}
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [appliquerVolume]);

  // Nouveau morceau : on repart de zéro, vidéo cachée
  const media = piste?.media;
  useEffect(() => {
    setTemps(0);
    setDuree(0);
    setVideo(false);
    setBloque(false);
    aJoue.current = false;
  }, [media]);

  // Certains navigateurs (surtout sur téléphone) refusent de lancer une vidéo cachée.
  // Si rien n'a démarré au bout de quelques secondes, on affiche la vidéo.
  useEffect(() => {
    if (!yt || !playing || aJoue.current) return;
    const t = setTimeout(() => {
      if (!aJoue.current) {
        setBloque(true);
        setVideo(true);
        setMin(false);
      }
    }, 4500);
    return () => clearTimeout(t);
  }, [yt, playing]);

  const allerA = (sec: number) => {
    setTemps(sec);
    command("seekTo", [sec, true]);
    if (audioRef.current) audioRef.current.currentTime = sec;
  };

  const onIframeLoad = () => {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "listening", id: "henassa", channel: "widget" }), "*");
    appliquerVolume(volumeRef.current);
  };

  const autoplay = piste?.autoplay !== false;
  const label = !playable ? "Fiche réduite" : playing ? "En lecture" : "En pause";

  return (
    <Ctx.Provider value={{ piste, playing, play, dock, toggle, stop }}>
      {children}
      {piste && (
        <div
          className={`lecteur${min ? " is-min" : ""}${playable ? "" : " lecteur--fiche"}`}
          style={{ ["--type" as string]: piste.couleur ?? "#ffffff" }}
          role="region"
          aria-label="Lecteur"
        >
          <div className="lecteur__pochette">
            {piste.cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={piste.cover} alt="" />
            ) : (
              <span className="lecteur__fallback">♪</span>
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
            {playable && min && (
              <button type="button" className="ctrl-btn lecteur__play" onClick={toggle} aria-label={playing ? "Pause" : "Lecture"}>
                {playing ? "❚❚" : "▶"}
              </button>
            )}
            {piste.slug && (!min || !playable) && (
              <button type="button" className="ctrl-btn ctrl-btn--text lecteur__fiche" onClick={ouvrirFiche} title="Ouvrir la fiche de l'œuvre">
                Fiche
              </button>
            )}
            {playable && (
              <button type="button" className="ctrl-btn" onClick={() => setMin(!min)} aria-label={min ? "Agrandir le lecteur" : "Réduire le lecteur"} title={min ? "Agrandir" : "Réduire"}>
                {min ? "⤢" : "–"}
              </button>
            )}
            <button type="button" className="ctrl-btn" onClick={stop} aria-label="Fermer le lecteur" title="Fermer">
              ×
            </button>
          </div>

          {/* La vidéo YouTube : toujours là pour le son, visible seulement si on le demande */}
          {yt && (
            <div className={`lecteur__video${video && !min ? " is-visible" : ""}`}>
              <iframe
                key={yt}
                ref={iframeRef}
                src={`https://www.youtube-nocookie.com/embed/${yt}?autoplay=${autoplay ? 1 : 0}&rel=0&modestbranding=1&enablejsapi=1&playsinline=1`}
                title={`Vidéo : ${piste.titre}`}
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                onLoad={onIframeLoad}
                tabIndex={video && !min ? 0 : -1}
              />
            </div>
          )}
          {audio && (
            <audio
              key={audio}
              ref={audioRef}
              src={audio}
              autoPlay={autoplay}
              onLoadedMetadata={(e) => {
                e.currentTarget.volume = volumeRef.current / 100;
                setDuree(e.currentTarget.duration || 0);
              }}
              onTimeUpdate={(e) => {
                if (!glisse.current) setTemps(e.currentTarget.currentTime);
              }}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
            />
          )}
          {bloque && !min && <p className="lecteur__note">Ton navigateur a bloqué le démarrage : appuie sur lecture dans la vidéo.</p>}

          {playable && (
            <div className="lecteur__barre">
              <button type="button" className="lecteur__play lecteur__play--grand" onClick={toggle} aria-label={playing ? "Pause" : "Lecture"}>
                {playing ? "❚❚" : "▶"}
              </button>
              <span className="lecteur__temps">{minutes(temps)}</span>
              <input
                id="lecteur-temps"
                className="lecteur__curseur"
                type="range"
                min={0}
                max={Math.max(1, Math.floor(duree))}
                step={1}
                value={Math.min(Math.floor(temps), Math.max(1, Math.floor(duree)))}
                disabled={!duree}
                onPointerDown={() => (glisse.current = true)}
                onPointerUp={() => (glisse.current = false)}
                onBlur={() => (glisse.current = false)}
                onChange={(e) => allerA(Number(e.target.value))}
                aria-label="Position dans le morceau"
                aria-valuetext={`${minutes(temps)} sur ${minutes(duree)}`}
                style={{ ["--v" as string]: `${duree ? (temps / duree) * 100 : 0}%` }}
              />
              <span className="lecteur__temps">{duree ? minutes(duree) : "–:––"}</span>
              {yt && (
                <button type="button" className={`ctrl-btn ctrl-btn--text lecteur__voir${video ? " is-on" : ""}`} onClick={() => setVideo(!video)} aria-pressed={video} title={video ? "Cacher la vidéo" : "Afficher la vidéo"}>
                  Vidéo
                </button>
              )}
            </div>
          )}

          {playable && (
            <div className="lecteur__vol">
              <button type="button" className="lecteur__muet" onClick={basculerMuet} aria-label={volume === 0 ? "Remettre le son" : "Couper le son"} title={volume === 0 ? "Remettre le son" : "Couper le son"}>
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                  <path d="M3 9h4l5-4v14l-5-4H3z" fill="currentColor" />
                  {volume === 0 ? (
                    <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="2" fill="none" />
                  ) : (
                    <>
                      <path d="M15.5 9a4 4 0 0 1 0 6" stroke="currentColor" strokeWidth="2" fill="none" />
                      {volume > 50 && <path d="M18 6.5a8 8 0 0 1 0 11" stroke="currentColor" strokeWidth="2" fill="none" />}
                    </>
                  )}
                </svg>
              </button>
              <input
                id="lecteur-volume"
                className="lecteur__curseur"
                type="range"
                min={0}
                max={100}
                step={1}
                value={volume}
                onChange={(e) => changerVolume(Number(e.target.value))}
                aria-label="Volume"
                style={{ ["--v" as string]: `${volume}%` }}
              />
              <span className="lecteur__volnum">{volume}</span>
            </div>
          )}
        </div>
      )}
    </Ctx.Provider>
  );
}

/** 75 → « 1:15 » */
function minutes(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
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