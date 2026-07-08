// LibraryView — owns the filter state, queries the database as filters change,
// and renders the filtered episode list. Playback is started through the shared
// player so next/prev walk the currently-visible (filtered) list.

import { useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type { Show, Episode, EpisodeFilter } from "../types";
import { listShows, listEpisodes, listYears, deleteEpisode } from "../lib/db";
import { downloadEpisode, removeDownload, downloadState, loadTools, type Tools } from "../lib/downloads";
import { usePlayer, useLibraryVersion, useBumpLibrary } from "../lib/state";
import { log } from "../lib/log";
import FilterBar, { type FilterState } from "./FilterBar";
import EditEpisodeDialog from "./EditEpisodeDialog";
import "./LibraryView.css";

const DEFAULT_FILTER: FilterState = {
  showIds: [],
  search: "",
  favoritedOnly: false,
  sort: "number_asc",
};

/** Translate the UI filter into the database's EpisodeFilter shape. */
function toEpisodeFilter(f: FilterState, search: string): EpisodeFilter {
  const out: EpisodeFilter = {
    showIds: f.showIds.length ? f.showIds : undefined,
    search: search.trim() || undefined,
    year: f.year,
    month: f.month,
    favoritedOnly: f.favoritedOnly || undefined,
    sort: f.sort,
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

export default function LibraryView(): JSX.Element {
  const player = usePlayer();
  const libraryVersion = useLibraryVersion();
  const bumpLibrary = useBumpLibrary();

  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [editing, setEditing] = useState<Episode | null>(null);
  const [tools, setTools] = useState<Tools>({ ytdlp: false, ffmpeg: false });

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
    filter.sort,
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
        </div>
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
            return (
              <div
                key={ep.id}
                className={`episode-row${isCurrent ? " current" : ""}`}
                onClick={() => playEpisode(ep)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    playEpisode(ep);
                  }
                }}
              >
                <div className="episode-num">
                  {ep.episode_number != null ? ep.episode_number : "•"}
                </div>

                <div className="grow episode-main">
                  <div className="episode-title truncate">{ep.title}</div>
                  <div className="episode-sub muted truncate">
                    {ep.show_title ?? "Unknown show"} · {formatDate(ep.published_date)}
                  </div>
                </div>

                <div className="episode-flags">
                  {ep.favorited && (
                    <span className="flag fav" title="Favorite">♥</span>
                  )}
                </div>

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
                        Play next
                      </button>
                      <button role="menuitem" onClick={() => { setMenuFor(null); player.addToQueue(ep); }}>
                        Add to queue
                      </button>
                      {(() => {
                        const st = downloadState(ep, tools);
                        if (st === "downloaded")
                          return <button role="menuitem" onClick={() => onRemoveDownload(ep)}>Remove download</button>;
                        if (st === "available")
                          return <button role="menuitem" onClick={() => onDownload(ep)}>Download</button>;
                        if (st === "needs-ytdlp")
                          return <button role="menuitem" disabled title="Enable yt-dlp in Settings">Download (needs yt-dlp)</button>;
                        if (st === "needs-ffmpeg")
                          return <button role="menuitem" disabled title="Enable ffmpeg in Settings">Download (needs ffmpeg)</button>;
                        return null;
                      })()}
                      <button role="menuitem" onClick={() => { setMenuFor(null); setEditing(ep); }}>
                        Edit metadata
                      </button>
                      {ep.source_type === "file" && (
                        <button role="menuitem" onClick={() => onReveal(ep)}>
                          Reveal in Finder
                        </button>
                      )}
                      <button role="menuitem" className="row-menu-danger" onClick={() => onDelete(ep)}>
                        Delete episode
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
