// Runtime scrape backend. Registered at startup; it reads the user-configured
// yt-dlp path from Settings each call and resolves a playable stream URL via the
// Rust `resolve_scrape` command. If yt-dlp isn't configured, the command errors
// clearly ("Enable yt-dlp in Settings") — nothing is installed by dub-deck.

import { invoke } from "@tauri-apps/api/core";
import { registerScrapeResolver } from "./sources";
import { loadToolPath } from "./downloads";

export function enableYtDlpScrape(): void {
  registerScrapeResolver({
    resolve: async (sourceUrl: string) => {
      const ytdlp = await loadToolPath("ytdlp");
      const r = await invoke<{ stream_url: string; is_hls: boolean }>("resolve_scrape", {
        url: sourceUrl,
        ytdlp,
      });
      return { streamUrl: r.stream_url, isHls: r.is_hls };
    },
  });
}
