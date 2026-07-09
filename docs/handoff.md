# dub-deck — Handoff

Durable, cross-machine handoff notes. This file is **git-tracked**, so it travels to any
machine on `git pull` — it is how work state survives across the Mac and Windows machines
(agent memory under `~/.claude` is per-machine and does NOT sync). Read this + `decisions.md`
at the start of a session to get oriented.

Last updated: 2026-07-08.

---

## Current state — favorites/queue/player/UX overhaul (shipped)

The large A–K overhaul (see `decisions.md` › "Favorites / queue / player / downloads overhaul"
and "UI / chrome polish") is in. Highlights now live in the app:

- **Favorites-only** (likes dropped, migration v4). Single heart across player + mini bar.
- **Queue engine** (`state.tsx`): context (the ordered list you played from) + manual queue
  (Play next / Add to queue); auto-shuffles the library at the end.
- **Full player**: centered transport (skip ±10 / squircle play), ✕ collapses to mini bar,
  auto-hide ~1.5s (stays while paused, cursor hides), stage fullscreen, right-side **Up Next**.
- **Progress/resume** (migration v6): rows show progress + finished ✓; playback resumes.
- **Thumbnails** everywhere (rows + Shows grid) with paste-image/URL covers.
- **Editable, collapsible sidebar** (show/hide/reorder/pin, `Ctrl/Cmd+B`), pointer-drag reorder.
- **Theme picker** (Dead Terminal + 10 VS Code skins), applied instantly via `applyTheme()`.
- **Single Import screen**; **Settings** (tools/sources/downloads/theme); Feeds folded into
  Settings › Sources.
- **Downloads** (migration v5): opt-in local cache; MP4 native, HLS via ffmpeg, YT/Vimeo via
  yt-dlp (Settings-gated). See "Tools & downloads" below.
- **YouTube/Vimeo native chrome suppressed** via a transparent event-eating cover; only our
  controls show.

## Current state — remote streaming sources (shipped earlier)

dub-deck can now play media it does not host. Episodes carry a `source_type`; the app stores
only URLs + metadata and streams from the origin. Built:

- **Data model (migration v3, `src-tauri/src/lib.rs`):** `feeds` table + `source_type`,
  `source_url`, `thumbnail_url`, `feed_id`, `guid` columns on `episodes`.
- **Source abstraction (`src/lib/sources.ts`):** `resolveMedia(ep)` — the one choke point that
  turns an episode into playable media (native `<video>` vs iframe embed) + the scrape seam.
- **Player (`src/features/Player.tsx`):** native `<video>` and iframe embeds share one
  transport; hls.js handles `.m3u8` (WebView2 has no native HLS).
- **Ingest (`src/lib/remoteSources.ts`, `ImportView`, `FeedsView` in Settings › Sources):** add a
  podcast RSS feed, a direct `.mp4`/`.m3u8` URL, or a YouTube/Vimeo watch URL. Feeds refresh
  idempotently. (The old `AddSourceDialog` modal was folded into `ImportView`.)
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
- [ ] **Queue:** play from a show → Up Next lists that show's remaining episodes in order;
      auto-advances. Play next / Add to queue from a library row reorders Up Next correctly.
- [ ] **Player:** ⏪/⏩ jump ±10s; controls hide ~1.5s after idle, persist while paused; ✕
      collapses to the mini bar (audio continues); fullscreen fills the screen.
- [ ] **Resume:** play partway, leave, replay → resumes near the last position; finished shows ✓.
- [ ] **YouTube:** only Dub-Deck controls appear — pressing play never resurfaces YouTube chrome.
- [ ] **Themes:** switch a theme in Settings → sidebar + playbar recolor immediately; persists.
- [ ] **Sidebar edit:** hide/show/reorder items and pin a playlist; layout survives restart.
- [ ] **Thumbnails:** paste an image in Edit → row/Shows cover updates.

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
