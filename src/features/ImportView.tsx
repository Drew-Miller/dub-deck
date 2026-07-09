// ImportView — main-screen view to add content: local files, or remote sources
// (podcast RSS feed, direct media URL, YouTube/Vimeo). URLs can be added in bulk
// (one per line); each added video is staged below (newest first) with a thumbnail
// and metadata, and can be edited or removed right from here.

import { useState } from "react";
import type { JSX } from "react";
import { pickAndImport } from "../lib/importer";
import { addFeed, addVideoUrl, addDirectUrl } from "../lib/remoteSources";
import { getEpisode, deleteEpisode } from "../lib/db";
import { useBumpLibrary } from "../lib/state";
import EditEpisodeDialog from "./EditEpisodeDialog";
import type { Episode } from "../types";
import "./ImportView.css";

type Mode = "feed" | "video" | "direct";

const MODES: { id: Mode; label: string; placeholder: string; hint: string }[] = [
  {
    id: "feed",
    label: "Podcast feed",
    placeholder: "https://example.com/feed.xml",
    hint: "Subscribe to RSS / Podcasting 2.0 feeds (one per line). Episodes stream from the publisher.",
  },
  {
    id: "video",
    label: "YouTube / Vimeo",
    placeholder: "https://youtube.com/watch?v=…",
    hint: "Paste one or more watch URLs (one per line). Title and thumbnail are fetched automatically.",
  },
  {
    id: "direct",
    label: "Direct URL",
    placeholder: "https://example.com/episode.mp4",
    hint: "Direct links to .mp4 or .m3u8 (HLS) streams, one per line.",
  },
];

export default function ImportView({ onClose }: { onClose?: () => void }): JSX.Element {
  const bump = useBumpLibrary();
  const [importing, setImporting] = useState(false);
  const [mode, setMode] = useState<Mode>("video");
  const [urls, setUrls] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<Episode[]>([]);
  const [editing, setEditing] = useState<Episode | null>(null);

  const active = MODES.find((m) => m.id === mode)!;

  async function handleFiles() {
    if (importing) return;
    setImporting(true);
    setError(null);
    try {
      const result = await pickAndImport();
      if (result && result.imported > 0) {
        bump();
        const showLabel = result.shows.length === 1 ? ` to ${result.shows[0]}` : "";
        const failLabel = result.failed ? ` (${result.failed} failed)` : "";
        setStatus(`Imported ${result.imported} episode${result.imported === 1 ? "" : "s"}${showLabel}${failLabel}`);
      } else if (result && result.imported === 0) {
        setStatus("Nothing imported");
      }
    } catch (e) {
      setError(`Import failed: ${String(e)}`);
    } finally {
      setImporting(false);
    }
  }

  async function addFromString(input: string) {
    const list = input.split(/\s+/).map((s) => s.trim()).filter(Boolean);
    if (!list.length || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "feed") {
        let total = 0;
        const shows: string[] = [];
        for (const u of list) {
          const r = await addFeed(u);
          total += r.added;
          shows.push(r.show);
        }
        setStatus(`Added ${total} episode${total === 1 ? "" : "s"} from ${shows.length} feed${shows.length === 1 ? "" : "s"}`);
      } else {
        const fresh: Episode[] = [];
        const errors: string[] = [];
        for (const u of list) {
          try {
            const id = mode === "video" ? await addVideoUrl(u) : await addDirectUrl(u);
            const ep = await getEpisode(id);
            if (ep) fresh.push(ep);
          } catch (e) {
            errors.push(`${u}: ${String(e instanceof Error ? e.message : e)}`);
          }
        }
        if (fresh.length) setAdded((prev) => [...fresh, ...prev]);
        setStatus(`Added ${fresh.length} video${fresh.length === 1 ? "" : "s"}${errors.length ? `, ${errors.length} failed` : ""}`);
        if (errors.length) setError(errors.join("\n"));
      }
      setUrls("");
      bump();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }

  // Read the clipboard and immediately add whatever URL(s) it holds.
  async function handlePaste() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) return;
      setUrls(text);
      await addFromString(text);
    } catch (e) {
      setError(`Couldn't read clipboard: ${String(e instanceof Error ? e.message : e)}`);
    }
  }

  async function onRemove(ep: Episode) {
    await deleteEpisode(ep.id);
    setAdded((prev) => prev.filter((e) => e.id !== ep.id));
    bump();
  }

  async function refreshItem(id: number) {
    const fresh = await getEpisode(id);
    if (fresh) setAdded((prev) => prev.map((e) => (e.id === id ? fresh : e)));
  }

  return (
    <div className="import-view">
      <div className="row spread">
        <div>
          <h1 className="import-title">Import</h1>
          <p className="mute">Add podcasts from your computer or anywhere on the web.</p>
        </div>
        {onClose && (
          <button className="icon-btn" onClick={onClose} title="Close">✕</button>
        )}
      </div>

      {status && <div className="import-status card">{status}</div>}
      {error && <div className="import-error import-error-multiline">{error}</div>}

      <section className="import-card card">
        <h3>From your computer</h3>
        <p className="mute">Reference local video files in place — never copied or moved.</p>
        <button className="btn btn-primary" onClick={handleFiles} disabled={importing}>
          {importing ? "Importing…" : "＋ Choose files"}
        </button>
      </section>

      <section className="import-card card">
        <h3>From the web</h3>
        <div className="add-tabs">
          {MODES.map((m) => (
            <button
              key={m.id}
              className={`add-tab ${mode === m.id ? "active" : ""}`}
              onClick={() => { setMode(m.id); setError(null); }}
              disabled={busy}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="import-url">
          <input
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
            placeholder={active.placeholder}
            onKeyDown={(e) => { if (e.key === "Enter") void addFromString(urls); }}
          />
        </div>
        <p className="mute import-hint">{active.hint}</p>
        <div className="row import-actions">
          <button className="btn btn-ghost" onClick={() => void handlePaste()} disabled={busy} title="Paste from clipboard and add">
            📋 Paste
          </button>
          <button className="btn btn-primary" onClick={() => void addFromString(urls)} disabled={!urls.trim() || busy}>
            {busy ? "Adding…" : "Add"}
          </button>
        </div>
      </section>

      {added.length > 0 && (
        <section className="import-card card">
          <h3>Added this session <span className="mute">({added.length})</span></h3>
          <div className="import-added">
            {added.map((ep) => {
              const thumb = ep.thumbnail_url ?? ep.show_image ?? null;
              const initial = (ep.show_title ?? ep.title ?? "?").trim().charAt(0).toUpperCase() || "?";
              return (
                <div key={ep.id} className="import-added-item">
                  <div className="import-added-thumb" aria-hidden="true">
                    {thumb ? <img src={thumb} alt="" /> : <span>{initial}</span>}
                  </div>
                  <div className="import-added-meta grow">
                    <div className="import-added-title truncate">{ep.title}</div>
                    <div className="mute truncate">{ep.show_title}</div>
                  </div>
                  <button className="btn btn-ghost" onClick={() => setEditing(ep)}>Edit</button>
                  <button className="icon-btn" title="Remove import" onClick={() => void onRemove(ep)}>✕</button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <p className="mute import-note">
        dub-deck stores only the link and metadata for web sources — the media streams from its
        host, so a large library costs no extra disk.
      </p>

      {editing && (
        <EditEpisodeDialog
          episode={editing}
          onSaved={() => { bump(); void refreshItem(editing.id); }}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
