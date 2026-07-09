// Optional local caching of remote episodes. Streaming stays the default; a
// download saves the media into an app-data `downloads/` folder and flips the
// episode to play locally. HLS needs a user-configured ffmpeg; YouTube/Vimeo need
// a user-configured yt-dlp (both set in Settings). MP4/direct downloads are native.

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { appDataDir, join } from "@tauri-apps/api/path";
import { getSetting, setDownloadPath } from "./db";
import { isHlsUrl } from "./sources";
import type { Episode } from "../types";

/** Settings keys for the opt-in external tools. */
export const SETTING_KEYS = {
  ytdlp: "tool.ytdlp",
  ffmpeg: "tool.ffmpeg",
} as const;

export interface Tools {
  ytdlp: boolean;
  ffmpeg: boolean;
}

export type DownloadState =
  | "downloaded"
  | "available"
  | "needs-ytdlp"
  | "needs-ffmpeg"
  | "none";

/** Read whether each external tool is configured (a non-empty path is set). */
export async function loadTools(): Promise<Tools> {
  const [y, f] = await Promise.all([
    getSetting(SETTING_KEYS.ytdlp),
    getSetting(SETTING_KEYS.ffmpeg),
  ]);
  return { ytdlp: !!y?.trim(), ffmpeg: !!f?.trim() };
}

/** React hook: load the configured tools, re-reading when `version` changes
 *  (pass the library-refresh version so newly-set Settings paths take effect). */
export function useTools(version?: number): Tools {
  const [tools, setTools] = useState<Tools>({ ytdlp: false, ffmpeg: false });
  useEffect(() => {
    let cancelled = false;
    loadTools()
      .then((t) => { if (!cancelled) setTools(t); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [version]);
  return tools;
}

/** Compute the download control state for an episode given the configured tools. */
export function downloadState(ep: Episode, tools: Tools): DownloadState {
  if (ep.download_path) return "downloaded";
  if (ep.source_type === "file") return "none";
  if (ep.source_type === "direct_url" || ep.source_type === "rss") {
    if (isHlsUrl(ep.source_url ?? "")) return tools.ffmpeg ? "available" : "needs-ffmpeg";
    return "available";
  }
  // youtube / vimeo / scrape
  return tools.ytdlp ? "available" : "needs-ytdlp";
}

function extFromUrl(url: string): string | null {
  try {
    const m = new URL(url).pathname.match(/\.([a-z0-9]{2,5})$/i);
    return m ? m[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Download an episode's media locally and mark it downloaded. Returns the path. */
export async function downloadEpisode(ep: Episode): Promise<string> {
  const url = ep.source_url ?? "";
  const dir = await join(await appDataDir(), "downloads");

  let dest: string;
  if (ep.source_type === "direct_url" || ep.source_type === "rss") {
    if (isHlsUrl(url)) {
      const ffmpeg = (await getSetting(SETTING_KEYS.ffmpeg)) ?? "";
      dest = await join(dir, `${ep.id}.mp4`);
      await invoke("download_hls", { url, dest, ffmpeg });
    } else {
      const ext = extFromUrl(url) ?? "mp4";
      dest = await join(dir, `${ep.id}.${ext}`);
      await invoke("download_media", { url, dest });
    }
  } else if (ep.source_type === "youtube" || ep.source_type === "vimeo" || ep.source_type === "scrape") {
    const ytdlp = (await getSetting(SETTING_KEYS.ytdlp)) ?? "";
    dest = await join(dir, `${ep.id}.mp4`);
    await invoke("download_scrape", { url, dest, ytdlp });
  } else {
    throw new Error("This source can't be downloaded.");
  }

  await setDownloadPath(ep.id, dest);
  return dest;
}

/** Delete a downloaded file and revert the episode to streaming. */
export async function removeDownload(ep: Episode): Promise<void> {
  if (ep.download_path) {
    await invoke("remove_file", { path: ep.download_path });
  }
  await setDownloadPath(ep.id, null);
}
