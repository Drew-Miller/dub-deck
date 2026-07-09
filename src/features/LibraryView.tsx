// LibraryView — owns the filter state, queries the database as filters change,
// and renders the filtered episode list. Playback is started through the shared
// player so next/prev walk the currently-visible (filtered) list.

import { useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type { Show, Episode, EpisodeFilter, EpisodeSort, SortField, SortDir, Playlist } from "../types";
import { listShows, listEpisodes, listYears, deleteEpisode, listPlaylists, addToPlaylist } from "../lib/db";
import { downloadEpisode, removeDownload, downloadState, loadTools, type Tools } from "../lib/downloads";
import RowThumb from "./RowThumb";
import { usePlayer, useLibraryVersion, useBumpLibrary } from "../lib/state";
import { log } from "../lib/log";
import FilterBar, { type FilterState } from "./FilterBar";
import EditEpisodeDialog from "./EditEpisodeDialog";
import "./LibraryView.css";

const DEFAULT_FILTER: FilterState = {
  showIds: [],
  search: "",
  favoritedOnly: false,
  sortField: "added",
  sortDir: "desc",
};

/** Map a (field, direction) pair to the DB sort key. */
function sortKey(field: SortField, dir: SortDir): EpisodeSort {
  if (field === "number") return dir === "asc" ? "number_asc" : "number_desc";
  if (field === "date") return dir === "asc" ? "date_asc" : "date_desc";
  if (field === "added") return dir === "asc" ? "added_asc" : "added_desc";
  return dir === "asc" ? "title_asc" : "title_desc";
}

/** Translate the UI filter into the database's EpisodeFilter shape. */
function toEpisodeFilter(f: FilterState, search: string): EpisodeFilter {
  const out: EpisodeFilter = {
    showIds: f.showIds.length ? f.showIds : undefined,
    search: search.trim() || undefined,
    year: f.year,
    month: f.month,
    favoritedOnly: f.favoritedOnly || undefined,
    sort: sortKey(f.sortField, f.sortDir),
  };
  if (f.episodeBucket) {
    // Bucket [100, 200] means 100..199 so adjacent buckets don't overlap.
    out.episodeMin = f.episodeBucket[0];
    out.episodeMax = f.episodeBucket[1] - 1;
  }
  return out;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return iso;
}

/** Per-source-type label + color class for the library row badge. */
const SOURCE_META: Record<string, { label: string; cls: string }> = {
  file: { label: "Local", cls: "src-file" },
  rss: { label: "Podcast", cls: "src-rss" },
  direct_url: { label: "URL", cls: "src-url" },
  youtube: { label: "YouTube", cls: "src-youtube" },
  vimeo: { label: "Vimeo", cls: "src-vimeo" },
  scrape: { label: "Scrape", cls: "src-scrape" },
};

const IconCloudDownload = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 19a4 4 0 0 1-.4-7.98A6 6 0 0 1 18 8a4.5 4.5 0 0 1 .5 8.98" />
    <path d="M12 11.5v5" />
    <path d="M9.5 14l2.5 2.5 2.5-2.5" />
  </svg>
);
const IconCheck = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M9.6 16.6L4.4 11.4 5.8 10l3.8 3.8L18.2 5.2 19.6 6.6z" />
  </svg>
);

export default function LibraryView({ onImport }: { onImport?: () => void }): JSX.Element {
  const player = usePlayer();
  const libraryVersion = useLibraryVersion();
  const bumpLibrary = useBumpLibrary();

  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [editing, setEditing] = useState<Episode | null>(null);
  const [tools, setTools] = useState<Tools>({ ytdlp: false, ffmpeg: false });
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkPlaylists, setBulkPlaylists] = useState<Playlist[]>([]);
  const [bulkPlOpen, setBulkPlOpen] = useState(false);

  const [filter, setFilter] = useState<FilterState>(DEFAULT_FILTER);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [shows, setShows] = useState<Show[]>([]);
  const [years, setYears] = useState<number[]>([]);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [maxEpisodeNumber, setMaxEpisodeNumber] = useState(0);
  const [loading, setLoading] = useState(true);

  // Debounce the free-text search so we don't hit the DB on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(filter.search), 250);
    return () => clearTimeout(t);
  }, [filter.search]);

  // Load the list of shows (and the max episode number seen for bucketing).
  useEffect(() => {
    let cancelled = false;
    listShows().then((rows) => {
      if (!cancelled) setShows(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [libraryVersion]);

  // Reload the year list whenever the selected shows change (or data changes).
  useEffect(() => {
    let cancelled = false;
    const ids = filter.showIds.length ? filter.showIds : undefined;
    listYears(ids).then((rows) => {
      if (!cancelled) setYears(rows);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter.showIds.join(","), libraryVersion]);

  // Query episodes on any (debounced) filter change or library refresh.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listEpisodes(toEpisodeFilter(filter, debouncedSearch))
      .then((rows) => {
        if (cancelled) return;
        setEpisodes(rows);
        // Track the largest episode number we've observed to size the buckets.
        setMaxEpisodeNumber((prev) => {
          const localMax = rows.reduce(
            (m, e) => (e.episode_number != null && e.episode_number > m ? e.episode_number : m),
            0
          );
          return Math.max(prev, localMax);
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filter.showIds.join(","),
    debouncedSearch,
    filter.year,
    filter.month,
    filter.episodeBucket?.[0],
    filter.episodeBucket?.[1],
    filter.favoritedOnly,
    filter.sortField,
    filter.sortDir,
    libraryVersion,
  ]);

  // Keep a stable reference to the current list for the player queue.
  const queueRef = useRef<Episode[]>(episodes);
  queueRef.current = episodes;

  const resultLabel = useMemo(() => {
    const n = episodes.length;
    return `${n} episode${n === 1 ? "" : "s"}`;
  }, [episodes.length]);

  // Label the playback context by the single selected show, else the library.
  const contextLabel = useMemo(() => {
    if (filter.showIds.length === 1) {
      const s = shows.find((x) => x.id === filter.showIds[0]);
      if (s) return s.title;
    }
    return "Library";
  }, [filter.showIds, shows]);

  const playEpisode = (ep: Episode) => {
    player.play(ep, queueRef.current, contextLabel);
  };

  useEffect(() => {
    loadTools().then(setTools).catch(() => {});
  }, [libraryVersion]);

  const onDownload = async (ep: Episode) => {
    setMenuFor(null);
    try {
      await downloadEpisode(ep);
      bumpLibrary();
    } catch (e) {
      log.warn("download failed", { id: ep.id, error: String(e) });
    }
  };

  const onRemoveDownload = async (ep: Episode) => {
    setMenuFor(null);
    try {
      await removeDownload(ep);
      bumpLibrary();
    } catch (e) {
      log.warn("remove download failed", { id: ep.id, error: String(e) });
    }
  };

  const onReveal = async (ep: Episode) => {
    setMenuFor(null);
    try {
      await revealItemInDir(ep.file_path);
    } catch (e) {
      log.warn("reveal in finder failed", { error: String(e) });
    }
  };

  const onDelete = async (ep: Episode) => {
    setMenuFor(null);
    await deleteEpisode(ep.id);
    bumpLibrary();
  };

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const exitSelect = () => {
    setSelectMode(false);
    setSelected(new Set());
    setBulkPlOpen(false);
  };

  const bulkDelete = async () => {
    for (const id of selected) await deleteEpisode(id);
    exitSelect();
    bumpLibrary();
  };

  const openBulkPlaylists = async () => {
    setBulkPlaylists(await listPlaylists());
    setBulkPlOpen(true);
  };

  const bulkAddToPlaylist = async (playlistId: number) => {
    for (const id of selected) await addToPlaylist(playlistId, id);
    exitSelect();
    bumpLibrary();
  };

  // Close the row ⋯ menu on any outside mousedown.
  useEffect(() => {
    if (menuFor == null) return;
    const onDown = () => setMenuFor(null);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuFor]);

  return (
    <div className="library">
      <div className="library-header">
        <FilterBar
          shows={shows}
          years={years}
          maxEpisodeNumber={maxEpisodeNumber}
          value={filter}
          onChange={setFilter}
        />
        <div className="row spread library-meta">
          <span className="muted">{loading ? "Loading…" : resultLabel}</span>
          <div className="row">
            <button className="btn btn-ghost" onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}>
              {selectMode ? "Done" : "✎ Select"}
            </button>
            {onImport && (
              <button className="btn btn-ghost library-import" onClick={onImport}>
                ＋ Import
              </button>
            )}
          </div>
        </div>

        {selectMode && (
          <div className="row spread library-bulk">
            <span className="muted">{selected.size} selected</span>
            <div className="row" onClick={(e) => e.stopPropagation()}>
              <div className="row-menu-wrap">
                <button
                  className="btn btn-ghost"
                  disabled={!selected.size}
                  onClick={() => { if (bulkPlOpen) setBulkPlOpen(false); else void openBulkPlaylists(); }}
                >
                  Add to playlist
                </button>
                {bulkPlOpen && (
                  <div className="row-menu card" role="menu" onMouseDown={(e) => e.stopPropagation()}>
                    {bulkPlaylists.length === 0 && <div className="row-menu-empty mute">No playlists yet.</div>}
                    {bulkPlaylists.map((pl) => (
                      <button key={pl.id} role="menuitem" onClick={() => bulkAddToPlaylist(pl.id)}>
                        {pl.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button className="btn edit-danger" disabled={!selected.size} onClick={bulkDelete}>
                Delete
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="library-list scroll-y">
        {episodes.length === 0 && !loading ? (
          <div className="library-empty">
            <div className="library-empty-title">No episodes match</div>
            <div className="muted">
              Try clearing a filter, or import some episodes to get started.
            </div>
          </div>
        ) : (
          episodes.map((ep) => {
            const isCurrent = player.current?.id === ep.id;
            const dl = downloadState(ep, tools);
            const src = SOURCE_META[ep.source_type] ?? { label: ep.source_type, cls: "" };
            return (
              <div
                key={ep.id}
                className={`episode-row${isCurrent ? " current" : ""}${selectMode && selected.has(ep.id) ? " selected" : ""}`}
                onClick={() => (selectMode ? toggleSelect(ep.id) : playEpisode(ep))}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    if (selectMode) toggleSelect(ep.id);
                    else playEpisode(ep);
                  }
                }}
              >
                {selectMode && (
                  <div className="episode-check" aria-hidden="true">
                    {selected.has(ep.id) ? "☑" : "☐"}
                  </div>
                )}
                <RowThumb ep={ep} />
                {ep.episode_number != null && (
                  <div className="episode-num">{ep.episode_number}</div>
                )}

                <div className="grow episode-main">
                  <div className="episode-title truncate">{ep.title}</div>
                  <div className="episode-sub muted truncate">
                    {ep.show_title ?? "Unknown show"} · {formatDate(ep.published_date)}
                  </div>
                  {ep.duration && ep.position ? (
                    <div className="episode-progress" title={`${Math.round((ep.position / ep.duration) * 100)}% watched`}>
                      <div
                        className="episode-progress-fill"
                        style={{ width: `${Math.min(100, (ep.position / ep.duration) * 100)}%` }}
                      />
                    </div>
                  ) : null}
                </div>

                <div className="episode-flags">
                  {ep.finished && <span className="src-badge src-finished" title="Finished">✓</span>}
                  <span className={`src-badge ${src.cls}`} title={`Source: ${src.label}`}>{src.label}</span>
                  {ep.download_path && (
                    <span className="src-badge src-downloaded" title="Downloaded">⬇</span>
                  )}
                  {ep.favorited && (
                    <span className="flag fav" title="Favorite">♥</span>
                  )}
                </div>

                {!selectMode && (
                  <button
                    className="icon-btn play-btn"
                    title="Play"
                    onClick={(e) => {
                      e.stopPropagation();
                      playEpisode(ep);
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </button>
                )}

                {!selectMode && dl !== "none" && (
                  <button
                    className={`icon-btn dl-btn${dl === "downloaded" ? " active" : ""}`}
                    title={dl === "downloaded" ? "Downloaded — remove" : dl === "needs-ytdlp" ? "Enable yt-dlp in Settings" : dl === "needs-ffmpeg" ? "Enable ffmpeg in Settings" : "Download"}
                    disabled={dl === "needs-ytdlp" || dl === "needs-ffmpeg"}
                    onClick={(e) => { e.stopPropagation(); if (dl === "downloaded") onRemoveDownload(ep); else onDownload(ep); }}
                  >
                    {dl === "downloaded" ? <IconCheck /> : <IconCloudDownload />}
                  </button>
                )}

                <div className="row-menu-wrap" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="icon-btn"
                    title="More"
                    aria-haspopup="menu"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuFor(menuFor === ep.id ? null : ep.id);
                    }}
                  >
                    <span aria-hidden="true">⋯</span>
                  </button>
                  {menuFor === ep.id && (
                    <div
                      className="row-menu card"
                      role="menu"
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <button role="menuitem" onClick={() => { setMenuFor(null); player.playNext(ep); }}>
                        <span className="row-menu-icon" aria-hidden="true">⏭</span> Play next
                      </button>
                      <button role="menuitem" onClick={() => { setMenuFor(null); player.addToQueue(ep); }}>
                        <span className="row-menu-icon" aria-hidden="true">＋</span> Add to queue
                      </button>
                      {dl !== "none" && (
                        <>
                          <div className="row-menu-sep" />
                          {dl === "downloaded" && (
                            <button role="menuitem" onClick={() => onRemoveDownload(ep)}>
                              <span className="row-menu-icon" aria-hidden="true">✓</span> Remove download
                            </button>
                          )}
                          {dl === "available" && (
                            <button role="menuitem" onClick={() => onDownload(ep)}>
                              <span className="row-menu-icon" aria-hidden="true">⬇</span> Download
                            </button>
                          )}
                          {dl === "needs-ytdlp" && (
                            <button role="menuitem" disabled title="Enable yt-dlp in Settings">
                              <span className="row-menu-icon" aria-hidden="true">⬇</span> Download (needs yt-dlp)
                            </button>
                          )}
                          {dl === "needs-ffmpeg" && (
                            <button role="menuitem" disabled title="Enable ffmpeg in Settings">
                              <span className="row-menu-icon" aria-hidden="true">⬇</span> Download (needs ffmpeg)
                            </button>
                          )}
                        </>
                      )}
                      <div className="row-menu-sep" />
                      <button role="menuitem" onClick={() => { setMenuFor(null); setEditing(ep); }}>
                        <span className="row-menu-icon" aria-hidden="true">✎</span> Edit metadata
                      </button>
                      {ep.source_type === "file" && (
                        <button role="menuitem" onClick={() => onReveal(ep)}>
                          <span className="row-menu-icon" aria-hidden="true">↗</span> Reveal in Finder
                        </button>
                      )}
                      <div className="row-menu-sep" />
                      <button role="menuitem" className="row-menu-danger" onClick={() => onDelete(ep)}>
                        <span className="row-menu-icon" aria-hidden="true">🗑</span> Delete episode
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {editing && (
        <EditEpisodeDialog
          episode={editing}
          onSaved={() => bumpLibrary()}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
