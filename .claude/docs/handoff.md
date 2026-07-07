# dub-deck — Handoff

Durable, cross-machine handoff notes. This file is **git-tracked**, so it travels to any
machine on `git pull` — it is how work state survives across the Mac and Windows machines
(agent memory under `~/.claude` is per-machine and does NOT sync). Read this + `decisions.md`
at the start of a session to get oriented.

Last updated: 2026-07-07.

---

## Current state — remote streaming sources (shipped)

dub-deck can now play media it does not host. Episodes carry a `source_type`; the app stores
only URLs + metadata and streams from the origin. Built:

- **Data model (migration v3, `src-tauri/src/lib.rs`):** `feeds` table + `source_type`,
  `source_url`, `thumbnail_url`, `feed_id`, `guid` columns on `episodes`.
- **Source abstraction (`src/lib/sources.ts`):** `resolveMedia(ep)` — the one choke point that
  turns an episode into playable media (native `<video>` vs iframe embed) + the scrape seam.
- **Player (`src/features/Player.tsx`):** native `<video>` and iframe embeds share one
  transport; hls.js handles `.m3u8` (WebView2 has no native HLS).
- **Ingest (`src/lib/remoteSources.ts`, `AddSourceDialog`, `FeedsView`):** add a podcast RSS
  feed, a direct `.mp4`/`.m3u8` URL, or a YouTube/Vimeo watch URL. Feeds refresh idempotently.
- **Fetch:** Rust-side via `tauri-plugin-http` (`http:default` scoped `https://**`), bypassing
  webview CORS.

## Manual test checklist (run `npm run tauri dev`)

- [ ] **Local file** (regression): import a file, play — unchanged.
- [ ] **Direct URL:** Add source → Direct URL → a public `.mp4` → plays with full controls.
- [ ] **HLS:** Add source → Direct URL → a public `.m3u8` → plays via hls.js.
- [ ] **RSS feed:** Add source → Podcast feed → a video-podcast feed URL → episodes appear in
      Library under the show; play one; Feeds → Refresh adds no duplicates.
- [ ] **YouTube + Vimeo:** Add source → paste a watch URL → title/thumbnail via oEmbed; the
      embed plays and the app's play/pause/seek/volume + auto-advance work.
- [ ] **Scrape (inert):** no `scrape` UI is surfaced; if a `scrape` episode is created
      programmatically, playback shows "Scrape backend not configured on this machine."

---

## Enabling the yt-dlp scrape backend (other machine only)

The scrape path is fully wired but **inert** here: the Rust command is gated behind an
off-by-default cargo feature and nothing is installed on this machine. To turn it on where it
is permitted (note: scraping YouTube violates its ToS; extracted URLs are IP-locked and
short-lived — use for sources/uses you are authorized for):

1. **Install yt-dlp** on PATH (`winget install yt-dlp.yt-dlp`, `brew install yt-dlp`, or pipx).
2. **Build with the feature:** `npm run tauri dev -- --features scrape`
   (or add `scrape` to a default feature set in `src-tauri/Cargo.toml`). This compiles and
   registers the `resolve_scrape` command (`src-tauri/src/lib.rs`).
3. **Register the frontend resolver** once at startup — in `src/main.tsx`:
   ```ts
   import { enableYtDlpScrape } from "./lib/scrapeBackend";
   enableYtDlpScrape();
   ```
4. **Create scrape episodes** via `addScrapeUrl(url)` in `src/lib/remoteSources.ts` (wire a UI
   mode in `AddSourceDialog` if desired). Playback resolves the stream via `resolve_scrape` and
   plays it in the native `<video>` (hls.js if the extracted URL is HLS).

To undo: drop the `--features scrape` flag; the command is no longer compiled or registered.

---

## Next up / not done

- Folder-scan import (pre-existing backlog item).
- Optional: surface a "scrape" mode in `AddSourceDialog` (kept out of the default build).
- `alternateEnclosure` parsing covers MP4 + HLS; Atom feeds are not parsed (RSS 2.0 only).
