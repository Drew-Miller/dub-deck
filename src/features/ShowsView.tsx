// ShowsView — a square album-cover grid of shows (recently updated first). Click a
// cover to see that show's episodes; play from there.

import { useEffect, useState } from "react";
import type { JSX } from "react";
import { listShowsRecent, listEpisodes, toggleShowFavorite } from "../lib/db";
import { imageSrc } from "../lib/sources";
import { usePlayer, useLibraryVersion, useBumpLibrary } from "../lib/state";
import { useTools } from "../lib/downloads";
import type { Show, Episode } from "../types";
import EpisodeRow from "./EpisodeRow";
import ShowEditDialog from "./ShowEditDialog";
import "./ShowsView.css";
import "./Sidebars.css";

function initialOf(s: string | null | undefined): string {
  return (s ?? "?").trim().charAt(0).toUpperCase() || "?";
}

export default function ShowsView({ openId }: { openId?: number }): JSX.Element {
  const { playQueue } = usePlayer();
  const version = useLibraryVersion();
  const bump = useBumpLibrary();
  const tools = useTools(version);
  const [shows, setShows] = useState<Show[]>([]);
  const [selected, setSelected] = useState<Show | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [editing, setEditing] = useState<Show | null>(null);

  async function onToggleFav(s: Show) {
    await toggleShowFavorite(s.id);
    bump();
  }

  useEffect(() => {
    if (openId == null) return;
    const s = shows.find((x) => x.id === openId);
    if (s) setSelected(s);
  }, [openId, shows]);

  useEffect(() => {
    listShowsRecent().then(setShows).catch(() => setShows([]));
  }, [version]);

  useEffect(() => {
    if (!selected) {
      setEpisodes([]);
      return;
    }
    let cancelled = false;
    listEpisodes({ showIds: [selected.id], sort: "number_asc" })
      .then((r) => { if (!cancelled) setEpisodes(r); })
      .catch(() => { if (!cancelled) setEpisodes([]); });
    return () => { cancelled = true; };
  }, [selected, version]);

  if (selected) {
    return (
      <div className="dd-view">
        <div className="row shows-detail-head">
          <button className="btn btn-ghost" onClick={() => setSelected(null)}>← Shows</button>
          <h2 className="dd-view-title grow truncate">{selected.title}</h2>
          <button
            className="btn btn-primary"
            onClick={() => playQueue(episodes, 0, selected.title)}
            disabled={episodes.length === 0}
          >
            ▶ Play all
          </button>
        </div>
        <div className="episode-list scroll-y">
          {episodes.map((ep) => (
            <EpisodeRow key={ep.id} episode={ep} list={episodes} label={selected.title} tools={tools} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="shows-view">
      {shows.length === 0 ? (
        <div className="dd-empty">
          <span className="dd-empty-icon" aria-hidden="true">▦</span>
          <span>No shows yet — import some episodes.</span>
        </div>
      ) : (
        <div className="shows-grid">
          {shows.map((s) => {
            const img = imageSrc(s.image_url);
            return (
              <div key={s.id} className="show-card">
                <div className="show-cover-wrap">
                  <button className="show-cover" onClick={() => setSelected(s)} title={s.title}>
                    {img ? <img src={img} alt="" loading="lazy" /> : <span>{initialOf(s.title)}</span>}
                  </button>
                  <button
                    className={`show-fav${s.favorited ? " active" : ""}`}
                    title={s.favorited ? "Unfavorite show" : "Favorite show"}
                    onClick={() => onToggleFav(s)}
                  >
                    {s.favorited ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" /></svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 20.5l-1.3-1.18C6 15 3 12.2 3 8.75 3 6.13 5.02 4 7.5 4c1.6 0 3.1.86 4 2.2C12.4 4.86 13.9 4 15.5 4 17.98 4 20 6.13 20 8.75c0 3.45-3 6.25-7.7 10.57L12 20.5z" /></svg>
                    )}
                  </button>
                </div>
                <button className="show-cover-title" onClick={() => setSelected(s)}>
                  <span className="show-name truncate">{s.title}</span>
                </button>
                <div className="row spread show-card-foot">
                  <span className="show-count mute">{s.episode_count ?? 0} ep</span>
                  <button className="btn btn-ghost show-edit" onClick={() => setEditing(s)}>✎ Edit</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <ShowEditDialog
          show={editing}
          onSaved={() => bump()}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
