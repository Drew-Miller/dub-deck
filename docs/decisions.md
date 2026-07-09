# dub-deck — Decision Log

**Why this file exists:** dub-deck is built conversationally across many sessions and
multiple AI agents. Chat history is not durable and not visible to a fresh agent, so
every non-obvious product / UX / architecture decision is recorded here. This is the
canonical record of *what was decided and why*. It is referenced from `CLAUDE.md`.

**How it's maintained:** whenever a decision is made in conversation, append it here
(newest at the bottom of its section) with the decision, the reasoning, and the date.
Agents must read this file at the start of work and keep it updated as decisions land.

Dates are absolute. Format: `YYYY-MM-DD — decision — why`.

---

## Product / concept
- **2026-07-06** — dub-deck is a **local desktop podcast/video player** for the user's
  own video files (not YouTube links). — The user wants to watch their downloaded
  podcast videos in a YouTube/Spotify-like app.
- **2026-07-06** — **Reference video files in place; never copy or move them.** Only
  metadata goes in SQLite. — A user's disk may not hold a large library; duplicating
  video would be wasteful. (Same model as Plex/iTunes.)

## Stack / architecture
- **2026-07-06** — **Tauri** (Rust shell) + React + TS + SQLite, over Electron. — Small
  binary, native file access, efficient local video streaming via the asset protocol.
- **2026-07-06** — **Read MP4 tags in Rust** (`mp4ameta` for title/artist/duration,
  `mp4` crate for resolution). No network / no Google scraping. — The needed metadata
  (show, title, episode #) is embedded in the files; URL/description/air-date are not.
- **2026-07-06** — **All DB access goes through `src/lib/db.ts`**; look & feel flows
  from `src/theme.css` tokens. — Consistency and single-source-of-truth.

## Import
- **2026-07-06** — **One-click auto-import**: pick files → parse embedded tags → import
  immediately, no form. — Everything needed is in the file; typing is friction.
- **2026-07-06** — **Date left off at import** (stored null). — Air date isn't embedded
  and the user didn't want a wrong default.
- **2026-07-06** — Import **auto-derives**: show = `artist` tag, title = cleaned `title`
  tag, episode # = parsed from title. Show falls back to "Unknown Show" if untagged.

## Metadata kept per episode
- **2026-07-06** — Keep **original filename** (always tied to the file), **original
  embedded title**, **duration**, and **video height** (for a quality badge). Skip file
  size / codec / language / container as clutter. — Confirmed with the user.

## Library / sorting
- **2026-07-06** — Default sort: **episode number ascending, then alphabetical** for
  episodes without a number. — User request.
- **2026-07-07** — **Edit / Delete / Reveal-in-Finder live at the episode-list level**
  (per-row ⋯ menu), NOT in the player. — Keep the player focused on playback.

## Player / Now Playing
- **2026-07-07** — Clicking an episode opens a **full-window video** (covers the whole
  app) with **auto-hiding overlay controls** (~2.5s). — User wants an immersive view,
  not a bottom dock.
- **2026-07-07** — **Back arrow collapses to an Apple-Music-style mini bar** that keeps
  playing while browsing. One shared `<video>` element across both modes so playback
  never restarts.
- **2026-07-07** — The show's **other episodes** appear in a **right-side drawer**;
  its toggle is an **icon in the bottom-left** of the player controls.
- **2026-07-07** — Transport controls (prev / play-pause / next) use custom **80s
  sci-fi** styled SVG icons; exact style delegated to the agent.

## Theme
- **2026-07-07** — Current theme is **"Dead Terminal"** (sci-fi horror console:
  cold black, phosphor-green, blood-red alarms, monospace, CRT scanlines). — Chosen
  after Apple-Music-ish, retro-hifi-amber, and modern-Winamp-neon were rejected.

## Logging
- **2026-07-07** — Local log at `<app_data>/logs/dub-deck.log`, **hard-capped at 250 MB**
  (deleted/restarted on reaching the cap). — User wants diagnostics without unbounded disk use.

## Ops / gotchas (learned)
- **2026-07-07** — `sql:allow-execute` must be granted in capabilities or all writes fail
  silently. — Root cause of the "nothing imported" bug.
- **2026-07-07** — Moving the project invalidates `src-tauri/target/`; run `cargo clean` after a move.

## Tooling
- **2026-07-07** — A **`dub-deck` zsh function** in `~/.zshrc` launches the GUI from any
  directory: opens the release `.app` if built, else runs `npm run tauri dev`. — The user
  wanted a profile-level CLI command to open the app.
- **2026-07-07** — When the dev webview shows a **stale UI**, the fix is to clear
  `node_modules/.vite` + `dist` and restart, or build/run the release app (loads over
  `tauri://`, no dev-server HTTP cache). Verified the Vite dev server was serving correct
  code — the staleness was purely webview-side caching.

## Player (cont.)
- **2026-07-07** — The **mini bar shows controls only, no video** (the `<video>` stays
  mounted and hidden so audio continues and re-expanding is seamless). The full player is
  where the user watches. — User request.

## Remote streaming sources
- **2026-07-07** — Add **URL-based sources** so the app never hosts media: it stores only
  URLs + metadata and streams from the publisher's host (the Apple/Spotify model). — User
  wants a "site + library" without paying for storage.
- **2026-07-07** — Ship three source models: **podcast RSS feeds**, **direct media URL**
  (.mp4/.m3u8), and **YouTube/Vimeo embeds** (iframe). — Legal, zero-storage; RSS fits
  dub-deck's podcast identity, embeds are the sanctioned way to "use" YouTube.
- **2026-07-07** — **yt-dlp scraping is a pluggable-but-inert seam**, not shipped active. The
  Rust `resolve_scrape` command is gated behind an off-by-default `scrape` cargo feature and no
  binary is installed here. — Scraping violates YouTube ToS + yields brittle, expiring,
  IP-locked URLs; user wants the option available on another machine, not on this one.
- **2026-07-07** — **Migration v3 is additive**: new `feeds` table + source columns on
  `episodes`; `file_path` stays `NOT NULL` (remote rows store `''`). — Avoids a risky table
  rebuild since `playlist_items` references `episodes`. `source_type` has no CHECK so adding
  `scrape` later needs no migration.
- **2026-07-07** — Fetch feeds/oEmbed **Rust-side via `tauri-plugin-http`** (`http:default`
  scoped `https://**`), not webview `fetch`. — Bypasses browser CORS for arbitrary hosts.
- **2026-07-07** — One shared **transport abstraction** in `Player.tsx`: native `<video>` and
  the iframe adapter (`iframePlayer.ts`, YouTube IFrame API + `@vimeo/player`) expose the same
  play/pause/seek/volume surface, so the custom controls work for both. hls.js handles `.m3u8`
  (WebView2 has no native HLS). — Keeps the single-player UX across all source types.
- **2026-07-07** — Cross-machine agent continuity lives in **git-tracked project docs**
  (`decisions.md` + `handoff.md`), never `~/.claude` memory (per-machine, doesn't sync).

## Favorites / queue / player / downloads overhaul
- **2026-07-07** — **Likes removed entirely** (migration v4 drops `liked`/`liked_at`); a single
  **Favorite** (heart) is the only saved state. — User wanted one "saved" concept.
- **2026-07-07** — **Queue = context + manual.** Playback captures the ordered list you started
  from (its sort/filter order) as the *context*; **Play next / Add to queue** (library rows +
  Up Next panel) form a *manual* queue that plays before the context resumes. At the end of the
  list, playback **auto-shuffles the whole library** (early taste of the shuffle north star).
- **2026-07-07** — **Full player**: centered overlay transport (skip −10 / play (squircle) /
  skip +10), title top-left + **✕ top-right collapses to mini bar**, auto-hide ~1.5s (snappy
  appear, stays while paused, cursor hides), fullscreen targets the **stage** so the video fills
  the monitor, right panel = **Up Next** queue. Mini bar gains a **show thumbnail** (episode/show
  image, else initial placeholder).
- **2026-07-07** — **Search** moved above the Shows chips as a rounded pill with a search icon.
- **2026-07-07** — **Single Import screen** (`ImportView`) replaces the two sidebar buttons +
  modal; **Feeds** folded into **Settings › Sources**; sidebar footer gains **⚙ Settings**.
- **2026-07-07** — **Downloads** (migration v5 `episodes.download_path`): stream by default,
  opt-in local caching. MP4 native (reqwest); **HLS needs ffmpeg**, **YouTube/Vimeo need yt-dlp**
  — both **runtime opt-in via Settings › Tools** (paths in a `settings` table). Nothing is
  auto-installed; unconfigured ⇒ "enable in Settings". Downloaded files play locally.
- **2026-07-07** — **Scrape moved compile-time → runtime**: dropped the `scrape` cargo feature;
  `resolve_scrape`/`download_scrape` take the Settings-configured yt-dlp path as an argument and
  are always compiled but inert until set. — Supports the Settings-driven tool model.

## UI / chrome polish
- **2026-07-08** — **Theme picker ships 11 skins** (Dead Terminal default + 10 popular VS Code
  themes) selectable in Settings; applied instantly and remembered. Themes are runtime: `themes.ts
  → applyTheme()` sets design-token CSS vars on `:root`, so the sidebar and playbar recolor
  immediately (fixed hardcoded gradients that didn't propagate). — User wanted a VS-Code-style
  theme marketplace feel with instant, whole-UI recolor.
- **2026-07-08** — **Sidebar is editable**: system items (Library/Playlists/Recently Listened/
  Favorites) can be shown/hidden and **reordered**, and playlists/shows **pinned**; layout
  persists to the `ui.sidebar` setting. Reorder uses **pointer-based drag**, not HTML5 DnD —
  WebView2 renders a no-drop cursor and blocks native drag. Collapse is `Ctrl/Cmd+B` (floating
  hamburger reopens). — User request; HTML5 drag was unreliable in WebView2.
- **2026-07-08** — **Recently Listened** is a first-class sidebar view (under Library), backed by
  `played_at`. — User request.
- **2026-07-08** — **Thumbnails everywhere**: every list row shows a left thumbnail (episode/show
  image, else a lettered placeholder); Shows render as an album-cover grid. Covers are set by
  **pasting an image** (clipboard → `save_thumbnail` into app-data) or an image URL, in the
  episode and show edit dialogs. — User wanted visual, paste-friendly artwork.
- **2026-07-08** — **Playback progress**: per-episode `position` is saved (throttled) and videos
  **resume where left off** (position > 3s and not finished); rows show a progress bar and a
  finished ✓; `onEnded` marks finished and advances the queue. — User wanted resume + watched state.
- **2026-07-08** — **YouTube/Vimeo native chrome fully suppressed**: a transparent cover div over
  the embed (`z-index:2`) eats all mouse events so the provider never surfaces its own controls;
  events bubble to the stage (click-to-toggle, mousemove→our controls), and our overlay sits
  above the cover (`z-index:3`). Earlier `pointer-events:none` on the iframe let native controls
  reappear on play. — One control surface for all sources.
- **2026-07-08** — **Downloads UI**: library rows get an icon-only **Download** button (cloud +
  down-arrow, hover "Download") in addition to the ⋯ menu; states are available / downloading /
  downloaded (✓) / "enable in Settings". `file` sources never show it. Skip buttons render as
  directional arrows with the seconds (±10) inside. — User-specified iconography.

## Testing
- **2026-07-08** — **Two-tier test framework**: **Vitest** (jsdom) for feature/state logic —
  the queue engine (`state.tsx`) and query builders (`db.ts`), with the Tauri SQL plugin +
  `api/core` mocked; **Playwright** (real Chromium) for appearance/layout. — jsdom has no layout
  engine (`getBoundingClientRect` is all zeros), so relative-position checks can't live there.
- **2026-07-08** — **Appearance tests assert relative geometry, never pixels**: e.g. sidebar's
  right edge ≤ main's left ("left of"), mini bar top > main top ("below"). — User directive; keeps
  layout tests robust to theming/resizing while still pinning intent.
- **2026-07-08** — Playwright renders the **real `<App/>`** against the Vite dev server with a
  **browser-side Tauri IPC stub** (`tests/e2e/support/tauriStub.ts`) that seeds a tiny library via
  `window.__TAURI_INTERNALS__`. — Exercises actual layout without standing up the Rust backend.
- **2026-07-08** — Tests are **derived from decisions + requirements**, not implementation details
  (assert the WHERE/ORDER a filter produces and the queue's advance order, not private helpers). —
  Tests should survive refactors and encode intended behavior.

## Episode views / import (round 2)
- **2026-07-09** — **One shared episode row** (`src/features/EpisodeRow.tsx` + `EpisodeRow.css`)
  is used by Library, Favorites, Recently Listened, Playlists, and Show detail, so every episode
  list looks and behaves identically (flat surface, thumbnail, source badge, progress, hover
  Download, ⋯ menu). The old per-view `card dd-panel` + `dd-row` markup and the per-view page
  titles were removed. Views pass the ordered `list` + `label` for the playback context; per-view
  extras (e.g. playlist "Remove from playlist") go through the row's `extraMenuItems` prop. Tools
  state is shared via a `useTools(version)` hook in `downloads.ts`. — User: "all episode-based
  viewing should be similar to the Library view."
- **2026-07-09** — **Auto-detect external tools**: Rust `detect_tool(name)` locates a binary via
  `where`/`which` plus common install dirs (winget/choco/Program Files, homebrew, /usr/local/bin,
  ~/.local/bin), verified with `--version`; Settings › Tools gets a "Find automatically" button
  that fills the path. — Most users don't know where yt-dlp/ffmpeg installed.
- **2026-07-09** — **Feeds UI removed from Settings** (feed data + refresh logic stay). — User
  request; the Sources panel was clutter.
- **2026-07-09** — **Channel art fills an empty show thumbnail on import** (`setShowImageIfEmpty`,
  never overwrites a user cover): RSS channel/iTunes image; for YouTube/Vimeo a best-effort
  `og:image` scraped from the channel page (`author_url`), falling back to the video thumbnail.
  Fetched Rust-side via the http plugin to bypass CORS. — No YouTube Data API needed; "if
  possible" best-effort per the user.

## Docs layout
- **2026-07-07** — All living docs (`ARCHITECTURE.md`, `decisions.md`, `handoff.md`) live in a
  root **`docs/`** folder (moved out of `.claude/docs/`). `CLAUDE.md` stays at root (Claude Code
  auto-loads it) and `README.md` stays at root (GitHub convention). — Discoverable, conventional
  location; keeps `.claude/` for tooling/config, not prose.
- **2026-07-08** — A **`docs-sync` skill** (`.claude/skills/docs-sync/`) owns keeping the five
  docs (README, CLAUDE, ARCHITECTURE, decisions, handoff) current and **non-redundant**, each
  with one purpose. Committed in-repo so it travels across machines. — User wanted a repeatable,
  low-redundancy doc-update process rather than ad-hoc edits.

## Portability
- **2026-07-07** — Target **macOS + Windows** (Linux likely fine). Stack is cross-platform;
  no OS-specific code. The library (DB + video files) is **per-machine** — porting the code
  transfers, videos are re-imported per machine. Asset-protocol scope uses `$HOME/**`
  (covers the user profile on all OSes); add drive roots (e.g. `D:/**`) for other Windows drives.
  Windows dev needs MSVC C++ Build Tools + WebView2. — User will continue dev on a Windows machine.
