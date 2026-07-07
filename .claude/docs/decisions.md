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

## Portability
- **2026-07-07** — Target **macOS + Windows** (Linux likely fine). Stack is cross-platform;
  no OS-specific code. The library (DB + video files) is **per-machine** — porting the code
  transfers, videos are re-imported per machine. Asset-protocol scope uses `$HOME/**`
  (covers the user profile on all OSes); add drive roots (e.g. `D:/**`) for other Windows drives.
  Windows dev needs MSVC C++ Build Tools + WebView2. — User will continue dev on a Windows machine.
