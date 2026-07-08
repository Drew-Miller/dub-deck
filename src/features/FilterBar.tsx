// FilterBar — a fully controlled filter UI for the episode library.
// All state lives in the parent; this component only renders `value`
// and reports edits through `onChange`.

import type { JSX } from "react";
import type { Show, EpisodeSort } from "../types";

export interface FilterState {
  showIds: number[];
  search: string;
  year?: number;
  month?: number;
  /** Inclusive-looking [min, max] bucket label range, e.g. [100, 200]. */
  episodeBucket?: [number, number];
  favoritedOnly: boolean;
  sort: EpisodeSort;
}

interface FilterBarProps {
  shows: Show[];
  years: number[];
  maxEpisodeNumber: number;
  value: FilterState;
  onChange: (next: FilterState) => void;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

const SORT_OPTIONS: { value: EpisodeSort; label: string }[] = [
  { value: "number_asc", label: "Episode ↑" },
  { value: "number_desc", label: "Episode ↓" },
  { value: "date_asc", label: "Date ↑" },
  { value: "date_desc", label: "Date ↓" },
  { value: "added_desc", label: "Recently added" },
  { value: "title_asc", label: "Title A–Z" },
];

/** Build episode-number buckets [1,100],[100,200],... covering `max`. */
function makeBuckets(max: number): [number, number][] {
  const buckets: [number, number][] = [];
  if (max <= 0) return buckets;
  buckets.push([1, 100]);
  let lower = 100;
  while (lower < max) {
    buckets.push([lower, lower + 100]);
    lower += 100;
  }
  return buckets;
}

export default function FilterBar({
  shows,
  years,
  maxEpisodeNumber,
  value,
  onChange,
}: FilterBarProps): JSX.Element {
  const set = (patch: Partial<FilterState>) => onChange({ ...value, ...patch });

  const toggleShow = (id: number) => {
    const has = value.showIds.includes(id);
    const next = has
      ? value.showIds.filter((s) => s !== id)
      : [...value.showIds, id];
    set({ showIds: next });
  };

  const selectYear = (year: number) => {
    if (value.year === year) {
      set({ year: undefined, month: undefined });
    } else {
      set({ year, month: undefined });
    }
  };

  const selectMonth = (month: number) => {
    set({ month: value.month === month ? undefined : month });
  };

  const selectBucket = (bucket: [number, number]) => {
    const same =
      value.episodeBucket &&
      value.episodeBucket[0] === bucket[0] &&
      value.episodeBucket[1] === bucket[1];
    set({ episodeBucket: same ? undefined : bucket });
  };

  const buckets = makeBuckets(maxEpisodeNumber);

  return (
    <div className="filterbar">
      {/* Search + sort (top) */}
      <div className="filter-group filter-top">
        <div className="filter-search-wrap grow">
          <svg className="filter-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" strokeLinecap="round" />
          </svg>
          <input
            className="filter-search"
            type="search"
            placeholder="Search title or description…"
            value={value.search}
            onChange={(e) => set({ search: e.target.value })}
          />
        </div>
        <label className="row sort-select">
          <span className="filter-label">Sort</span>
          <select
            value={value.sort}
            onChange={(e) => set({ sort: e.target.value as EpisodeSort })}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Shows */}
      <div className="filter-group">
        <span className="filter-label">Shows</span>
        <div className="row wrap chip-scroll">
          <button
            className={`chip${value.showIds.length === 0 ? " active" : ""}`}
            onClick={() => set({ showIds: [] })}
          >
            All
          </button>
          {shows.map((s) => (
            <button
              key={s.id}
              className={`chip${value.showIds.includes(s.id) ? " active" : ""}`}
              onClick={() => toggleShow(s.id)}
              title={s.title}
            >
              {s.title}
              {typeof s.episode_count === "number" ? (
                <span className="chip-count"> {s.episode_count}</span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      {/* Years */}
      {years.length > 0 && (
        <div className="filter-group">
          <span className="filter-label">Year</span>
          <div className="row wrap chip-scroll">
            {years.map((y) => (
              <button
                key={y}
                className={`chip${value.year === y ? " active" : ""}`}
                onClick={() => selectYear(y)}
              >
                {y}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Months — only when a year is chosen */}
      {value.year != null && (
        <div className="filter-group">
          <span className="filter-label">Month</span>
          <div className="row wrap chip-scroll">
            {MONTHS.map((name, i) => {
              const month = i + 1;
              return (
                <button
                  key={month}
                  className={`chip${value.month === month ? " active" : ""}`}
                  onClick={() => selectMonth(month)}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Episode-number buckets */}
      {buckets.length > 0 && (
        <div className="filter-group">
          <span className="filter-label">Episodes</span>
          <div className="row wrap chip-scroll">
            {buckets.map(([min, max]) => {
              const active =
                value.episodeBucket &&
                value.episodeBucket[0] === min &&
                value.episodeBucket[1] === max;
              return (
                <button
                  key={`${min}-${max}`}
                  className={`chip${active ? " active" : ""}`}
                  onClick={() => selectBucket([min, max])}
                >
                  {min}–{max}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Favorites toggle */}
      <div className="filter-group">
        <div className="row wrap">
          <button
            className={`chip${value.favoritedOnly ? " active" : ""}`}
            onClick={() => set({ favoritedOnly: !value.favoritedOnly })}
          >
            {"♥"} Favorites
          </button>
        </div>
      </div>
    </div>
  );
}
