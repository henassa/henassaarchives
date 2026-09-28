"use client";

import { useEffect, useMemo, useState } from "react";
import type { ConnexionsData, Lien, Oeuvre } from "@/lib/oeuvres";
import { TYPES_OEUVRE, TYPE_SLUGS, type TypeOeuvre } from "@/lib/sections";

type Draft = {
  id: number | null;
  titre: string;
  auteur: string;
  annee: string;
  type: TypeOeuvre;
  genre: string;
  cover: string;
  media: string;
  description: string;
};

const EMPTY: Draft = { id: null, titre: "", auteur: "", annee: "", type: "album", genre: "", cover: "", media: "", description: "" };

function norm(s: string) {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function sameLink(l: Lien, a: number, b: number) {
  return (l.a === a && l.b === b) || (l.a === b && l.b === a);
}

export function AdminApp() {
  const [data, setData] = useState<ConnexionsData | null>(null);
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

  async function save(next: ConnexionsData, message: string) {
    setSaving(true);
    try {
      const r = await fetch("/api/connexions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
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
    .filter((o) => !q || norm(`${o.titre} ${o.auteur} ${o.genre ?? ""} ${o.annee ?? ""}`).includes(q))
    .sort((a, b) => a.titre.localeCompare(b.titre, "fr", { sensitivity: "base" }));
  const liens = data.liens.filter((l) => {
    if (!q) return true;
    const a = byId.get(l.a);
    const b = byId.get(l.b);
    return norm(`${a?.titre} ${a?.auteur} ${b?.titre} ${b?.auteur}`).includes(q);
  });
  const degree = (id: number) => data.liens.filter((l) => l.a === id || l.b === id).length;

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
      { oeuvres: data.oeuvres.filter((x) => x.id !== o.id), liens: data.liens.filter((l) => l.a !== o.id && l.b !== o.id) },
      "Œuvre supprimée"
    );
    setDraft(null);
  }

  async function addLink(a: number, b: number) {
    if (!data || a === b || data.liens.some((l) => sameLink(l, a, b))) return;
    await save({ ...data, liens: [...data.liens, { a, b }] }, "Connexion ajoutée");
  }

  async function removeLink(a: number, b: number) {
    if (!data) return;
    await save({ ...data, liens: data.liens.filter((l) => !sameLink(l, a, b)) }, "Connexion retirée");
  }

  return (
    <main className="admin">
      <div className="admin__head">
        <h1 className="admin__title">Admin</h1>
        <p className="admin__info">
          {data.oeuvres.length} œuvres · {data.liens.length} connexions. Visible seulement en local : tout est enregistré
          dans <code>content/connexions.json</code>.
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
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {o.cover ? <img src={o.cover} alt="" loading="lazy" /> : null}
              </span>
              <span className="admin-row__text">
                <span className="admin-row__title">{o.titre}</span>
                <span className="admin-row__sub">
                  {o.auteur}
                  {o.annee ? ` · ${o.annee}` : ""}
                  {o.genre ? ` · ${o.genre}` : ""}
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
        <ul className="admin-list">
          {liens.map((l) => {
            const a = byId.get(l.a);
            const b = byId.get(l.b);
            if (!a || !b) return null;
            return (
              <li key={`${l.a}-${l.b}`} className="admin-link">
                <span className="admin-link__pair">
                  <strong>{a.titre}</strong> <span className="admin-link__sep">⟷</span> <strong>{b.titre}</strong>
                </span>
                <button type="button" className="ctrl-btn ctrl-btn--text ctrl-btn--danger" onClick={() => removeLink(l.a, l.b)}>
                  Retirer
                </button>
              </li>
            );
          })}
        </ul>
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
  onToast,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  data: ConnexionsData;
  byId: Map<number, Oeuvre>;
  saving: boolean;
  onSave: (d: Draft) => void;
  onClose: () => void;
  onAddLink: (a: number, b: number) => void;
  onRemoveLink: (a: number, b: number) => void;
  onToast: (m: string) => void;
}) {
  const [linkQuery, setLinkQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const set = (k: keyof Draft, v: string) => setDraft({ ...draft, [k]: v });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const id = draft.id;
  const linked = id === null ? [] : data.liens.filter((l) => l.a === id || l.b === id);
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
            <span>Visuel</span>
            <div className="admin-cover">
              <span className="admin-row__cover admin-cover__preview">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {draft.cover ? <img src={draft.cover} alt="" /> : null}
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
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {other.cover ? <img src={other.cover} alt="" loading="lazy" /> : null}
                      </span>
                      <span className="admin-links__body">
                        <strong>{other.titre}</strong>
                        <span className="admin-row__sub">{other.auteur}</span>
                      </span>
                      <button type="button" className="ctrl-btn" onClick={() => onRemoveLink(l.a, l.b)} aria-label={`Retirer le lien avec ${other.titre}`}>
                        ×
                      </button>
                    </li>
                  );
                })}
              </ul>
              <label className="admin-field admin-field--full">
                <span>Relier à…</span>
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
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {o.cover ? <img src={o.cover} alt="" loading="lazy" /> : null}
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