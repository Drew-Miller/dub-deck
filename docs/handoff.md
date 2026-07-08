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

## Tools & downloads (runtime, opt-in via Settings)

External tools are now enabled at **runtime in Settings › Tools** (no cargo feature). dub-deck
installs nothing — you point it at binaries you've installed. Nothing runs until a path is set.

- **yt-dlp** — enables YouTube/Vimeo **download** and scrape-**playback** of `scrape` sources.
  Note: scraping YouTube violates its ToS; extracted URLs are IP-locked/short-lived — use only
  where authorized.
- **ffmpeg** — enables downloading **HLS** (`.m3u8`) streams to a single file.

Setup on any machine: install the binary (`winget install yt-dlp.yt-dlp` / `...ffmpeg`,
`brew install yt-dlp ffmpeg`, etc.), open **Settings › Tools**, paste the path, hit **Test**
(shows "detected"). Downloads/scrape for the matching sources then light up; otherwise the UI
says "enable in Settings".

**How it's wired:** paths persist in the `settings` table (`getSetting`/`setSetting` in
`db.ts`). The Rust commands `resolve_scrape` / `download_scrape` (yt-dlp) and `download_hls`
(ffmpeg) receive the path as an argument (`src-tauri/src/lib.rs`) — always compiled, inert when
the path is empty. MP4 downloads use `download_media` (reqwest, no external tool). Downloaded
files live in `<app-data>/downloads/` and `resolveMedia` plays them locally when present.

---

## Next up / not done

- Folder-scan import (pre-existing backlog item).
- Download **progress** is not reported yet (button shows busy, then done/failed).
- `alternateEnclosure` parsing covers MP4 + HLS; Atom feeds are not parsed (RSS 2.0 only).
- Player download button reflects `current.download_path` at play time; downloading the
  currently-playing episode switches it to local on the next play, not mid-playback.
