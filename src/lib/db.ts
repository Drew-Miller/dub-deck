// Typed data-access layer for dub-deck. This is the single contract every
// feature component uses — no component should talk to the SQL plugin directly.

import Database from "@tauri-apps/plugin-sql";
import { convertFileSrc } from "@tauri-apps/api/core";
import type {
  Show,
  Episode,
  Playlist,
  EpisodeFilter,
  EpisodeSort,
  NewEpisodeInput,
  Feed,
} from "../types";

let _db: Database | null = null;

/** Lazily open (and migrate) the SQLite database. */
export async function getDb(): Promise<Database> {
  if (!_db) {
    _db = await Database.load("sqlite:dubdeck.db");
  }
  return _db;
}

// SQLite stores booleans as 0/1; normalize rows coming back out.
function normalizeEpisode(row: any): Episode {
  return {
    id: row.id,
    show_id: row.show_id,
    show_title: row.show_title,
    title: row.title,
    description: row.description ?? "",
    episode_number: row.episode_number ?? null,
    published_date: row.published_date ?? null,
    source_type: row.source_type ?? "file",
    source_url: row.source_url ?? null,
    thumbnail_url: row.thumbnail_url ?? null,
    feed_id: row.feed_id ?? null,
    guid: row.guid ?? null,
    file_path: row.file_path ?? "",
    original_filename: row.original_filename ?? null,
    original_title: row.original_title ?? null,
    video_height: row.video_height ?? null,
    duration: row.duration ?? null,
    favorited: !!row.favorited,
    added_at: row.added_at,
    show_image: row.show_image ?? null,
    download_path: row.download_path ?? null,
    position: row.position ?? null,
    played_at: row.played_at ?? null,
    finished: !!row.finished,
  };
}

/** Convert an absolute file path into a URL the <video> element can stream. */
export function mediaSrc(filePath: string): string {
  return convertFileSrc(filePath);
}

// ---------------------------------------------------------------- Shows

function normalizeShow(r: any): Show {
  return {
    id: r.id,
    title: r.title,
    created_at: r.created_at,
    image_url: r.image_url ?? null,
    favorited: !!r.favorited,
    episode_count: r.episode_count,
  };
}

export async function listShows(): Promise<Show[]> {
  const db = await getDb();
  const rows = await db.select<any[]>(
    `SELECT s.id, s.title, s.created_at, s.image_url, s.favorited,
            (SELECT COUNT(*) FROM episodes e WHERE e.show_id = s.id) AS episode_count
       FROM shows s
      ORDER BY s.title COLLATE NOCASE ASC`
  );
  return rows.map(normalizeShow);
}

export async function toggleShowFavorite(id: number): Promise<boolean> {
  const db = await getDb();
  await db.execute(
    `UPDATE shows SET favorited = CASE WHEN favorited = 1 THEN 0 ELSE 1 END WHERE id = ?`,
    [id]
  );
  const r = await db.select<{ favorited: number }[]>(`SELECT favorited FROM shows WHERE id = ?`, [id]);
  return !!r[0]?.favorited;
}

export async function updateShow(
  id: number,
  fields: { title?: string; image_url?: string | null }
): Promise<void> {
  const db = await getDb();
  const sets: string[] = [];
  const params: any[] = [];
  if (fields.title !== undefined) {
    sets.push("title = ?");
    params.push(fields.title.trim());
  }
  if (fields.image_url !== undefined) {
    sets.push("image_url = ?");
    params.push(fields.image_url);
  }
  if (!sets.length) return;
  params.push(id);
  await db.execute(`UPDATE shows SET ${sets.join(", ")} WHERE id = ?`, params);
}

/** Shows ordered by most-recently-updated (newest episode first) — for the Shows grid. */
export async function listShowsRecent(): Promise<Show[]> {
  const db = await getDb();
  const rows = await db.select<any[]>(
    `SELECT s.id, s.title, s.created_at, s.image_url, s.favorited,
            (SELECT COUNT(*) FROM episodes e WHERE e.show_id = s.id) AS episode_count
       FROM shows s
      ORDER BY (SELECT MAX(e.added_at) FROM episodes e WHERE e.show_id = s.id) DESC NULLS LAST,
               s.title COLLATE NOCASE ASC`
  );
  return rows.map(normalizeShow);
}

/** Find a show by title (case-insensitive) or create it; returns its id. */
export async function getOrCreateShow(title: string): Promise<number> {
  const db = await getDb();
  const clean = title.trim();
  const existing = await db.select<{ id: number }[]>(
    `SELECT id FROM shows WHERE title = ? COLLATE NOCASE LIMIT 1`,
    [clean]
  );
  if (existing.length) return existing[0].id;
  const res = await db.execute(`INSERT INTO shows (title) VALUES (?)`, [clean]);
  return res.lastInsertId as number;
}

export async function deleteShow(id: number): Promise<void> {
  const db = await getDb();
  await db.execute(`DELETE FROM shows WHERE id = ?`, [id]);
}

// ------------------------------------------------------------- Episodes

export async function createEpisode(input: NewEpisodeInput): Promise<number> {
  const db = await getDb();
  const showId = await getOrCreateShow(input.showTitle);
  const res = await db.execute(
    `INSERT INTO episodes
        (show_id, title, description, episode_number, published_date,
         source_type, source_url, thumbnail_url, feed_id, guid, file_path,
         original_filename, original_title, video_height, duration)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      showId,
      input.title.trim(),
      input.description ?? "",
      input.episode_number ?? null,
      input.published_date ?? null,
      input.source_type ?? "file",
      input.source_url ?? null,
      input.thumbnail_url ?? null,
      input.feed_id ?? null,
      input.guid ?? null,
      input.file_path ?? "",
      input.original_filename ?? null,
      input.original_title ?? null,
      input.video_height ?? null,
      input.duration ?? null,
    ]
  );
  return res.lastInsertId as number;
}

const SORT_SQL: Record<EpisodeSort, string> = {
  // Order by episode number; episodes without a number fall to the end, sorted alphabetically.
  number_asc: "e.episode_number ASC NULLS LAST, e.title COLLATE NOCASE ASC",
  number_desc: "e.episode_number DESC NULLS LAST, e.title COLLATE NOCASE ASC",
  date_asc: "e.published_date ASC NULLS LAST",
  date_desc: "e.published_date DESC NULLS LAST",
  added_desc: "e.added_at DESC",
  added_asc: "e.added_at ASC",
  title_asc: "e.title COLLATE NOCASE ASC",
  title_desc: "e.title COLLATE NOCASE DESC",
};

export async function listEpisodes(filter: EpisodeFilter = {}): Promise<Episode[]> {
  const db = await getDb();
  const where: string[] = [];
  const params: any[] = [];

  if (filter.showIds && filter.showIds.length) {
    where.push(`e.show_id IN (${filter.showIds.map(() => "?").join(",")})`);
    params.push(...filter.showIds);
  }
  if (filter.search && filter.search.trim()) {
    where.push(`(e.title LIKE ? OR e.description LIKE ?)`);
    const like = `%${filter.search.trim()}%`;
    params.push(like, like);
  }
  if (filter.year != null) {
    if (filter.month != null) {
      const mm = String(filter.month).padStart(2, "0");
      where.push(`substr(e.published_date, 1, 7) = ?`);
      params.push(`${filter.year}-${mm}`);
    } else {
      where.push(`substr(e.published_date, 1, 4) = ?`);
      params.push(String(filter.year));
    }
  }
  if (filter.episodeMin != null) {
    where.push(`e.episode_number >= ?`);
    params.push(filter.episodeMin);
  }
  if (filter.episodeMax != null) {
    where.push(`e.episode_number <= ?`);
    params.push(filter.episodeMax);
  }
  if (filter.favoritedOnly) where.push(`e.favorited = 1`);

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const orderSql = SORT_SQL[filter.sort ?? "number_asc"];

  const rows = await db.select<any[]>(
    `SELECT e.*, s.title AS show_title, s.image_url AS show_image
       FROM episodes e
       JOIN shows s ON s.id = e.show_id
       ${whereSql}
      ORDER BY ${orderSql}`,
    params
  );
  return rows.map(normalizeEpisode);
}

export async function getEpisode(id: number): Promise<Episode | null> {
  const db = await getDb();
  const rows = await db.select<any[]>(
    `SELECT e.*, s.title AS show_title, s.image_url AS show_image
       FROM episodes e JOIN shows s ON s.id = e.show_id
      WHERE e.id = ?`,
    [id]
  );
  return rows.length ? normalizeEpisode(rows[0]) : null;
}

export async function updateEpisode(
  id: number,
  fields: Partial<Pick<Episode, "title" | "description" | "episode_number" | "published_date">>
): Promise<void> {
  const db = await getDb();
  const sets: string[] = [];
  const params: any[] = [];
  for (const [k, v] of Object.entries(fields)) {
    sets.push(`${k} = ?`);
    params.push(v);
  }
  if (!sets.length) return;
  params.push(id);
  await db.execute(`UPDATE episodes SET ${sets.join(", ")} WHERE id = ?`, params);
}

/** Move an episode to a different show (creating the show if needed), then
 *  prune any show left with zero episodes. */
export async function setEpisodeShow(episodeId: number, showTitle: string): Promise<void> {
  const db = await getDb();
  const showId = await getOrCreateShow(showTitle);
  await db.execute(`UPDATE episodes SET show_id = ? WHERE id = ?`, [showId, episodeId]);
  // Clean up shows that no longer have any episodes.
  await db.execute(`DELETE FROM shows WHERE id NOT IN (SELECT DISTINCT show_id FROM episodes)`);
}

export async function setDuration(id: number, seconds: number): Promise<void> {
  const db = await getDb();
  await db.execute(`UPDATE episodes SET duration = ? WHERE id = ? AND duration IS NULL`, [
    seconds,
    id,
  ]);
}

export async function deleteEpisode(id: number): Promise<void> {
  const db = await getDb();
  await db.execute(`DELETE FROM episodes WHERE id = ?`, [id]);
}

export async function toggleFavorite(id: number): Promise<boolean> {
  const db = await getDb();
  await db.execute(
    `UPDATE episodes
        SET favorited = CASE WHEN favorited = 1 THEN 0 ELSE 1 END,
            favorited_at = CASE WHEN favorited = 1 THEN NULL ELSE datetime('now') END
      WHERE id = ?`,
    [id]
  );
  const r = await db.select<{ favorited: number }[]>(
    `SELECT favorited FROM episodes WHERE id = ?`,
    [id]
  );
  return !!r[0]?.favorited;
}

/** Distinct years present in the library (descending) — for the year filter. */
export async function listYears(showIds?: number[]): Promise<number[]> {
  const db = await getDb();
  const where = showIds && showIds.length
    ? `AND show_id IN (${showIds.map(() => "?").join(",")})`
    : "";
  const rows = await db.select<{ y: string }[]>(
    `SELECT DISTINCT substr(published_date, 1, 4) AS y
       FROM episodes
      WHERE published_date IS NOT NULL ${where}
      ORDER BY y DESC`,
    showIds ?? []
  );
  return rows.map((r) => Number(r.y)).filter((n) => !Number.isNaN(n));
}

/** Pick one random episode from the given shows (or all shows). */
export async function randomEpisode(showIds?: number[]): Promise<Episode | null> {
  const db = await getDb();
  const where = showIds && showIds.length
    ? `WHERE e.show_id IN (${showIds.map(() => "?").join(",")})`
    : "";
  const rows = await db.select<any[]>(
    `SELECT e.*, s.title AS show_title, s.image_url AS show_image
       FROM episodes e JOIN shows s ON s.id = e.show_id
       ${where}
      ORDER BY RANDOM() LIMIT 1`,
    showIds ?? []
  );
  return rows.length ? normalizeEpisode(rows[0]) : null;
}

// ---------------------------------------------------------------- Feeds

export async function listFeeds(): Promise<Feed[]> {
  const db = await getDb();
  return db.select<Feed[]>(
    `SELECT f.*,
            (SELECT COUNT(*) FROM episodes e WHERE e.feed_id = f.id) AS episode_count
       FROM feeds f
      ORDER BY f.title COLLATE NOCASE ASC, f.created_at DESC`
  );
}

export async function getFeed(id: number): Promise<Feed | null> {
  const db = await getDb();
  const rows = await db.select<Feed[]>(`SELECT * FROM feeds WHERE id = ?`, [id]);
  return rows.length ? rows[0] : null;
}

/** Find a feed by URL or create it; fills/refreshes known metadata. Returns its id. */
export async function getOrCreateFeed(
  feedUrl: string,
  meta: {
    title?: string | null;
    site_url?: string | null;
    thumbnail_url?: string | null;
    show_id?: number | null;
  } = {}
): Promise<number> {
  const db = await getDb();
  const url = feedUrl.trim();
  const existing = await db.select<{ id: number }[]>(
    `SELECT id FROM feeds WHERE feed_url = ? LIMIT 1`,
    [url]
  );
  if (existing.length) {
    await db.execute(
      `UPDATE feeds
          SET title         = COALESCE(?, title),
              site_url      = COALESCE(?, site_url),
              thumbnail_url = COALESCE(?, thumbnail_url),
              show_id       = COALESCE(?, show_id)
        WHERE id = ?`,
      [meta.title ?? null, meta.site_url ?? null, meta.thumbnail_url ?? null, meta.show_id ?? null, existing[0].id]
    );
    return existing[0].id;
  }
  const res = await db.execute(
    `INSERT INTO feeds (feed_url, title, site_url, thumbnail_url, show_id) VALUES (?, ?, ?, ?, ?)`,
    [url, meta.title ?? null, meta.site_url ?? null, meta.thumbnail_url ?? null, meta.show_id ?? null]
  );
  return res.lastInsertId as number;
}

export async function touchFeed(id: number): Promise<void> {
  const db = await getDb();
  await db.execute(`UPDATE feeds SET last_refreshed_at = datetime('now') WHERE id = ?`, [id]);
}

/** True if an episode with this (feed, guid) already exists — used to dedupe refreshes. */
export async function feedEpisodeExists(feedId: number, guid: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db.select<{ id: number }[]>(
    `SELECT id FROM episodes WHERE feed_id = ? AND guid = ? LIMIT 1`,
    [feedId, guid]
  );
  return rows.length > 0;
}

/** Unsubscribe: remove the feed (and by default its episodes), then prune empty shows. */
export async function deleteFeed(id: number, removeEpisodes = true): Promise<void> {
  const db = await getDb();
  if (removeEpisodes) {
    await db.execute(`DELETE FROM episodes WHERE feed_id = ?`, [id]);
  }
  await db.execute(`DELETE FROM feeds WHERE id = ?`, [id]);
  await db.execute(`DELETE FROM shows WHERE id NOT IN (SELECT DISTINCT show_id FROM episodes)`);
}

/** Mark an episode as played now (bumps it to the top of Recently Listened). */
export async function markPlayed(id: number): Promise<void> {
  const db = await getDb();
  await db.execute(`UPDATE episodes SET played_at = datetime('now') WHERE id = ?`, [id]);
}

/** Persist resume position (seconds) + finished flag; refreshes last-played. */
export async function savePosition(id: number, seconds: number, finished: boolean): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE episodes SET position = ?, finished = ?, played_at = datetime('now') WHERE id = ?`,
    [seconds, finished ? 1 : 0, id]
  );
}

/** Episodes played before, most recent first — for the Recently Listened view. */
export async function listRecentlyPlayed(limit = 100): Promise<Episode[]> {
  const db = await getDb();
  const rows = await db.select<any[]>(
    `SELECT e.*, s.title AS show_title, s.image_url AS show_image
       FROM episodes e JOIN shows s ON s.id = e.show_id
      WHERE e.played_at IS NOT NULL
      ORDER BY e.played_at DESC
      LIMIT ?`,
    [limit]
  );
  return rows.map(normalizeEpisode);
}

/** Set (or clear, with null) the local downloaded-file path for an episode. */
export async function setDownloadPath(id: number, path: string | null): Promise<void> {
  const db = await getDb();
  await db.execute(`UPDATE episodes SET download_path = ? WHERE id = ?`, [path, id]);
}

/** Set an episode's thumbnail (a local path, remote URL, or null to clear). */
export async function setThumbnail(id: number, url: string | null): Promise<void> {
  const db = await getDb();
  await db.execute(`UPDATE episodes SET thumbnail_url = ? WHERE id = ?`, [url, id]);
}

/** Set a show's artwork image (a local path, remote URL, or null to clear). */
export async function setShowImage(id: number, url: string | null): Promise<void> {
  const db = await getDb();
  await db.execute(`UPDATE shows SET image_url = ? WHERE id = ?`, [url, id]);
}

// --------------------------------------------------------------- Settings

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<{ value: string }[]>(
    `SELECT value FROM settings WHERE key = ?`,
    [key]
  );
  return rows.length ? rows[0].value : null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]
  );
}

/** N random episodes (optionally within shows) — powers the Up Next shuffle. */
export async function listRandomEpisodes(limit: number, showIds?: number[]): Promise<Episode[]> {
  const db = await getDb();
  const where =
    showIds && showIds.length
      ? `WHERE e.show_id IN (${showIds.map(() => "?").join(",")})`
      : "";
  const rows = await db.select<any[]>(
    `SELECT e.*, s.title AS show_title, s.image_url AS show_image
       FROM episodes e JOIN shows s ON s.id = e.show_id
       ${where}
      ORDER BY RANDOM() LIMIT ?`,
    [...(showIds ?? []), limit]
  );
  return rows.map(normalizeEpisode);
}

// ------------------------------------------------------------ Playlists

export async function listPlaylists(): Promise<Playlist[]> {
  const db = await getDb();
  return db.select<Playlist[]>(
    `SELECT p.id, p.name, p.created_at,
            (SELECT COUNT(*) FROM playlist_items pi WHERE pi.playlist_id = p.id) AS item_count
       FROM playlists p
      ORDER BY p.created_at DESC`
  );
}

export async function createPlaylist(name: string): Promise<number> {
  const db = await getDb();
  const res = await db.execute(`INSERT INTO playlists (name) VALUES (?)`, [name.trim()]);
  return res.lastInsertId as number;
}

export async function deletePlaylist(id: number): Promise<void> {
  const db = await getDb();
  await db.execute(`DELETE FROM playlists WHERE id = ?`, [id]);
}

export async function addToPlaylist(playlistId: number, episodeId: number): Promise<void> {
  const db = await getDb();
  const pos = await db.select<{ n: number }[]>(
    `SELECT COALESCE(MAX(position), -1) + 1 AS n FROM playlist_items WHERE playlist_id = ?`,
    [playlistId]
  );
  await db.execute(
    `INSERT OR IGNORE INTO playlist_items (playlist_id, episode_id, position) VALUES (?, ?, ?)`,
    [playlistId, episodeId, pos[0]?.n ?? 0]
  );
}

export async function removeFromPlaylist(playlistId: number, episodeId: number): Promise<void> {
  const db = await getDb();
  await db.execute(`DELETE FROM playlist_items WHERE playlist_id = ? AND episode_id = ?`, [
    playlistId,
    episodeId,
  ]);
}

export async function listPlaylistEpisodes(playlistId: number): Promise<Episode[]> {
  const db = await getDb();
  const rows = await db.select<any[]>(
    `SELECT e.*, s.title AS show_title, s.image_url AS show_image
       FROM playlist_items pi
       JOIN episodes e ON e.id = pi.episode_id
       JOIN shows s ON s.id = e.show_id
      WHERE pi.playlist_id = ?
      ORDER BY pi.position ASC`,
    [playlistId]
  );
  return rows.map(normalizeEpisode);
}
