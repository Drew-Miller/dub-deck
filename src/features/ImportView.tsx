// ImportView — main-screen view to add content: local files, or remote sources
// (podcast RSS feed, direct media URL, YouTube/Vimeo).

import { useState } from "react";
import type { JSX } from "react";
import { pickAndImport } from "../lib/importer";
import { addFeed, addVideoUrl, addDirectUrl } from "../lib/remoteSources";
import { useBumpLibrary } from "../lib/state";
import "./ImportView.css";

type Mode = "feed" | "video" | "direct";

const MODES: { id: Mode; label: string; placeholder: string; hint: string }[] = [
  {
    id: "feed",
    label: "Podcast feed",
    placeholder: "https://example.com/feed.xml",
    hint: "Subscribe to an RSS / Podcasting 2.0 feed. Episodes stream from the publisher — nothing is stored locally.",
  },
  {
    id: "video",
    label: "YouTube / Vimeo",
    placeholder: "https://youtube.com/watch?v=…",
    hint: "Paste a watch URL. It plays as an embed; title and thumbnail are fetched automatically.",
  },
  {
    id: "direct",
    label: "Direct URL",
    placeholder: "https://example.com/episode.mp4",
    hint: "A direct link to an .mp4 or .m3u8 (HLS) stream.",
  },
];

export default function ImportView(): JSX.Element {
  const bump = useBumpLibrary();
  const [importing, setImporting] = useState(false);
  const [mode, setMode] = useState<Mode>("feed");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  async function handleAdd() {
    if (!url.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "feed") {
        const r = await addFeed(url);
        setStatus(`Added ${r.added} episode${r.added === 1 ? "" : "s"} from ${r.show}`);
      } else if (mode === "video") {
        await addVideoUrl(url);
        setStatus("Added video");
      } else {
        await addDirectUrl(url);
        setStatus("Added stream");
      }
      setUrl("");
      bump();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="import-view">
      <div>
        <h1 className="import-title">Import</h1>
        <p className="mute">Add podcasts from your computer or anywhere on the web.</p>
      </div>

      {status && <div className="import-status card">{status}</div>}
      {error && <div className="import-error">{error}</div>}

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
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={active.placeholder}
            onKeyDown={(e) => { if (e.key === "Enter") void handleAdd(); }}
          />
        </div>
        <p className="mute import-hint">{active.hint}</p>
        <button className="btn btn-primary" onClick={() => void handleAdd()} disabled={!url.trim() || busy}>
          {busy ? "Adding…" : "Add"}
        </button>
      </section>

      <p className="mute import-note">
        dub-deck stores only the link and metadata for web sources — the media streams from its
        host, so a large library costs no extra disk.
      </p>
    </div>
  );
}
