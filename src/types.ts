// Shared domain types for dub-deck. Every feature imports from here.

export interface Show {
  id: number;
  title: string;
  created_at: string;
  /** Populated by listShows(); number of episodes in the show. */
  episode_count?: number;
}

export interface Episode {
  id: number;
  show_id: number;
  /** Joined in by queries for convenience. */
  show_title?: string;
  title: string;
  description: string;
  episode_number: number | null;
  /** ISO 'YYYY-MM-DD' or null if unknown. */
  published_date: string | null;
  /** Absolute path on disk. Referenced in place — never copied. */
  file_path: string;
  /** Seconds; null until first playback records it. */
  duration: number | null;
  liked: boolean;
  favorited: boolean;
  added_at: string;
}

export interface Playlist {
  id: number;
  name: string;
  created_at: string;
  /** Populated by listPlaylists(). */
  item_count?: number;
}

export type EpisodeSort =
  | "number_asc"
  | "number_desc"
  | "date_asc"
  | "date_desc"
  | "added_desc"
  | "title_asc";

export interface EpisodeFilter {
  /** Restrict to these shows. Empty/undefined = all shows. */
  showIds?: number[];
  /** Free-text search across title + description. */
  search?: string;
  /** Calendar year, e.g. 2020. */
  year?: number;
  /** 1-12, only meaningful with `year`. */
  month?: number;
  /** Inclusive episode-number lower bound (e.g. 100 for the 100-200 bucket). */
  episodeMin?: number;
  /** Inclusive episode-number upper bound (e.g. 199). */
  episodeMax?: number;
  likedOnly?: boolean;
  favoritedOnly?: boolean;
  sort?: EpisodeSort;
}

export interface NewEpisodeInput {
  showTitle: string;
  title: string;
  description?: string;
  episode_number?: number | null;
  published_date?: string | null;
  file_path: string;
}
