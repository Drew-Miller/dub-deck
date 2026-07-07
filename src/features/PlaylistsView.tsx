import { useEffect, useState } from "react";
import type { JSX } from "react";
import {
  listPlaylists,
  createPlaylist,
  deletePlaylist,
  listPlaylistEpisodes,
  removeFromPlaylist,
} from "../lib/db";
import { usePlayer, useLibraryVersion, useBumpLibrary } from "../lib/state";
import type { Playlist, Episode } from "../types";
import "./Sidebars.css";

/** Format an ISO 'YYYY-MM-DD' date into something compact and readable. */
function formatDate(date: string | null): string {
  if (!date) return "";
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function PlaylistsView(): JSX.Element {
  const { play, playQueue } = usePlayer();
  const version = useLibraryVersion();
  const bump = useBumpLibrary();

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  // Load the playlist list (and keep the selection valid) on library changes.
  useEffect(() => {
    let cancelled = false;
    listPlaylists()
      .then((rows) => {
        if (cancelled) return;
        setPlaylists(rows);
        setSelectedId((current) => {
          if (current != null && rows.some((p) => p.id === current)) return current;
          return rows.length ? rows[0].id : null;
        });
      })
      .catch(() => {
        if (!cancelled) setPlaylists([]);
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  // Load the selected playlist's episodes whenever the selection or data changes.
  useEffect(() => {
    if (selectedId == null) {
      setEpisodes([]);
      return;
    }
    let cancelled = false;
    listPlaylistEpisodes(selectedId)
      .then((rows) => {
        if (!cancelled) setEpisodes(rows);
      })
      .catch(() => {
        if (!cancelled) setEpisodes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, version]);

  const selected = playlists.find((p) => p.id === selectedId) ?? null;

  async function handleCreate() {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const id = await createPlaylist(name);
      setNewName("");
      setSelectedId(id);
      bump();
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: number) {
    await deletePlaylist(id);
    if (selectedId === id) setSelectedId(null);
    bump();
  }

  async function handleRemove(episodeId: number) {
    if (selectedId == null) return;
    await removeFromPlaylist(selectedId, episodeId);
    bump();
  }

  return (
    <div className="dd-view">
      <div>
        <h2 className="dd-view-title">Playlists</h2>
        <p className="dd-view-sub">Group episodes into ordered queues you can play end to end.</p>
      </div>

      <div className="dd-split">
        {/* -------- left: playlist picker -------- */}
        <div className="card dd-panel dd-panel-left">
          <div className="row dd-new-pl">
            <input
              value={newName}
              placeholder="New playlist name…"
              onChange={(e) => setNewName(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
              }}
              disabled={creating}
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              aria-label="Create playlist"
            >
              <span aria-hidden="true">&#65291;</span>
            </button>
          </div>

          {playlists.length === 0 ? (
            <div className="dd-empty">
              <span className="dd-empty-icon" aria-hidden="true">&#9835;</span>
              <span>No playlists yet.</span>
            </div>
          ) : (
            <div className="dd-list scroll-y">
              {playlists.map((pl) => (
                <button
                  key={pl.id}
                  type="button"
                  className={"dd-pl-item" + (pl.id === selectedId ? " active" : "")}
                  onClick={() => setSelectedId(pl.id)}
                >
                  <span className="dd-pl-name truncate">{pl.name}</span>
                  <span className="dd-pl-count">
                    {pl.item_count ?? 0} {pl.item_count === 1 ? "episode" : "episodes"}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* -------- right: selected playlist's episodes -------- */}
        <div className="card dd-panel dd-panel-main">
          {selected == null ? (
            <div className="dd-empty">
              <span className="dd-empty-icon" aria-hidden="true">&#9835;</span>
              <span>Select a playlist to see its episodes.</span>
            </div>
          ) : (
            <>
              <div className="row spread dd-panel-head">
                <h3 className="truncate">{selected.name}</h3>
                <div className="row">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => playQueue(episodes, 0)}
                    disabled={episodes.length === 0}
                  >
                    <span aria-hidden="true">&#9654;</span> Play all
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Delete playlist"
                    title="Delete playlist"
                    onClick={() => handleDelete(selected.id)}
                  >
                    <span aria-hidden="true">&#128465;</span>
                  </button>
                </div>
              </div>

              {episodes.length === 0 ? (
                <div className="dd-empty">
                  <span className="dd-empty-icon" aria-hidden="true">&#9834;</span>
                  <span>This playlist is empty.</span>
                </div>
              ) : (
                <div className="dd-list scroll-y">
                  {episodes.map((ep, i) => (
                    <div
                      key={ep.id}
                      className="dd-row"
                      role="button"
                      tabIndex={0}
                      onClick={() => play(ep, episodes)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          play(ep, episodes);
                        }
                      }}
                    >
                      <span className="dd-row-num">
                        <span className="dd-row-index">{i + 1}</span>
                        <span className="dd-row-play" aria-hidden="true">&#9654;</span>
                      </span>
                      <span className="dd-row-body">
                        <span className="dd-row-title truncate">{ep.title}</span>
                        <span className="dd-row-sub truncate">{ep.show_title}</span>
                      </span>
                      <span className="dd-row-date">{formatDate(ep.published_date)}</span>
                      <button
                        type="button"
                        className="icon-btn dd-row-remove"
                        aria-label="Remove from playlist"
                        title="Remove from playlist"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemove(ep.id);
                        }}
                      >
                        <span aria-hidden="true">&#10005;</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
