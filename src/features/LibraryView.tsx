// LibraryView — owns the filter state, queries the database as filters change,
// and renders the filtered episode list (via the shared EpisodeRow). Playback is
// started through the shared player so next/prev walk the currently-visible list.

import { useEffect, useMemo, useState } from "react";
import type { JSX } from "react";
import type { Show, Episode, EpisodeFilter, EpisodeSort, SortField, SortDir, Playlist } from "../types";
import { listShows, listEpisodes, listYears, deleteEpisode, listPlaylists, addToPlaylist } from "../lib/db";
import { useTools } from "../lib/downloads";
import { useLibraryVersion, useBumpLibrary } from "../lib/state";
import FilterBar, { type FilterState } from "./FilterBar";
import EpisodeRow from "./EpisodeRow";
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

export default function LibraryView({ onImport }: { onImport?: () => void }): JSX.Element {
  const libraryVersion = useLibraryVersion();
  const bumpLibrary = useBumpLibrary();
  const tools = useTools(libraryVersion);

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

      <div className="episode-list scroll-y">
        {episodes.length === 0 && !loading ? (
          <div className="library-empty">
            <div className="library-empty-title">No episodes match</div>
            <div className="muted">
              Try clearing a filter, or import some episodes to get started.
            </div>
          </div>
        ) : (
          episodes.map((ep) => (
            <EpisodeRow
              key={ep.id}
              episode={ep}
              list={episodes}
              label={contextLabel}
              tools={tools}
              selectMode={selectMode}
              selected={selected.has(ep.id)}
              onToggleSelect={toggleSelect}
            />
          ))
        )}
      </div>
    </div>
  );
}
