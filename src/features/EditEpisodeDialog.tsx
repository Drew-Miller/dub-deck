// EditEpisodeDialog — edit an episode's metadata (podcast/show, number, title,
// date, description) or delete it. Opened from an episode row in the library.

import { useEffect, useState } from "react";
import type { JSX, ClipboardEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { appDataDir, join } from "@tauri-apps/api/path";
import type { Episode, Show } from "../types";
import {
  listShows,
  updateEpisode,
  setEpisodeShow,
  deleteEpisode,
  setThumbnail,
} from "../lib/db";
import { imageSrc } from "../lib/sources";
import "./EditEpisodeDialog.css";

interface Props {
  episode: Episode;
  onSaved: () => void;
  onClose: () => void;
}

export default function EditEpisodeDialog({ episode, onSaved, onClose }: Props): JSX.Element {
  const [showTitle, setShowTitle] = useState(episode.show_title ?? "");
  const [title, setTitle] = useState(episode.title);
  const [episodeNumber, setEpisodeNumber] = useState(
    episode.episode_number != null ? String(episode.episode_number) : ""
  );
  const [publishedDate, setPublishedDate] = useState(episode.published_date ?? "");
  const [description, setDescription] = useState(episode.description ?? "");

  const [shows, setShows] = useState<Show[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [thumbUrl, setThumbUrl] = useState<string | null>(episode.thumbnail_url);
  const [thumbBusy, setThumbBusy] = useState(false);
  const [thumbErr, setThumbErr] = useState<string | null>(null);

  async function saveThumbBlob(blob: Blob) {
    setThumbBusy(true);
    setThumbErr(null);
    try {
      const ext = (blob.type.split("/")[1] || "png").replace("jpeg", "jpg").replace("svg+xml", "svg");
      const dir = await join(await appDataDir(), "thumbnails");
      const dest = await join(dir, `ep-${episode.id}-${Date.now()}.${ext}`);
      const buf = new Uint8Array(await blob.arrayBuffer());
      await invoke("save_thumbnail", { dest, data: Array.from(buf) });
      await setThumbnail(episode.id, dest);
      setThumbUrl(dest);
      onSaved();
    } catch (e) {
      setThumbErr(String(e instanceof Error ? e.message : e));
    } finally {
      setThumbBusy(false);
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
      await setThumbnail(episode.id, text);
      setThumbUrl(text);
      onSaved();
    }
  }

  async function clearThumb() {
    await setThumbnail(episode.id, null);
    setThumbUrl(null);
    onSaved();
  }

  useEffect(() => {
    listShows().then(setShows).catch(() => {});
  }, []);

  const canSave = showTitle.trim().length > 0 && title.trim().length > 0 && !busy;

  async function handleSave() {
    if (!canSave) return;
    setBusy(true);
    setError(null);
    try {
      await updateEpisode(episode.id, {
        title: title.trim(),
        description: description,
        episode_number: episodeNumber.trim() === "" ? null : Number(episodeNumber),
        published_date: publishedDate.trim() === "" ? null : publishedDate,
      });
      if (showTitle.trim() !== (episode.show_title ?? "")) {
        await setEpisodeShow(episode.id, showTitle.trim());
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    setError(null);
    try {
      await deleteEpisode(episode.id);
      onSaved();
      onClose();
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="modal edit-modal" onClick={(e) => e.stopPropagation()}>
        <div className="row spread edit-head">
          <h2 className="edit-title">Edit episode</h2>
          <button className="icon-btn" onClick={onClose} disabled={busy} title="Close">✕</button>
        </div>

        <div className="edit-source mute">
          <div><span className="edit-source-k">Source</span> {episode.source_type}</div>
          {episode.source_url && (
            <div className="truncate" title={episode.source_url}>
              <span className="edit-source-k">URL</span> {episode.source_url}
            </div>
          )}
          {episode.file_path && (
            <div className="truncate" title={episode.file_path}>
              <span className="edit-source-k">Path</span> {episode.file_path}
            </div>
          )}
          {episode.download_path && (
            <div className="truncate" title={episode.download_path}>
              <span className="edit-source-k">Downloaded</span> {episode.download_path}
            </div>
          )}
        </div>

        {error && <div className="import-error">{error}</div>}

        <div className="field">
          <label>Thumbnail</label>
          <div className="edit-thumb-row">
            <div className="edit-thumb-preview">
              {imageSrc(thumbUrl) ? (
                <img src={imageSrc(thumbUrl)!} alt="" />
              ) : (
                <span className="edit-thumb-none">No image</span>
              )}
            </div>
            <div
              className="edit-thumb-paste"
              tabIndex={0}
              onPaste={onThumbPaste}
              title="Click here, then paste (Ctrl/Cmd+V) an image or an image URL"
            >
              {thumbBusy ? "Saving…" : "Click and paste an image (or an image URL)"}
            </div>
            {thumbUrl && (
              <button type="button" className="btn btn-ghost" onClick={clearThumb} disabled={thumbBusy}>
                Clear
              </button>
            )}
          </div>
          {thumbErr && <div className="import-error">{thumbErr}</div>}
        </div>

        <div className="field">
          <label>Podcast / show</label>
          <input
            list="edit-show-list"
            value={showTitle}
            onChange={(e) => setShowTitle(e.target.value)}
            placeholder="e.g. The Joe Rogan Experience"
          />
          <datalist id="edit-show-list">
            {shows.map((s) => (
              <option key={s.id} value={s.title} />
            ))}
          </datalist>
        </div>

        <div className="row edit-two">
          <div className="field grow">
            <label>Episode #</label>
            <input
              type="number"
              value={episodeNumber}
              onChange={(e) => setEpisodeNumber(e.target.value)}
              placeholder="e.g. 1500"
            />
          </div>
          <div className="field grow">
            <label>Date</label>
            <input
              type="date"
              value={publishedDate}
              onChange={(e) => setPublishedDate(e.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label>Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div className="field">
          <label>Description</label>
          <textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Searchable notes for this episode…"
          />
        </div>

        <div className="row spread edit-actions">
          {confirmDelete ? (
            <div className="row edit-confirm">
              <span className="mute">Delete this episode?</span>
              <button className="btn edit-danger" onClick={handleDelete} disabled={busy}>
                Yes, delete
              </button>
              <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)} disabled={busy}>
                Cancel
              </button>
            </div>
          ) : (
            <button className="btn btn-ghost edit-delete-trigger" onClick={() => setConfirmDelete(true)} disabled={busy}>
              🗑 Delete
            </button>
          )}
          <div className="row">
            <button className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={!canSave}>
              {busy ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>

        <p className="mute edit-note">
          Editing only changes this episode's info in dub-deck — your video file is never
          moved or renamed.
        </p>
      </div>
    </div>
  );
}
