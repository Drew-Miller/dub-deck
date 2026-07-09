// Shared domain types for dub-deck. Every feature imports from here.

export interface Show {
  id: number;
  title: string;
  created_at: string;
  /** Optional show artwork URL (may be null; seeded from feeds/episodes). */
  image_url: string | null;
  /** Whether the show is favorited (0/1 from SQLite). */
  favorited: boolean;
  /** Populated by listShows(); number of episodes in the show. */
  episode_count?: number;
}

/** Where an episode's media comes from. `file` = local absolute path (default);
 *  the rest are remote and use `source_url` instead. `scrape` resolves a stream
 *  URL at play time via a pluggable resolver (yt-dlp on machines that enable it). */
export type SourceType =
  | "file"
  | "direct_url"
  | "rss"
  | "youtube"
  | "vimeo"
  | "scrape";

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
  /** Where the media comes from. Every playback/UI decision keys off this. */
  source_type: SourceType;
  /** Remote media/watch URL for non-`file` sources (null for local files). */
  source_url: string | null;
  /** Poster/thumbnail URL when known (feeds, oEmbed). */
  thumbnail_url: string | null;
  /** Owning subscription for `rss` episodes; null otherwise. */
  feed_id: number | null;
  /** Stable per-feed identifier used to dedupe on refresh. */
  guid: string | null;
  /** Absolute path on disk for `file` sources; '' for remote. Referenced, never copied. */
  file_path: string;
  /** Original filename (basename) — always tied to the file, even when other fields are derived. */
  original_filename: string | null;
  /** Raw embedded title before any cleanup. */
  original_title: string | null;
  /** Video height in px (for a quality badge, e.g. 360 -> "360p"). */
  video_height: number | null;
  /** Seconds; filled at import from tags and/or on first playback. */
  duration: number | null;
  favorited: boolean;
  added_at: string;
  /** Joined from the owning show's artwork (null if none). */
  show_image: string | null;
  /** Local path of a downloaded copy (null = stream from source). */
  download_path: string | null;
  /** Resume position in seconds (null = not started). */
  position: number | null;
  /** ISO timestamp of the last time this was played (null = never). */
  played_at: string | null;
  /** Watched to (near) the end. */
  finished: boolean;
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
  | "added_asc"
  | "title_asc"
  | "title_desc";

/** UI sort field (paired with a direction) that maps to an EpisodeSort. */
export type SortField = "number" | "date" | "added" | "title";
export type SortDir = "asc" | "desc";

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
  favoritedOnly?: boolean;
  sort?: EpisodeSort;
}

export interface NewEpisodeInput {
  showTitle: string;
  title: string;
  description?: string;
  episode_number?: number | null;
  published_date?: string | null;
  /** Defaults to 'file'. */
  source_type?: SourceType;
  source_url?: string | null;
  thumbnail_url?: string | null;
  feed_id?: number | null;
  guid?: string | null;
  /** Absolute path for `file` sources; omit/empty for remote. */
  file_path?: string;
  original_filename?: string | null;
  original_title?: string | null;
  video_height?: number | null;
  duration?: number | null;
}

/** A subscribed remote feed (podcast RSS / Podcasting 2.0). */
export interface Feed {
  id: number;
  show_id: number | null;
  feed_url: string;
  title: string | null;
  site_url: string | null;
  thumbnail_url: string | null;
  last_refreshed_at: string | null;
  created_at: string;
  /** Populated by listFeeds(): number of episodes pulled from this feed. */
  episode_count?: number;
}
