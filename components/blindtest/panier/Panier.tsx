"use client";

import { useEffect, useId, useRef, useState } from "react";
import { chercher, relais } from "@/components/blindtest/lib/api";
import { ajouter, bilanAjout, enregistrer, lireEnregistres, supprimerEnregistre, type ElementPanier, type PanierEnregistre } from "@/components/blindtest/lib/panier";
import type { Album, Artiste, Playlist, Titre, TypeRecherche } from "@/components/blindtest/lib/types";
import { Pochette } from "@/components/blindtest/commun";

/*
 * Le panier de l'hôte : on y met des morceaux par recherche, par artiste (son top),
 * par album (entier ou pistes choisies) ou en collant le lien d'une playlist Deezer.
 */

const ONGLETS: { type: TypeRecherche; nom: string; aide: string }[] = [
  { type: "titre", nom: "Titres", aide: "Un morceau précis" },
  { type: "artiste", nom: "Artistes", aide: "Ses titres les plus écoutés" },
  { type: "album", nom: "Albums", aide: "En entier ou piste par piste" },
  { type: "playlist", nom: "Playlists", aide: "Une playlist publique" },
];

const estLien = (q: string) => /deezer\.(com|page\.link)|dzr\.page\.link|link\.deezer/i.test(q);
const nombre = (n: number) => n.toLocaleString("fr-FR");

type Resultats = { titres?: Titre[]; artistes?: Artiste[]; albums?: Album[]; playlists?: Playlist[] };

export function Panier({ panier, setPanier }: { panier: ElementPanier[]; setPanier: (p: ElementPanier[]) => void }) {
  const [type, setType] = useState<TypeRecherche>("titre");
  const [q, setQ] = useState("");
  const [res, setRes] = useState<Resultats>({});
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState("");
  const [bilan, setBilan] = useState("");
  const [occupe, setOccupe] = useState("");
  const [topN, setTopN] = useState(20);
  const [albumOuvert, setAlbumOuvert] = useState<{ id: string; titres: Titre[]; choisis: Set<string> } | null>(null);
  const [toutVoir, setToutVoir] = useState(false);
  const [enregistres, setEnregistres] = useState<PanierEnregistre[]>([]);
  const [nomSauvegarde, setNomSauvegarde] = useState("");
  const [sauvegardeOuverte, setSauvegardeOuverte] = useState(false);
  const idChamp = useId();
  const panierRef = useRef(panier);
  panierRef.current = panier;

  useEffect(() => setEnregistres(lireEnregistres()), []);

  // Recherche au fil de la frappe (avec un petit délai pour ne pas surcharger le relais)
  useEffect(() => {
    const texte = q.trim();
    setErreur("");
    if (texte.length < 2 || estLien(texte)) {
      setRes({});
      setCharge(false);
      return;
    }
    const ctrl = new AbortController();
    setCharge(true);
    const minuteur = setTimeout(() => {
      chercher(type, texte, ctrl.signal)
        .then((r) => setRes(r))
        .catch((e: Error) => e.name !== "AbortError" && setErreur(e.message))
        .finally(() => !ctrl.signal.aborted && setCharge(false));
    }, 350);
    return () => {
      clearTimeout(minuteur);
      ctrl.abort();
    };
  }, [q, type]);

  const mettre = (titres: Titre[]) => {
    const r = ajouter(panierRef.current, titres);
    setPanier(r.panier);
    setBilan(bilanAjout(r));
  };

  /** Lance une action qui appelle le relais, en affichant qu'on travaille. */
  const travailler = async (cle: string, f: () => Promise<void>) => {
    setOccupe(cle);
    setErreur("");
    try {
      await f();
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setOccupe("");
    }
  };

  const ajouterTop = (a: Artiste) => travailler(`top-${a.id}`, async () => mettre((await relais("top", { id: a.id, n: topN })).titres));
  const ajouterPlaylist = (p: Playlist) => travailler(`pl-${p.id}`, async () => mettre((await relais("playlist", { id: p.id })).titres));
  const ouvrirAlbum = (a: Album) =>
    albumOuvert?.id === a.id
      ? setAlbumOuvert(null)
      : travailler(`al-${a.id}`, async () => {
          const r = await relais("album", { id: a.id });
          setAlbumOuvert({ id: a.id, titres: r.titres, choisis: new Set(r.titres.filter((t) => t.extrait).map((t) => t.id)) });
        });

  const collerLien = () =>
    travailler("lien", async () => {
      const cible = await relais("lien", { url: q.trim() });
      if (cible.type === "titre") mettre([(await relais("titre", { id: cible.id })).titre]);
      else if (cible.type === "playlist") {
        const r = await relais("playlist", { id: cible.id });
        const a = ajouter(panierRef.current, r.titres);
        setPanier(a.panier);
        setBilan(`« ${r.playlist.titre} » : ${bilanAjout(a)}`);
      } else if (cible.type === "album") {
        const r = await relais("album", { id: cible.id });
        setType("album");
        setRes({ albums: [r.album] });
        setAlbumOuvert({ id: r.album.id, titres: r.titres, choisis: new Set(r.titres.filter((t) => t.extrait).map((t) => t.id)) });
        return;
      } else {
        const r = await relais("top", { id: cible.id, n: topN });
        mettre(r.titres);
      }
      setQ("");
    });

  const retirer = (id: string) => setPanier(panier.filter((t) => t.id !== id));
  const vider = () => {
    if (panier.length && window.confirm(`Vider le panier (${panier.length} morceaux) ?`)) {
      setPanier([]);
      setBilan("Panier vidé.");
    }
  };
  const sauvegarder = () => {
    if (!panier.length) return;
    const nom = nomSauvegarde.trim() || "Mon panier";
    setBilan(enregistrer(nom, panier) ? `Panier « ${nom} » enregistré dans ce navigateur.` : "Impossible d'enregistrer (mémoire du navigateur pleine ou bloquée).");
    setEnregistres(lireEnregistres());
    setSauvegardeOuverte(false);
    setNomSauvegarde("");
  };
  const charger = (p: PanierEnregistre) => {
    setPanier(p.titres);
    setBilan(`Panier « ${p.nom} » chargé : ${p.titres.length} morceaux.`);
  };

  const lien = estLien(q.trim());
  const rien = !charge && q.trim().length >= 2 && !lien && !erreur && !Object.values(res).some((l) => l?.length);
  const visibles = toutVoir ? panier : panier.slice(-8).reverse();

  return (
    <section className="bloc panier" aria-labelledby={`${idChamp}-h`}>
      <h2 className="bloc__h" id={`${idChamp}-h`}>
        Le panier <span className="pastille-n">{panier.length}</span>
      </h2>
      <p className="note">Les invités ne voient que le nombre de morceaux, jamais leur titre.</p>

      <div className="switch onglets" role="tablist" aria-label="Chercher parmi">
        {ONGLETS.map((o) => (
          <button key={o.type} type="button" role="tab" aria-selected={type === o.type} className={`switch__btn${type === o.type ? " is-on" : ""}`} onClick={() => setType(o.type)}>
            {o.nom}
          </button>
        ))}
      </div>

      <form
        className="champ-ligne"
        onSubmit={(e) => {
          e.preventDefault();
          if (lien) void collerLien();
        }}
      >
        <label className="visually-hidden" htmlFor={idChamp}>
          Chercher sur Deezer ou coller un lien
        </label>
        <input
          id={idChamp}
          className="champ"
          type="search"
          inputMode="search"
          autoComplete="off"
          maxLength={300}
          placeholder={`${ONGLETS.find((o) => o.type === type)!.aide}… ou colle un lien Deezer`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {lien && (
          <button type="submit" className="bouton" disabled={occupe === "lien"}>
            {occupe === "lien" ? "Lecture…" : "Ajouter ce lien"}
          </button>
        )}
      </form>

      {type === "artiste" && (
        <div className="choix-n" role="group" aria-label="Nombre de titres par artiste">
          <span className="note">Prendre ses</span>
          {[10, 20, 50].map((n) => (
            <button key={n} type="button" className={`puce${topN === n ? " is-on" : ""}`} aria-pressed={topN === n} onClick={() => setTopN(n)}>
              {n}
            </button>
          ))}
          <span className="note">titres les plus écoutés</span>
        </div>
      )}

      <p className="message" role="status" aria-live="polite">
        {erreur ? <span className="message--erreur">{erreur}</span> : bilan}
      </p>

      <div className="resultats" aria-busy={charge}>
        {charge && <p className="note">Recherche…</p>}
        {rien && <p className="note">Rien trouvé. Essaie une autre orthographe.</p>}

        {type === "titre" &&
          res.titres?.map((t) => {
            const dedans = panier.some((p) => p.id === t.id);
            return (
              <div key={t.id} className="ligne">
                <Pochette src={t.pochette} classe="ligne__pochette" />
                <span className="ligne__texte">
                  <span className="ligne__titre">{t.titre}</span>
                  <span className="ligne__detail">{t.artiste}</span>
                </span>
                {t.extrait ? (
                  <button type="button" className="bouton-carre" disabled={dedans} aria-label={dedans ? `${t.titre} est déjà dans le panier` : `Ajouter ${t.titre}`} onClick={() => mettre([t])}>
                    {dedans ? "✓" : "+"}
                  </button>
                ) : (
                  <span className="ligne__sans">sans extrait</span>
                )}
              </div>
            );
          })}

        {type === "artiste" &&
          res.artistes?.map((a) => (
            <div key={a.id} className="ligne">
              <Pochette src={a.image} classe="ligne__pochette ligne__pochette--rond" />
              <span className="ligne__texte">
                <span className="ligne__titre">{a.nom}</span>
                <span className="ligne__detail">{nombre(a.fans)} fans</span>
              </span>
              <button type="button" className="bouton" disabled={!!occupe} onClick={() => ajouterTop(a)}>
                {occupe === `top-${a.id}` ? "…" : `Top ${topN}`}
              </button>
            </div>
          ))}

        {type === "album" &&
          res.albums?.map((a) => (
            <div key={a.id} className="ligne-groupe">
              <div className="ligne">
                <Pochette src={a.pochette} classe="ligne__pochette" />
                <span className="ligne__texte">
                  <span className="ligne__titre">{a.titre}</span>
                  <span className="ligne__detail">
                    {a.artiste} · {a.nb} titres{a.annee ? ` · ${a.annee}` : ""}
                  </span>
                </span>
                <button type="button" className="bouton" aria-expanded={albumOuvert?.id === a.id} disabled={occupe === `al-${a.id}`} onClick={() => ouvrirAlbum(a)}>
                  {occupe === `al-${a.id}` ? "…" : albumOuvert?.id === a.id ? "Fermer" : "Pistes"}
                </button>
              </div>
              {albumOuvert?.id === a.id && (
                <div className="pistes">
                  <ul>
                    {albumOuvert.titres.map((t, i) => (
                      <li key={t.id}>
                        <label className={t.extrait ? "" : "is-off"}>
                          <input
                            type="checkbox"
                            disabled={!t.extrait}
                            checked={albumOuvert.choisis.has(t.id)}
                            onChange={(e) => {
                              const choisis = new Set(albumOuvert.choisis);
                              if (e.target.checked) choisis.add(t.id);
                              else choisis.delete(t.id);
                              setAlbumOuvert({ ...albumOuvert, choisis });
                            }}
                          />
                          <span className="pistes__n">{i + 1}</span>
                          <span className="pistes__t">{t.titre}</span>
                          {!t.extrait && <span className="ligne__sans">sans extrait</span>}
                        </label>
                      </li>
                    ))}
                  </ul>
                  <div className="pistes__actions">
                    <button type="button" className="bouton" disabled={!albumOuvert.choisis.size} onClick={() => mettre(albumOuvert.titres.filter((t) => albumOuvert.choisis.has(t.id)))}>
                      Ajouter {albumOuvert.choisis.size} piste{albumOuvert.choisis.size > 1 ? "s" : ""}
                    </button>
                    <button
                      type="button"
                      className="lien-bouton"
                      onClick={() => {
                        const tous = albumOuvert.titres.filter((t) => t.extrait).map((t) => t.id);
                        setAlbumOuvert({ ...albumOuvert, choisis: albumOuvert.choisis.size === tous.length ? new Set() : new Set(tous) });
                      }}
                    >
                      {albumOuvert.choisis.size === albumOuvert.titres.filter((t) => t.extrait).length ? "Tout décocher" : "Tout cocher"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

        {type === "playlist" &&
          res.playlists?.map((p) => (
            <div key={p.id} className="ligne">
              <Pochette src={p.pochette} classe="ligne__pochette" />
              <span className="ligne__texte">
                <span className="ligne__titre">{p.titre}</span>
                <span className="ligne__detail">
                  {p.auteur ? `${p.auteur} · ` : ""}
                  {p.nb} titres
                </span>
              </span>
              <button type="button" className="bouton" disabled={!!occupe} onClick={() => ajouterPlaylist(p)}>
                {occupe === `pl-${p.id}` ? "…" : "Ajouter"}
              </button>
            </div>
          ))}
      </div>

      {panier.length > 0 && (
        <div className="contenu-panier">
          <h3 className="sous-h">
            {toutVoir ? "Tout le panier" : panier.length > 8 ? "Derniers ajouts" : "Dans le panier"}
          </h3>
          <ul className="liste-panier">
            {visibles.map((t) => (
              <li key={t.id} className="ligne ligne--petite">
                <Pochette src={t.pochette} classe="ligne__pochette" />
                <span className="ligne__texte">
                  <span className="ligne__titre">{t.titre}</span>
                  <span className="ligne__detail">{t.artiste}</span>
                </span>
                <button type="button" className="bouton-carre bouton-carre--leger" aria-label={`Retirer ${t.titre}`} onClick={() => retirer(t.id)}>
                  ×
                </button>
              </li>
            ))}
          </ul>
          {panier.length > 8 && (
            <button type="button" className="lien-bouton" onClick={() => setToutVoir((v) => !v)}>
              {toutVoir ? "Réduire" : `Voir les ${panier.length} morceaux`}
            </button>
          )}
        </div>
      )}

      <div className="panier__outils">
        {sauvegardeOuverte ? (
          <form
            className="champ-ligne"
            onSubmit={(e) => {
              e.preventDefault();
              sauvegarder();
            }}
          >
            <label className="visually-hidden" htmlFor={`${idChamp}-nom`}>
              Nom du panier
            </label>
            <input id={`${idChamp}-nom`} className="champ champ--petit" maxLength={40} placeholder="Nom du panier" value={nomSauvegarde} onChange={(e) => setNomSauvegarde(e.target.value)} autoFocus />
            <button type="submit" className="bouton">
              Enregistrer
            </button>
            <button type="button" className="lien-bouton" onClick={() => setSauvegardeOuverte(false)}>
              Annuler
            </button>
          </form>
        ) : (
          <>
            <button type="button" className="bouton bouton--contour" disabled={!panier.length} onClick={() => setSauvegardeOuverte(true)}>
              Enregistrer ce panier
            </button>
            <button type="button" className="lien-bouton" disabled={!panier.length} onClick={vider}>
              Vider
            </button>
          </>
        )}
      </div>

      {enregistres.length > 0 && (
        <details className="enregistres">
          <summary>Mes paniers enregistrés ({enregistres.length})</summary>
          <ul>
            {enregistres.map((p) => (
              <li key={p.nom}>
                <span className="enregistres__nom">
                  {p.nom} <span className="note">· {p.titres.length} morceaux</span>
                </span>
                <button type="button" className="bouton" onClick={() => charger(p)}>
                  Charger
                </button>
                <button
                  type="button"
                  className="bouton-carre bouton-carre--leger"
                  aria-label={`Supprimer le panier ${p.nom}`}
                  onClick={() => {
                    if (!window.confirm(`Supprimer le panier « ${p.nom} » ?`)) return;
                    supprimerEnregistre(p.nom);
                    setEnregistres(lireEnregistres());
                  }}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
