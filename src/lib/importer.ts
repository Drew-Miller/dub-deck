// One-click importer: pick video files and import them straight into the library,
// deriving show / title / episode number from each file's embedded tags (falling
// back to the filename). No manual form, no date.

import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { createEpisode } from "./db";
import { log } from "./log";

const VIDEO_EXTENSIONS = ["mp4", "mkv", "mov", "webm", "avi", "m4v"];

/** Embedded tags returned by the Rust `read_media_tags` command. */
interface MediaTags {
  title: string | null;
  artist: string | null;
  duration: number | null;
  width: number | null;
  height: number | null;
}

/** The raw filename (basename with extension) — kept permanently on the episode. */
function basename(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath;
}

/** basename without extension, separators turned into spaces. */
function filenameTitle(filePath: string): string {
  return basename(filePath).replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
}

/** Pull an episode number out of a title/filename, e.g. "Episode 099" -> 99. */
export function parseEpisodeNumber(text: string): number | null {
  const m =
    text.match(/episode\s*#?\s*0*(\d+)/i) ?? text.match(/\bep\.?\s*#?\s*0*(\d+)/i);
  return m ? Number(m[1]) : null;
}

/** Clean the embedded title: drop the show name and the "Episode NNN" marker
 *  (stored separately), keeping guests + subtitle. */
export function cleanTitle(rawTitle: string, artist: string | null): string {
  const parts = rawTitle
    .split("|")
    .map((p) => p.replace(/^\s*episode\s*#?\s*\d+\s*[:\-|]?\s*/i, "").trim())
    .filter((p) => p.length > 0 && (!artist || p.toLowerCase() !== artist.toLowerCase()));
  return parts.join(" | ").trim() || rawTitle.trim();
}

export interface ImportResult {
  imported: number;
  failed: number;
  shows: string[];
}

/** Open the file picker and import every chosen file automatically.
 *  Returns null if the user cancelled the picker. */
export async function pickAndImport(): Promise<ImportResult | null> {
  const selected = await open({
    multiple: true,
    filters: [{ name: "Video", extensions: VIDEO_EXTENSIONS }],
  });
  if (selected == null) return null;
  const paths = Array.isArray(selected) ? selected : [selected];
  if (!paths.length) return null;

  log.info("import: started", { files: paths.length });

  const shows = new Set<string>();
  let imported = 0;
  let failed = 0;

  for (const path of paths) {
    let tags: MediaTags = { title: null, artist: null, duration: null, width: null, height: null };
    try {
      tags = await invoke<MediaTags>("read_media_tags", { path });
    } catch (e) {
      log.warn("import: read_media_tags failed", { path, error: String(e) });
    }

    const showTitle = (tags.artist && tags.artist.trim()) || "Unknown Show";
    const title = tags.title ? cleanTitle(tags.title, tags.artist) : filenameTitle(path);
    const episode_number = parseEpisodeNumber(tags.title ?? filenameTitle(path));

    try {
      const id = await createEpisode({
        showTitle,
        title,
        episode_number,
        published_date: null, // date intentionally left off
        file_path: path,
        original_filename: basename(path), // always tied to the file
        original_title: tags.title ?? null, // raw embedded title
        video_height: tags.height ?? null,
        duration: tags.duration ?? null,
      });
      imported++;
      shows.add(showTitle);
      log.info("import: episode created", { id, showTitle, title, episode_number });
    } catch (e) {
      failed++;
      log.error("import: createEpisode failed", { path, showTitle, error: String(e) });
    }
  }

  log.info("import: finished", { imported, failed, shows: [...shows] });
  return { imported, failed, shows: [...shows] };
}
