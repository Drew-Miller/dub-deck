// Edit a show's title and cover art. Cover accepts a pasted image (saved to
// app-data) or a pasted image URL.

import { useState } from "react";
import type { JSX, ClipboardEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { appDataDir, join } from "@tauri-apps/api/path";
import { updateShow, setShowImage } from "../lib/db";
import { imageSrc } from "../lib/sources";
import type { Show } from "../types";
import "./EditEpisodeDialog.css";

interface Props {
  show: Show;
  onSaved: () => void;
  onClose: () => void;
}

export default function ShowEditDialog({ show, onSaved, onClose }: Props): JSX.Element {
  const [title, setTitle] = useState(show.title);
  const [thumbUrl, setThumbUrl] = useState<string | null>(show.image_url);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveThumbBlob(blob: Blob) {
    setBusy(true);
    setError(null);
    try {
      const ext = (blob.type.split("/")[1] || "png").replace("jpeg", "jpg").replace("svg+xml", "svg");
      const dir = await join(await appDataDir(), "thumbnails");
      const dest = await join(dir, `show-${show.id}-${Date.now()}.${ext}`);
      const buf = new Uint8Array(await blob.arrayBuffer());
      await invoke("save_thumbnail", { dest, data: Array.from(buf) });
      await setShowImage(show.id, dest);
      setThumbUrl(dest);
      onSaved();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }

  async function onThumbPaste(e: ClipboardEvent<HTMLDivElement>) {
    const items = e.clipboardData ? Array.from(e.clipboardData.items) : [];
    for (const it of items) {
      if (it.type.startsWith("image/")) {
        const blob = it.getAsFile();
        if (blob) {
          e.preventDefault();
          await saveThumbBlob(blob);
          return;
        }
      }
    }
    const text = e.clipboardData?.getData("text")?.trim();
    if (text && /^https?:\/\/\S+$/i.test(text)) {
      e.preventDefault();
      await setShowImage(show.id, text);
      setThumbUrl(text);
      onSaved();
    }
  }

  async function clearThumb() {
    await setShowImage(show.id, null);
    setThumbUrl(null);
    onSaved();
  }

  async function handleSave() {
    setBusy(true);
    setError(null);
    try {
      await updateShow(show.id, { title: title.trim() });
      onSaved();
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
          <h2 className="edit-title">Edit show</h2>
          <button className="icon-btn" onClick={onClose} disabled={busy} title="Close">✕</button>
        </div>

        {error && <div className="import-error">{error}</div>}

        <div className="field">
          <label>Cover</label>
          <div className="edit-thumb-row">
            <div className="edit-thumb-preview">
              {imageSrc(thumbUrl) ? <img src={imageSrc(thumbUrl)!} alt="" /> : <span className="edit-thumb-none">No image</span>}
            </div>
            <div className="edit-thumb-paste" tabIndex={0} onPaste={onThumbPaste} title="Click here, then paste an image or an image URL">
              {busy ? "Saving…" : "Click and paste an image (or an image URL)"}
            </div>
            {thumbUrl && (
              <button type="button" className="btn btn-ghost" onClick={clearThumb} disabled={busy}>Clear</button>
            )}
          </div>
        </div>

        <div className="field">
          <label>Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div className="row spread edit-actions">
          <span className="grow" />
          <div className="row">
            <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={busy || !title.trim()}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}
