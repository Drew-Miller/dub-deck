// Drop-in scrape backend — NOT wired on this machine.
//
// This machine ships no scrape backend: the Rust `resolve_scrape` command is gated
// behind the off-by-default `scrape` cargo feature, and nothing calls the function
// below. To enable yt-dlp scraping on a machine that allows it:
//   1. Install yt-dlp on PATH.
//   2. Build the app with the cargo feature:  npm run tauri dev -- --features scrape
//      (or add `scrape` to a default feature set in src-tauri/Cargo.toml).
//   3. Call `enableYtDlpScrape()` once at startup (e.g. in src/main.tsx).
// See docs/handoff.md for the full walkthrough and caveats.

import { invoke } from "@tauri-apps/api/core";
import { registerScrapeResolver } from "./sources";

export function enableYtDlpScrape(): void {
  registerScrapeResolver({
    resolve: async (sourceUrl: string) => {
      const r = await invoke<{ stream_url: string; is_hls: boolean }>("resolve_scrape", {
        url: sourceUrl,
      });
      return { streamUrl: r.stream_url, isHls: r.is_hls };
    },
  });
}
