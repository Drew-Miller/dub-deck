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
import { useTools } from "../lib/downloads";
import type { Playlist, Episode } from "../types";
import EpisodeRow from "./EpisodeRow";
import "./Sidebars.css";

export default function PlaylistsView({ openId }: { openId?: number }): JSX.Element {
  const { playQueue } = usePlayer();
  const version = useLibraryVersion();
  const bump = useBumpLibrary();
  const tools = useTools(version);

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [favOnly, setFavOnly] = useState(false);

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

  useEffect(() => {
    if (openId != null) setSelectedId(openId);
  }, [openId]);

  const selected = playlists.find((p) => p.id === selectedId) ?? null;
  const shown = favOnly ? episodes.filter((e) => e.favorited) : episodes;

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

        {/* -------- right: selected playlist's episodes (flat, Library-style) -------- */}
        <div className="dd-panel dd-panel-main">
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
                    className={"chip" + (favOnly ? " active" : "")}
                    onClick={() => setFavOnly((v) => !v)}
                  >
                    <span aria-hidden="true">&#9829;</span> Favorites
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => playQueue(shown, 0, selected.name)}
                    disabled={shown.length === 0}
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

              {shown.length === 0 ? (
                <div className="dd-empty">
                  <span className="dd-empty-icon" aria-hidden="true">&#9834;</span>
                  <span>{favOnly ? "No favorites in this playlist." : "This playlist is empty."}</span>
                </div>
              ) : (
                <div className="episode-list scroll-y">
                  {shown.map((ep) => (
                    <EpisodeRow
                      key={ep.id}
                      episode={ep}
                      list={shown}
                      label={selected.name}
                      tools={tools}
                      extraMenuItems={
                        <button role="menuitem" onClick={() => void handleRemove(ep.id)}>
                          <span className="row-menu-icon" aria-hidden="true">✕</span> Remove from playlist
                        </button>
                      }
                    />
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
