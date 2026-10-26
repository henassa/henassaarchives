"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Avatar, teinteDe } from "./commun";
import { PlateauTierlist, RANGS_MAX, appliquer, etatTierlistDepart, type ActionTierlist, type Eclair, type EtatTierlist, type ItemJeu } from "./Tierlist";
import { HOTE, LONGUEUR_CODE, useSalon, type Joueur } from "./useSalon";

/*
 * Tierlist à plusieurs, en ligne, comme un document partagé :
 * tout le monde voit la même tierlist et peut, en même temps, glisser les œuvres,
 * créer, renommer, déplacer ou supprimer les rangs, et changer le titre.
 *
 * Chaque geste part tout de suite sur l'écran de celui qui le fait (pas d'attente),
 * et chez l'hôte, qui l'applique à la tierlist de référence et la renvoie à tout le monde.
 * Les œuvres qu'un autre vient de bouger s'allument un instant, avec son pseudo.
 */

const MAX_JOUEURS = 12;
/** Les derniers déplacements gardés pour les faire « s'allumer » chez les autres. */
const JOURNAL_MAX = 16;
/** Durée de l'allumage d'une œuvre bougée par un autre joueur (millisecondes). */
const ECLAIR = 2200;

type Etat = EtatTierlist & {
  joueurs: Joueur[];
  /** Pour chaque joueur, le numéro de sa dernière action appliquée par l'hôte. */
  vus: Record<string, number>;
  /** Les derniers déplacements : quelle œuvre, par qui. */
  journal: { n: number; cle: string; par: string }[];
  n: number;
};
type Message = { t: "action"; seq: number; a: ActionTierlist };

const etatVide = (): Etat => ({ ...etatTierlistDepart("Notre tierlist"), joueurs: [], vus: {}, journal: [], n: 0 });

const texte = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : null);

/** Une action reçue d'un joueur, vérifiée avant d'être appliquée (on ne fait confiance à personne). */
function nettoyer(brut: unknown, parCle: Map<string, ItemJeu>): ActionTierlist | null {
  const a = brut as Record<string, unknown> | null;
  if (!a || typeof a !== "object") return null;
  switch (a.t) {
    case "deplacer": {
      const cle = texte(a.cle, 200), zone = texte(a.zone, 40);
      if (!cle || !zone || !parCle.has(cle)) return null;
      const index = typeof a.index === "number" && Number.isInteger(a.index) && a.index >= 0 ? a.index : undefined;
      return { t: "deplacer", cle, zone, index };
    }
    case "nom": {
      const id = texte(a.id, 40), nom = texte(a.nom, 24);
      return id && nom !== null ? { t: "nom", id, nom } : null;
    }
    case "bouger": {
      const id = texte(a.id, 40);
      return id && (a.sens === 1 || a.sens === -1) ? { t: "bouger", id, sens: a.sens } : null;
    }
    case "supprimer":
    case "ajouter": {
      const id = texte(a.id, 40);
      return id ? { t: a.t, id } : null;
    }
    case "titre": {
      const titre = texte(a.titre, 60);
      return titre !== null ? { t: "titre", titre } : null;
    }
    case "vider":
      return { t: "vider" };
  }
  return null;
}

export function TierlistSalon({ oeuvres }: { oeuvres: ItemJeu[] }) {
  const parCle = useMemo(() => new Map(oeuvres.map((o) => [o.cle, o])), [oeuvres]);

  /* ---------- Côté hôte : il applique les actions de tout le monde ---------- */
  const s = useSalon<Etat>({
    prefixe: "henassa-tierlist-",
    vide: etatVide,
    max: MAX_JOUEURS,
    surJeu: (id, brut) => recevoir(id, brut as Message),
  });
  const { lire, ecrire } = s;

  const recevoir = useCallback(
    (id: string, m: Message) => {
      if (m?.t !== "action" || typeof m.seq !== "number") return;
      const e = lire();
      if (!e.joueurs.some((j) => j.id === id) || m.seq <= (e.vus[id] ?? 0)) return;
      const a = nettoyer(m.a, parCle);
      const vus = { ...e.vus, [id]: m.seq };
      if (!a || (a.t === "ajouter" && e.rangs.length >= RANGS_MAX)) return ecrire({ ...e, vus });
      const apres = appliquer(e, a);
      const n = a.t === "deplacer" ? e.n + 1 : e.n;
      const journal = a.t === "deplacer" ? [...e.journal, { n, cle: a.cle, par: id }].slice(-JOURNAL_MAX) : e.journal;
      ecrire({ ...e, titre: apres.titre, rangs: apres.rangs, vus, journal, n });
    },
    [lire, ecrire, parCle]
  );

  /* ---------- Côté joueur : ses gestes s'affichent tout de suite ---------- */
  const e = s.etat;
  const enAttente = useRef<{ seq: number; a: ActionTierlist }[]>([]);
  const seq = useRef(0);
  const [, rafraichir] = useState(0);
  const moiRef = useRef(s.moi);
  // nouvelle connexion (nouvel identifiant) : on repart de zéro
  if (moiRef.current !== s.moi) {
    moiRef.current = s.moi;
    enAttente.current = [];
    seq.current = 0;
  }
  const dejaVu = e.vus[s.moi] ?? 0;
  enAttente.current = enAttente.current.filter((p) => p.seq > dejaVu);
  // ce que je vois : la tierlist de l'hôte, plus mes gestes qu'il n'a pas encore reçus
  const vue = enAttente.current.reduce<EtatTierlist>((acc, p) => appliquer(acc, p.a), { titre: e.titre, rangs: e.rangs });

  const agir = useCallback(
    (a: ActionTierlist) => {
      seq.current = Math.max(seq.current, dejaVu) + 1;
      enAttente.current = [...enAttente.current, { seq: seq.current, a }];
      rafraichir((x) => x + 1);
      s.envoyer({ t: "action", seq: seq.current, a } satisfies Message);
    },
    [s, dejaVu]
  );

  /* ---------- Ce que bougent les autres : ça s'allume un instant ---------- */
  const [eclairs, setEclairs] = useState<Record<string, Eclair>>({});
  const vuJusqua = useRef(-1);
  useEffect(() => {
    // à l'arrivée dans le salon, on ne rallume pas tout l'historique
    if (vuJusqua.current < 0) {
      vuJusqua.current = e.n;
      return;
    }
    const nouveaux = e.journal.filter((x) => x.n > vuJusqua.current && x.par !== s.moi);
    vuJusqua.current = Math.max(vuJusqua.current, e.n);
    if (!nouveaux.length) return;
    const ajout: Record<string, Eclair> = {};
    for (const x of nouveaux) {
      const nom = e.joueurs.find((j) => j.id === x.par)?.nom ?? "?";
      ajout[x.cle] = { nom, teinte: teinteDe(nom) };
    }
    setEclairs((avant) => ({ ...avant, ...ajout }));
    const t = setTimeout(() => setEclairs((avant) => Object.fromEntries(Object.entries(avant).filter(([c]) => !(c in ajout)))), ECLAIR);
    return () => clearTimeout(t);
  }, [e.n, e.journal, e.joueurs, s.moi]);

  /* ---------- Affichage ---------- */
  const [edition, setEdition] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);

  if (!s.role) {
    return (
      <div className="dilemme salon">
        <div className="dl-bloc">
          <h2 className="dl-h">Ton pseudo</h2>
          <label className="sl-champ">
            <span className="visually-hidden">Ton pseudo</span>
            <input id="sl-pseudo" value={s.nom} maxLength={16} autoComplete="off" placeholder="Comment on t'appelle ?" onChange={(x) => s.setNom(x.target.value)} />
          </label>
          <p className="dl-note">Les autres le verront quand tu bouges une œuvre. Tu pourras le changer dans le salon.</p>
        </div>
        <div className="sl-choix">
          <div className="sl-carte">
            <h2 className="dl-h">Créer un salon</h2>
            <p className="dl-note">Une tierlist partagée : tu invites tes potes avec un code, et vous la remplissez ensemble, en direct.</p>
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

  return (
    <div className="tls-doc">
      <div className="dilemme salon">
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
          <button type="button" className="ctrl-btn ctrl-btn--text ctrl-btn--danger" onClick={s.partir}>
            Quitter
          </button>
        </div>
        <ul className="sl-joueurs" aria-label="Dans le salon">
          {e.joueurs.map((j) => (
            <li key={j.id} className={j.id === s.moi ? "est-moi" : ""}>
              <Avatar nom={j.nom} />
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
          ))}
        </ul>
        {e.joueurs.length < 2 && <p className="dl-note">Envoie le code ou le lien à tes potes : tout ce que chacun fait s&apos;affiche chez les autres.</p>}
      </div>

      <PlateauTierlist oeuvres={oeuvres} parCle={parCle} etat={vue} agir={agir} eclairs={eclairs} placeholderTitre="Titre de la tierlist" />
    </div>
  );
}
