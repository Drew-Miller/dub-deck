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
    file_path: row.file_path,
    duration: row.duration ?? null,
    liked: !!row.liked,
    favorited: !!row.favorited,
    added_at: row.added_at,
  };
}

/** Convert an absolute file path into a URL the <video> element can stream. */
export function mediaSrc(filePath: string): string {
  return convertFileSrc(filePath);
}

// ---------------------------------------------------------------- Shows

export async function listShows(): Promise<Show[]> {
  const db = await getDb();
  return db.select<Show[]>(
    `SELECT s.id, s.title, s.created_at,
            (SELECT COUNT(*) FROM episodes e WHERE e.show_id = s.id) AS episode_count
       FROM shows s
      ORDER BY s.title COLLATE NOCASE ASC`
  );
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
        (show_id, title, description, episode_number, published_date, file_path)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      showId,
      input.title.trim(),
      input.description ?? "",
      input.episode_number ?? null,
      input.published_date ?? null,
      input.file_path,
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
  title_asc: "e.title COLLATE NOCASE ASC",
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
  if (filter.likedOnly) where.push(`e.liked = 1`);
  if (filter.favoritedOnly) where.push(`e.favorited = 1`);

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const orderSql = SORT_SQL[filter.sort ?? "number_asc"];

  const rows = await db.select<any[]>(
    `SELECT e.*, s.title AS show_title
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
    `SELECT e.*, s.title AS show_title
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

export async function toggleLike(id: number): Promise<boolean> {
  const db = await getDb();
  await db.execute(
    `UPDATE episodes
        SET liked = CASE WHEN liked = 1 THEN 0 ELSE 1 END,
            liked_at = CASE WHEN liked = 1 THEN NULL ELSE datetime('now') END
      WHERE id = ?`,
    [id]
  );
  const r = await db.select<{ liked: number }[]>(`SELECT liked FROM episodes WHERE id = ?`, [id]);
  return !!r[0]?.liked;
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
    `SELECT e.*, s.title AS show_title
       FROM episodes e JOIN shows s ON s.id = e.show_id
       ${where}
      ORDER BY RANDOM() LIMIT 1`,
    showIds ?? []
  );
  return rows.length ? normalizeEpisode(rows[0]) : null;
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
    `SELECT e.*, s.title AS show_title
       FROM playlist_items pi
       JOIN episodes e ON e.id = pi.episode_id
       JOIN shows s ON s.id = e.show_id
      WHERE pi.playlist_id = ?
      ORDER BY pi.position ASC`,
    [playlistId]
  );
  return rows.map(normalizeEpisode);
}
