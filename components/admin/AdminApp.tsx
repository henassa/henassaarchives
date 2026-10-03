"use client";

import { useEffect, useMemo, useState } from "react";
import type { ConnexionsAdmin, ConnexionsBrut, Lien, Oeuvre } from "@/lib/oeuvres";
import { TYPES_OEUVRE, TYPE_SLUGS, type TypeOeuvre } from "@/lib/sections";
import { Pochette } from "@/components/connexions/Pochette";

type Draft = {
  id: number | null;
  titre: string;
  auteur: string;
  annee: string;
  type: TypeOeuvre;
  genre: string;
  sousGenres: string[];
  cover: string;
  media: string;
  description: string;
};

const EMPTY: Draft = { id: null, titre: "", auteur: "", annee: "", type: "album", genre: "", sousGenres: [], cover: "", media: "", description: "" };

function norm(s: string) {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function sameLink(l: Lien, a: number, b: number) {
  return (l.a === a && l.b === b) || (l.a === b && l.b === a);
}

export function AdminApp() {
  const [data, setData] = useState<ConnexionsAdmin | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"oeuvres" | "liens">("oeuvres");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/connexions")
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then(setData)
      .catch(() => setError("Impossible de charger les données. L'admin ne marche qu'avec npm run dev."));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const byId = useMemo(() => new Map((data?.oeuvres ?? []).map((o) => [o.id, o])), [data]);

  async function save(next: ConnexionsBrut, message: string) {
    setSaving(true);
    try {
      const r = await fetch("/api/connexions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oeuvres: next.oeuvres, liens: next.liens, exclus: next.exclus }),
      });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error ?? "Erreur");
      setData(json);
      setToast(message);
      return true;
    } catch (e) {
      setToast(`Erreur : ${(e as Error).message}`);
      return false;
    } finally {
      setSaving(false);
    }
  }

  if (error) return <p className="empty">{error}</p>;
  if (!data) return <p className="empty">Chargement…</p>;

  const q = norm(query.trim());
  const oeuvres = [...data.oeuvres]
    .filter((o) => !q || norm(`${o.titre} ${o.auteur} ${o.genre ?? ""} ${(o.sousGenres ?? []).join(" ")} ${o.annee ?? ""}`).includes(q))
    .sort((a, b) => a.titre.localeCompare(b.titre, "fr", { sensitivity: "base" }));
  const liens = [...data.finales].sort((x, y) => (y.score ?? 99) - (x.score ?? 99)).filter((l) => {
    if (!q) return true;
    const a = byId.get(l.a);
    const b = byId.get(l.b);
    return norm(`${a?.titre} ${a?.auteur} ${b?.titre} ${b?.auteur}`).includes(q);
  });
  const degree = (id: number) => data.finales.filter((l) => l.a === id || l.b === id).length;
  const tousSousGenres = [...new Set(data.oeuvres.flatMap((o) => o.sousGenres ?? []))].sort((a, b) => a.localeCompare(b, "fr"));

  function openDraft(o?: Oeuvre) {
    setDraft(
      o
        ? {
            id: o.id,
            titre: o.titre,
            auteur: o.auteur,
            annee: o.annee ? String(o.annee) : "",
            type: o.type,
            genre: o.genre ?? "",
            sousGenres: o.sousGenres ?? [],
            cover: o.cover ?? "",
            media: o.media ?? "",
            description: o.description ?? "",
          }
        : { ...EMPTY }
    );
  }

  async function saveDraft(d: Draft) {
    if (!data) return;
    if (!d.titre.trim() || !d.auteur.trim()) {
      setToast("Titre et auteur sont obligatoires");
      return;
    }
    const id = d.id ?? Math.max(0, ...data.oeuvres.map((o) => o.id)) + 1;
    const oeuvre: Oeuvre = {
      id,
      slug: data.oeuvres.find((o) => o.id === id)?.slug,
      titre: d.titre,
      auteur: d.auteur,
      annee: d.annee ? Number(d.annee) : undefined,
      type: d.type,
      genre: d.genre || undefined,
      sousGenres: d.sousGenres.length ? d.sousGenres : undefined,
      cover: d.cover || undefined,
      media: d.media || undefined,
      description: d.description || undefined,
    };
    const oeuvresNext = d.id === null ? [...data.oeuvres, oeuvre] : data.oeuvres.map((o) => (o.id === id ? oeuvre : o));
    const ok = await save({ ...data, oeuvres: oeuvresNext }, d.id === null ? "Œuvre ajoutée" : "Œuvre modifiée");
    if (ok) setDraft({ ...d, id });
  }

  async function remove(o: Oeuvre) {
    if (!data) return;
    if (!window.confirm(`Supprimer « ${o.titre} » et ses connexions ?`)) return;
    await save(
      {
        oeuvres: data.oeuvres.filter((x) => x.id !== o.id),
        liens: data.liens.filter((l) => l.a !== o.id && l.b !== o.id),
        exclus: data.exclus.filter((l) => l.a !== o.id && l.b !== o.id),
      },
      "Œuvre supprimée"
    );
    setDraft(null);
  }

  // Ajouter un lien à la main (et le retirer des liens cassés s'il y était)
  async function addLink(a: number, b: number) {
    if (!data || a === b || data.liens.some((l) => sameLink(l, a, b))) return;
    await save(
      { ...data, liens: [...data.liens, { a, b }], exclus: data.exclus.filter((l) => !sameLink(l, a, b)) },
      "Connexion ajoutée"
    );
  }

  // Retirer un lien : manuel → on l'enlève ; automatique → on le casse (pasDeLien)
  async function removeLink(a: number, b: number) {
    if (!data) return;
    const lien = data.finales.find((l) => sameLink(l, a, b));
    const liensNext = data.liens.filter((l) => !sameLink(l, a, b));
    const resteAuto = lien?.score !== undefined;
    await save(
      { ...data, liens: liensNext, exclus: resteAuto ? [...data.exclus, { a, b }] : data.exclus },
      resteAuto ? "Lien automatique cassé" : "Connexion retirée"
    );
  }

  async function restoreLink(a: number, b: number) {
    if (!data) return;
    await save({ ...data, exclus: data.exclus.filter((l) => !sameLink(l, a, b)) }, "Lien automatique rétabli");
  }

  return (
    <main className="admin">
      <div className="admin__head">
        <h1 className="admin__title">Admin</h1>
        <p className="admin__info">
          {data.oeuvres.length} œuvres · {data.finales.length} connexions ({data.finales.filter((l) => l.auto).length} automatiques). Visible
          seulement en local : tout est enregistré dans <code>content/connexions.json</code>. Les liens automatiques viennent des
          sous-genres (réglages dans <code>lib/liens-auto.ts</code>).
        </p>
      </div>

      <div className="explorer__bar">
        <div className="switch" role="group" aria-label="Onglet">
          <button type="button" className={`switch__btn${tab === "oeuvres" ? " is-on" : ""}`} onClick={() => setTab("oeuvres")}>
            Œuvres
          </button>
          <button type="button" className={`switch__btn${tab === "liens" ? " is-on" : ""}`} onClick={() => setTab("liens")}>
            Connexions
          </button>
        </div>
        <label className="search">
          <span className="visually-hidden">Rechercher</span>
          <input type="search" placeholder="Rechercher…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        {tab === "oeuvres" && (
          <button type="button" className="ctrl-btn ctrl-btn--text admin__add" onClick={() => openDraft()}>
            + Ajouter une œuvre
          </button>
        )}
      </div>

      {tab === "oeuvres" ? (
        <ul className="admin-list">
          {oeuvres.map((o) => (
            <li key={o.id} className="admin-row" style={{ ["--type" as string]: TYPES_OEUVRE[o.type].couleur }}>
              <span className="admin-row__cover">
                <Pochette o={o} />
              </span>
              <span className="admin-row__text">
                <span className="admin-row__title">{o.titre}</span>
                <span className="admin-row__sub">
                  {o.auteur}
                  {o.annee ? ` · ${o.annee}` : ""}
                  {o.genre ? ` · ${o.genre}` : ""}
                  {o.sousGenres?.length ? ` · ${o.sousGenres.join(", ")}` : ""}
                </span>
              </span>
              <span className="tag tag--sans" style={{ background: TYPES_OEUVRE[o.type].couleur }}>
                {TYPES_OEUVRE[o.type].label}
              </span>
              <span className="admin-row__deg">{degree(o.id)} liens</span>
              <span className="admin-row__actions">
                <button type="button" className="ctrl-btn ctrl-btn--text" onClick={() => openDraft(o)}>
                  Modifier
                </button>
                <button type="button" className="ctrl-btn ctrl-btn--text ctrl-btn--danger" onClick={() => remove(o)}>
                  Supprimer
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <ul className="admin-list">
            {liens.map((l) => {
              const a = byId.get(l.a);
              const b = byId.get(l.b);
              if (!a || !b) return null;
              return (
                <li key={`${l.a}-${l.b}`} className="admin-link">
                  <span className="admin-link__pair">
                    <strong>{a.titre}</strong> <span className="admin-link__sep">⟷</span> <strong>{b.titre}</strong>
                    <LienInfo l={l} />
                  </span>
                  <button type="button" className="ctrl-btn ctrl-btn--text ctrl-btn--danger" onClick={() => removeLink(l.a, l.b)}>
                    {l.auto ? "Casser" : "Retirer"}
                  </button>
                </li>
              );
            })}
          </ul>
          {data.exclus.length > 0 && (
            <>
              <h2 className="panneau__h">Liens automatiques cassés</h2>
              <ul className="admin-list">
                {data.exclus.map((l) => (
                  <li key={`x${l.a}-${l.b}`} className="admin-link">
                    <span className="admin-link__pair">
                      <strong>{byId.get(l.a)?.titre}</strong> <span className="admin-link__sep">⟷</span> <strong>{byId.get(l.b)?.titre}</strong>
                    </span>
                    <button type="button" className="ctrl-btn ctrl-btn--text" onClick={() => restoreLink(l.a, l.b)}>
                      Rétablir
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {draft && (
        <Editor
          draft={draft}
          setDraft={setDraft}
          data={data}
          byId={byId}
          saving={saving}
          onSave={saveDraft}
          onClose={() => setDraft(null)}
          onAddLink={addLink}
          onRemoveLink={removeLink}
          onRestoreLink={restoreLink}
          tousSousGenres={tousSousGenres}
          onToast={setToast}
        />
      )}

      {toast && (
        <div className="admin-toast" role="status">
          {toast}
        </div>
      )}
    </main>
  );
}

function Editor({
  draft,
  setDraft,
  data,
  byId,
  saving,
  onSave,
  onClose,
  onAddLink,
  onRemoveLink,
  onRestoreLink,
  tousSousGenres,
  onToast,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  data: ConnexionsAdmin;
  byId: Map<number, Oeuvre>;
  saving: boolean;
  onSave: (d: Draft) => void;
  onClose: () => void;
  onAddLink: (a: number, b: number) => void;
  onRemoveLink: (a: number, b: number) => void;
  onRestoreLink: (a: number, b: number) => void;
  tousSousGenres: string[];
  onToast: (m: string) => void;
}) {
  const [linkQuery, setLinkQuery] = useState("");
  const [sgInput, setSgInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const set = (k: Exclude<keyof Draft, "sousGenres">, v: string) => setDraft({ ...draft, [k]: v });
  const addSg = (raw: string) => {
    const nouveaux = raw
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      // Reprend l'orthographe d'un sous-genre existant (Boom Bap, pas boom bap)
      .map((x) => tousSousGenres.find((t) => norm(t) === norm(x)) ?? x)
      .filter((x) => !draft.sousGenres.some((t) => norm(t) === norm(x)));
    if (nouveaux.length) setDraft({ ...draft, sousGenres: [...draft.sousGenres, ...nouveaux] });
    setSgInput("");
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const id = draft.id;
  const linked = id === null ? [] : data.finales.filter((l) => l.a === id || l.b === id).sort((x, y) => (y.score ?? 99) - (x.score ?? 99));
  const casses = id === null ? [] : data.exclus.filter((l) => l.a === id || l.b === id);
  const linkedIds = new Set(linked.map((l) => (l.a === id ? l.b : l.a)));
  const lq = norm(linkQuery.trim());
  const candidates =
    id === null || !lq
      ? []
      : data.oeuvres.filter((o) => o.id !== id && !linkedIds.has(o.id) && norm(`${o.titre} ${o.auteur}`).includes(lq)).slice(0, 8);

  async function upload(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("name", `${draft.auteur} ${draft.titre}`.trim());
      const r = await fetch("/api/upload", { method: "POST", body: form });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error);
      setDraft({ ...draft, cover: json.path });
      onToast("Image envoyée, pense à enregistrer");
    } catch (e) {
      onToast(`Erreur : ${(e as Error).message}`);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="admin-editor-backdrop" onClick={onClose}>
      <div className="admin-editor" role="dialog" aria-modal="true" aria-label={id === null ? "Ajouter une œuvre" : "Modifier l'œuvre"} onClick={(e) => e.stopPropagation()}>
        <div className="panneau__bar">
          <span className="admin-editor__title">{id === null ? "Nouvelle œuvre" : "Modifier"}</span>
          <button type="button" className="ctrl-btn" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>

        <form
          className="admin-form"
          onSubmit={(e) => {
            e.preventDefault();
            onSave(draft);
          }}
        >
          <label className="admin-field">
            <span>Titre *</span>
            <input className="admin-input" value={draft.titre} onChange={(e) => set("titre", e.target.value)} required />
          </label>
          <label className="admin-field">
            <span>Auteur / artiste *</span>
            <input className="admin-input" value={draft.auteur} onChange={(e) => set("auteur", e.target.value)} required />
          </label>
          <label className="admin-field">
            <span>Type</span>
            <select className="admin-input" value={draft.type} onChange={(e) => set("type", e.target.value)}>
              {TYPE_SLUGS.map((t) => (
                <option key={t} value={t}>
                  {TYPES_OEUVRE[t].label}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-field">
            <span>Année</span>
            <input className="admin-input" type="number" value={draft.annee} onChange={(e) => set("annee", e.target.value)} />
          </label>
          <label className="admin-field admin-field--full">
            <span>Genre</span>
            <input className="admin-input" value={draft.genre} onChange={(e) => set("genre", e.target.value)} placeholder="Hip-hop, film noir, RPG…" />
          </label>
          <div className="admin-field admin-field--full">
            <span>Sous-genres (créent les connexions automatiques)</span>
            {draft.sousGenres.length > 0 && (
              <ul className="admin-chips">
                {draft.sousGenres.map((sg) => (
                  <li key={sg}>
                    {sg}
                    <button
                      type="button"
                      onClick={() => setDraft({ ...draft, sousGenres: draft.sousGenres.filter((x) => x !== sg) })}
                      aria-label={`Retirer ${sg}`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <input
              className="admin-input"
              list="admin-sous-genres"
              value={sgInput}
              onChange={(e) => setSgInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addSg(sgInput);
                }
              }}
              onBlur={() => sgInput.trim() && addSg(sgInput)}
              placeholder="Tape un sous-genre puis Entrée (ex. Boom Bap)"
              aria-label="Ajouter un sous-genre"
            />
            <datalist id="admin-sous-genres">
              {tousSousGenres
                .filter((t) => !draft.sousGenres.includes(t))
                .map((t) => (
                  <option key={t} value={t} />
                ))}
            </datalist>
          </div>
          <div className="admin-field admin-field--full">
            <span>Visuel</span>
            <div className="admin-cover">
              <span className="admin-row__cover admin-cover__preview">
                <Pochette key={draft.cover} o={draft} />
              </span>
              <input className="admin-input" value={draft.cover} onChange={(e) => set("cover", e.target.value)} placeholder="/images/oeuvres/nom.jpg ou URL" aria-label="Chemin du visuel" />
              <label className="ctrl-btn ctrl-btn--text admin-upload">
                {uploading ? "Envoi…" : "Envoyer"}
                <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              </label>
            </div>
          </div>
          <label className="admin-field admin-field--full">
            <span>Lien YouTube, fichier audio ou URL</span>
            <input className="admin-input" value={draft.media} onChange={(e) => set("media", e.target.value)} placeholder="https://www.youtube.com/watch?v=…" />
          </label>
          <label className="admin-field admin-field--full">
            <span>Description</span>
            <textarea className="admin-input" rows={3} value={draft.description} onChange={(e) => set("description", e.target.value)} />
          </label>
          <div className="admin-form__actions">
            <button type="submit" className="ctrl-btn ctrl-btn--text" disabled={saving}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </form>

        <section className="admin-links">
          <h2 className="panneau__h">Connexions</h2>
          {id === null ? (
            <p className="admin__info">Enregistre l&apos;œuvre pour pouvoir la relier à d&apos;autres.</p>
          ) : (
            <>
              <ul className="admin-links__list">
                {linked.map((l) => {
                  const other = byId.get(l.a === id ? l.b : l.a);
                  if (!other) return null;
                  return (
                    <li key={other.id} className="admin-links__item">
                      <span className="admin-row__cover">
                        <Pochette o={other} />
                      </span>
                      <span className="admin-links__body">
                        <strong>{other.titre}</strong>
                        <span className="admin-row__sub">{other.auteur}</span>
                        <LienInfo l={l} />
                      </span>
                      <button
                        type="button"
                        className="ctrl-btn ctrl-btn--text"
                        onClick={() => onRemoveLink(l.a, l.b)}
                        aria-label={`${l.auto ? "Casser" : "Retirer"} le lien avec ${other.titre}`}
                      >
                        {l.auto ? "Casser" : "Retirer"}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {casses.length > 0 && (
                <ul className="admin-links__list">
                  {casses.map((l) => {
                    const other = byId.get(l.a === id ? l.b : l.a);
                    if (!other) return null;
                    return (
                      <li key={`x${other.id}`} className="admin-links__item admin-links__item--off">
                        <span className="admin-row__cover" />
                        <span className="admin-links__body">
                          <strong>{other.titre}</strong>
                          <span className="admin-row__sub">Lien automatique cassé</span>
                        </span>
                        <button type="button" className="ctrl-btn ctrl-btn--text" onClick={() => onRestoreLink(l.a, l.b)}>
                          Rétablir
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <label className="admin-field admin-field--full">
                <span>Relier à la main…</span>
                <input className="admin-input" type="search" value={linkQuery} onChange={(e) => setLinkQuery(e.target.value)} placeholder="Chercher une œuvre" />
              </label>
              {candidates.length > 0 && (
                <ul className="admin-candidates">
                  {candidates.map((o) => (
                    <li key={o.id}>
                      <button
                        type="button"
                        className="lien"
                        style={{ ["--type" as string]: TYPES_OEUVRE[o.type].couleur }}
                        onClick={() => {
                          onAddLink(id, o.id);
                          setLinkQuery("");
                        }}
                      >
                        <span className="lien__cover">
                          <Pochette o={o} />
                        </span>
                        <span className="lien__text">
                          <span className="lien__title">+ {o.titre}</span>
                          <span className="lien__author">{o.auteur}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

/** Petit résumé d'un lien : automatique (score, sous-genres communs) ou manuel. */
function LienInfo({ l }: { l: Lien }) {
  return (
    <span className="admin-lien-info">
      {l.auto ? `Auto · score ${l.score}` : "Manuel"}
      {l.communs?.length ? ` · ${l.communs.join(", ")}` : ""}
    </span>
  );
}
