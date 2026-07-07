// EditEpisodeDialog — edit an episode's metadata (podcast/show, number, title,
// date, description) or delete it. Opened from an episode row in the library.

import { useEffect, useState } from "react";
import type { JSX } from "react";
import type { Episode, Show } from "../types";
import {
  listShows,
  updateEpisode,
  setEpisodeShow,
  deleteEpisode,
} from "../lib/db";
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

        <div className="edit-path mute truncate" title={episode.file_path}>
          {episode.file_path}
        </div>

        {error && <div className="import-error">{error}</div>}

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
