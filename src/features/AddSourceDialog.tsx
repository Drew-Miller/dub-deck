// AddSourceDialog — add a streaming source without any local file:
// a podcast RSS feed, a direct media URL (.mp4/.m3u8), or a YouTube/Vimeo link.

import { useState } from "react";
import type { JSX } from "react";
import { addFeed, addVideoUrl, addDirectUrl } from "../lib/remoteSources";
import "./EditEpisodeDialog.css";
import "./AddSourceDialog.css";

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

interface Props {
  onAdded: (msg: string) => void;
  onClose: () => void;
}

export default function AddSourceDialog({ onAdded, onClose }: Props): JSX.Element {
  const [mode, setMode] = useState<Mode>("feed");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = MODES.find((m) => m.id === mode)!;
  const canSubmit = url.trim().length > 0 && !busy;

  async function handleSubmit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      let msg: string;
      if (mode === "feed") {
        const r = await addFeed(url);
        msg = `Added ${r.added} episode${r.added === 1 ? "" : "s"} from ${r.show}`;
      } else if (mode === "video") {
        await addVideoUrl(url);
        msg = "Added video";
      } else {
        await addDirectUrl(url);
        msg = "Added stream";
      }
      onAdded(msg);
      onClose();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="modal edit-modal" onClick={(e) => e.stopPropagation()}>
        <div className="row spread edit-head">
          <h2 className="edit-title">Add streaming source</h2>
          <button className="icon-btn" onClick={onClose} disabled={busy} title="Close">✕</button>
        </div>

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

        {error && <div className="import-error">{error}</div>}

        <div className="field">
          <label>URL</label>
          <input
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={active.placeholder}
            onKeyDown={(e) => { if (e.key === "Enter") void handleSubmit(); }}
          />
        </div>

        <p className="mute add-hint">{active.hint}</p>

        <div className="row spread edit-actions">
          <span className="grow" />
          <div className="row">
            <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="btn btn-primary" onClick={() => void handleSubmit()} disabled={!canSubmit}>
              {busy ? "Adding…" : "Add"}
            </button>
          </div>
        </div>

        <p className="mute edit-note">
          dub-deck stores only the link and metadata — the media streams from its host, so a
          large library costs no extra disk.
        </p>
      </div>
    </div>
  );
}
