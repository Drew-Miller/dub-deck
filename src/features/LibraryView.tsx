// LibraryView — owns the filter state, queries the database as filters change,
// and renders the filtered episode list. Playback is started through the shared
// player so next/prev walk the currently-visible (filtered) list.

import { useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import type { Show, Episode, EpisodeFilter } from "../types";
import { listShows, listEpisodes, listYears } from "../lib/db";
import { usePlayer, useLibraryVersion, useBumpLibrary } from "../lib/state";
import FilterBar, { type FilterState } from "./FilterBar";
import EditEpisodeDialog from "./EditEpisodeDialog";
import "./LibraryView.css";

const DEFAULT_FILTER: FilterState = {
  showIds: [],
  search: "",
  likedOnly: false,
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
    likedOnly: f.likedOnly || undefined,
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
  const [editing, setEditing] = useState<Episode | null>(null);

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
    filter.likedOnly,
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

  const playEpisode = (ep: Episode) => {
    player.play(ep, queueRef.current);
  };

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
                  {ep.liked && (
                    <span className="flag like" title="Liked">♥</span>
                  )}
                  {ep.favorited && (
                    <span className="flag fav" title="Favorited">★</span>
                  )}
                </div>

                <button
                  className="icon-btn edit-btn"
                  title="Edit metadata"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditing(ep);
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                  </svg>
                </button>

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
