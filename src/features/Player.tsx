// Global docked media player for dub-deck. Mounted once by App.tsx; renders
// nothing until something is playing. Consumes the shared player queue.

import { useCallback, useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import { usePlayer, useBumpLibrary } from "../lib/state";
import {
  mediaSrc,
  toggleLike,
  toggleFavorite,
  setDuration,
  listPlaylists,
  createPlaylist,
  addToPlaylist,
} from "../lib/db";
import type { Playlist } from "../types";
import "./Player.css";

// ---- inline icons (no icon dependency; unicode/SVG only) ----

function Icon({ children, title }: { children: string; title: string }): JSX.Element {
  return (
    <span className="pl-glyph" aria-hidden="true" title={title}>
      {children}
    </span>
  );
}

export default function Player(): JSX.Element | null {
  const { current, queue, index, next, prev, close } = usePlayer();
  const bump = useBumpLibrary();

  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Local mirror of like/favorite; the queue's Episode copy can be stale.
  const [liked, setLiked] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const [descOpen, setDescOpen] = useState(false);

  // Playlist popover state.
  const [plOpen, setPlOpen] = useState(false);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [newName, setNewName] = useState("");

  const currentId = current?.id ?? null;

  // Re-sync local like/favorite whenever the playing episode changes.
  useEffect(() => {
    if (!current) return;
    setLiked(current.liked);
    setFavorited(current.favorited);
    setDescOpen(false);
    setPlOpen(false);
  }, [current, currentId]);

  const refreshPlaylists = useCallback(async () => {
    setPlaylists(await listPlaylists());
  }, []);

  const openPlaylists = useCallback(async () => {
    setPlOpen(true);
    await refreshPlaylists();
  }, [refreshPlaylists]);

  const onToggleLike = useCallback(async () => {
    if (currentId == null) return;
    const value = await toggleLike(currentId);
    setLiked(value);
    bump();
  }, [currentId, bump]);

  const onToggleFavorite = useCallback(async () => {
    if (currentId == null) return;
    const value = await toggleFavorite(currentId);
    setFavorited(value);
    bump();
  }, [currentId, bump]);

  const onLoadedMetadata = useCallback(() => {
    const el = videoRef.current;
    if (!el || currentId == null) return;
    if (current && current.duration == null && Number.isFinite(el.duration)) {
      void setDuration(currentId, el.duration);
    }
  }, [current, currentId]);

  const onPickPlaylist = useCallback(
    async (playlistId: number) => {
      if (currentId == null) return;
      await addToPlaylist(playlistId, currentId);
      setPlOpen(false);
    },
    [currentId]
  );

  const onCreatePlaylist = useCallback(async () => {
    const name = newName.trim();
    if (!name || currentId == null) return;
    const id = await createPlaylist(name);
    await addToPlaylist(id, currentId);
    setNewName("");
    setPlOpen(false);
  }, [newName, currentId]);

  if (!current) return null;

  const hasPrev = index > 0;
  const hasNext = index < queue.length - 1;

  const metaParts: string[] = [];
  if (current.episode_number != null) metaParts.push(`#${current.episode_number}`);
  if (current.published_date) metaParts.push(current.published_date);

  return (
    <div className="player" role="region" aria-label="Now playing">
      <div className="player-inner">
        <div className="player-video">
          <video
            ref={videoRef}
            className="player-video-el"
            src={mediaSrc(current.file_path)}
            controls
            autoPlay
            onEnded={next}
            onLoadedMetadata={onLoadedMetadata}
          />
        </div>

        <div className="player-side">
          <div className="player-head">
            <div className="grow">
              {current.show_title && (
                <div className="player-show truncate">{current.show_title}</div>
              )}
              <h2 className="player-title">{current.title}</h2>
              {metaParts.length > 0 && (
                <div className="player-meta mute">{metaParts.join(" · ")}</div>
              )}
            </div>
            <button
              className="icon-btn"
              onClick={close}
              title="Close player"
              aria-label="Close player"
            >
              <Icon title="Close">✕</Icon>
            </button>
          </div>

          <div className="player-controls row">
            <button
              className="icon-btn"
              onClick={prev}
              disabled={!hasPrev}
              title="Previous"
              aria-label="Previous"
            >
              <Icon title="Previous">⏮</Icon>
            </button>
            <button
              className="icon-btn"
              onClick={next}
              disabled={!hasNext}
              title="Next"
              aria-label="Next"
            >
              <Icon title="Next">⏭</Icon>
            </button>

            <span className="player-spacer" />

            <button
              className={`icon-btn like${liked ? " active" : ""}`}
              onClick={onToggleLike}
              title={liked ? "Unlike" : "Like"}
              aria-label={liked ? "Unlike" : "Like"}
              aria-pressed={liked}
            >
              <Icon title="Like">{liked ? "♥" : "♡"}</Icon>
            </button>
            <button
              className={`icon-btn fav${favorited ? " active" : ""}`}
              onClick={onToggleFavorite}
              title={favorited ? "Unfavorite" : "Favorite"}
              aria-label={favorited ? "Unfavorite" : "Favorite"}
              aria-pressed={favorited}
            >
              <Icon title="Favorite">{favorited ? "★" : "☆"}</Icon>
            </button>

            <div className="player-pl-wrap">
              <button
                className={`icon-btn${plOpen ? " active" : ""}`}
                onClick={() => (plOpen ? setPlOpen(false) : void openPlaylists())}
                title="Add to playlist"
                aria-label="Add to playlist"
                aria-expanded={plOpen}
              >
                <Icon title="Add to playlist">＋</Icon>
              </button>

              {plOpen && (
                <div className="player-popover card" role="menu">
                  <div className="player-popover-head row spread">
                    <span className="muted">Add to playlist</span>
                    <button
                      className="icon-btn"
                      onClick={() => setPlOpen(false)}
                      title="Close"
                      aria-label="Close"
                    >
                      <Icon title="Close">✕</Icon>
                    </button>
                  </div>

                  <div className="player-popover-list scroll-y">
                    {playlists.length === 0 && (
                      <div className="mute player-popover-empty">No playlists yet.</div>
                    )}
                    {playlists.map((pl) => (
                      <button
                        key={pl.id}
                        className="player-pl-item"
                        onClick={() => void onPickPlaylist(pl.id)}
                        role="menuitem"
                      >
                        <span className="truncate">{pl.name}</span>
                        {pl.item_count != null && (
                          <span className="mute">{pl.item_count}</span>
                        )}
                      </button>
                    ))}
                  </div>

                  <div className="player-popover-new row">
                    <input
                      className="grow"
                      placeholder="＋ New playlist"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void onCreatePlaylist();
                      }}
                    />
                    <button
                      className="btn btn-primary"
                      onClick={() => void onCreatePlaylist()}
                      disabled={!newName.trim()}
                    >
                      Add
                    </button>
                  </div>
                </div>
              )}
            </div>

            <span className="player-queue mute">
              Queue: {index + 1} / {queue.length}
            </span>
          </div>

          {current.description && (
            <div className={`player-desc${descOpen ? " open" : ""}`}>
              <button
                className="player-desc-toggle btn-ghost"
                onClick={() => setDescOpen((v) => !v)}
                aria-expanded={descOpen}
              >
                {descOpen ? "Hide description" : "Show description"}
              </button>
              {descOpen && (
                <div className="player-desc-body scroll-y">{current.description}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
