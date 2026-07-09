# CLAUDE.md — dub-deck

Guidance for AI agents (and humans) working in this repo. Read this first, then
`docs/ARCHITECTURE.md` for the file/folder + data-location map,
**`docs/decisions.md`** for the running record of decisions, and
**`docs/handoff.md`** for current task state + cross-machine test steps.

> **Decision log — `docs/decisions.md`:** the canonical, durable record of every
> non-obvious product/UX/architecture decision and *why*. Chat history isn't visible to a
> fresh agent, so this file is how decisions survive across sessions. **Read it at the start
> of every task, and append any new decision made in conversation** (decision + reason + date).

---

## What this is

**dub-deck** is a **local desktop podcast/video player** — a personal "YouTube" for
video files the user already has on disk. Tauri (Rust shell) + React + TypeScript +
SQLite. Current visual theme: **"Dead Terminal"** (sci-fi horror console — cold black,
phosphor-green, blood-red alarms, monospace, CRT scanlines), defined entirely in
`src/theme.css`.

**Core principle — never duplicate video:** files are **referenced in place** by
absolute path; only lightweight metadata lives in SQLite. Playback streams from disk
via Tauri's asset protocol (`convertFileSrc`). A huge library costs ~0 extra disk.

---

## Requirements (source of truth)

✅ built · 🔜 planned/next · 💬 under discussion

**Core**
- ✅ Desktop GUI app (not a website); play the user's own local video files, YouTube-style.
- ✅ Import files already on disk; reference in place, never copy/move (disk-conscious).

**Streaming / remote sources (zero-storage)**
- ✅ Add **podcast RSS / Podcasting 2.0 feeds**: parse items → episodes; stream MP4/HLS enclosures.
- ✅ Add a **direct media URL** (.mp4/.m3u8); HLS via hls.js (WebView2 has no native HLS).
- ✅ Add **YouTube/Vimeo** watch URLs → iframe embed with shared transport controls.
- ✅ **yt-dlp scrape** is a wired-but-inert seam — now a **runtime** Settings toggle (no cargo
  feature); nothing installed here. Enable by pointing Settings › Tools at a binary per `docs/handoff.md`.

**Organization / metadata**
- ✅ Shows (podcasts) → episodes. Per-episode: show, episode #, title, description, date.
- ✅ Edit/delete episode metadata after import.
- ✅ Auto-derive show/title/episode # from the file's embedded tags on import.
- ✅ **Original filename kept** (migration v2), plus original embedded **title** + **duration** +
  **resolution** (quality badge). Thumbnails stored per episode/show (paste image or URL).
- ❌ URL / description / air date are **NOT** embedded in the user's files (confirmed via ffprobe);
  would require the YouTube Data API later (opt-in, needs a key + video-id matching).

**Search / filter**
- ✅ Search by title OR description.
- ✅ Filter by year; by month (e.g. "2020 NOV"); by episode-number buckets of 100 (1–100, 100–200…);
  by favorites; plus sort field + asc/desc. Default sort: recently added.

**Playback / collections (Spotify/Apple-Music style)**
- ✅ Favorite (single heart; likes removed, v4), add-to-playlist while playing. Playlists CRUD;
  Favorites + Recently Listened views; Shows album-cover grid.
- ✅ **Queue**: Play next / Add to queue; auto-advance through the played-from list, then
  auto-shuffle the library. Up Next panel in the player.
- ✅ **Progress/resume** (v6): saved position, resume, finished ✓; row progress bars.

**Import UX**
- ✅ Single **Import** screen (local files + feed/direct/youtube-vimeo URLs, staged list, paste).
- 🔜 Folder-scan import (pick a directory).

**Library / player UX**
- ✅ Full-window player with centered transport (skip ±10), ✕→mini bar, Up Next queue,
  auto-hide controls. Row thumbnails, source badges, grouped ⋯ menu (Edit in ⋯), row Download.
- ✅ Editable + collapsible sidebar (`Ctrl/Cmd+B`, show/hide/reorder/pin).

**Look & feel**
- ✅ **Theme picker**: Dead Terminal (default) + 10 VS Code skins, applied at runtime via
  `themes.ts → applyTheme()` (sets tokens on `:root`). History: Apple-Music-ish / retro amber /
  Winamp neon all rejected before Dead Terminal.

---

## Key decisions

- **Tauri over Electron** — small binary, native file access, efficient local video streaming.
- **Reference-in-place**, SQLite for metadata only (like Plex/iTunes).
- **Rust reads MP4 tags** (`mp4ameta` crate) via the `read_media_tags` command — offline, no network,
  no Google scraping. Import parses show=`artist`, title=cleaned `title`, episode #=parsed from title.
- **Single design-token stylesheet** (`theme.css`) drives the whole look.

---

## CRITICAL gotchas (these bit us — don't regress)

1. **`sql:allow-execute` permission is REQUIRED.** `sql:default` only grants
   close/load/**select** — NOT execute. Without `sql:allow-execute` in
   `src-tauri/capabilities/default.json`, every write (import, favorite, playlist,
   edit, delete, progress, settings) silently fails. This caused the "Nothing imported" bug.
2. **Moving the project breaks `src-tauri/target/`** (absolute paths baked in). After any
   move, `cargo clean --manifest-path src-tauri/Cargo.toml` then `npm run tauri dev`.
3. **React 19 removed the global `JSX` namespace.** Use `import type { JSX } from "react"`
   for `JSX.Element` return-type annotations.
4. **Asset-protocol needs both** the `protocol-asset` Cargo feature (Cargo.toml) **and** an
   `assetProtocol.scope` entry (tauri.conf.json) covering the video's path, or playback fails.
5. **App-defined Rust commands need no ACL entry** (only plugin commands do).
6. **Remote fetch needs the `http:default` capability** (scoped `https://**` in
   `capabilities/default.json`) + `tauri-plugin-http`. Feeds/oEmbed fetch Rust-side to bypass
   webview CORS; without the grant, feed adds fail.
7. **HLS (`.m3u8`) needs hls.js** — Windows WebView2 has no native HLS. `sources.ts` flags it;
   `Player.tsx` attaches hls.js. Native HLS path only fires on macOS/Safari.
8. **`csp: null`** in `tauri.conf.json` is required so remote `<video>` and YouTube/Vimeo
   iframes load. Setting a CSP without `media-src`/`frame-src`/`connect-src` breaks streaming.
9. **YouTube/Vimeo native controls** are suppressed with a transparent cover div over the embed
   (`.ddp-embed-cover`, `z-index:2`) that eats all mouse events; our overlay must stay **above**
   it (`.ddp-overlay`, `z-index:3`) or the controls become unclickable. `pointer-events:none` on
   the iframe does NOT work — native chrome reappears on play.

---

## Logging & metrics

- Frontend: `src/lib/log.ts` → `log.info/warn/error(msg, data?)`.
- Backend sink: `append_log` command + `write_log_line()` in `lib.rs`.
- File: `<app-data>/com.dubdeck.app/logs/dub-deck.log` (per-OS app-data; see `docs/ARCHITECTURE.md`).
- **Hard cap 250 MB** (`LOG_CAP_BYTES`): checked at startup and before every write; when
  reached the file is deleted and restarted so it never exceeds ~250 MB.
- Import is instrumented end-to-end. Add logging to new flows; keep it best-effort (never throw into UI).

---

## Conventions

- **All DB access through `src/lib/db.ts`** — never call the SQL plugin from components.
- Feature = one component + its CSS in `src/features/`. Shared state via `src/lib/state.tsx`
  (`usePlayer`, `useLibraryVersion`, `useBumpLibrary`); call `bump()` after mutations so views refresh.
- Theme via `theme.css` tokens/utility classes; keep new UI consistent with them.
- After edits: `npx tsc --noEmit` must pass. The dev watcher auto-rebuilds `src-tauri` on Rust changes.
- **Tests:** `npm test` (Vitest — logic/state) and `npm run test:e2e` (Playwright — layout). Write
  logic tests against decisions/requirements, not internals; layout tests assert relative geometry,
  never pixels. See `docs/decisions.md` › Testing.

## Commands

```bash
# from your checkout (macOS ~/Developer/dub-deck, Windows C:\Users\<you>\Projects\dub-deck)
npm run tauri dev      # desktop app, hot reload
npm run build          # typecheck + build frontend
npm run tauri build    # native bundle
```

---

## Cross-platform (macOS + Windows)

- Stack is fully cross-platform; no OS-specific code. App-data/log paths resolve per-OS via Tauri.
- The **library is per-machine** (DB + video files are local). Porting the *code* transfers; videos are re-imported per machine.
- **Playback scope** (`tauri.conf.json → assetProtocol.scope`) uses `$HOME/**` (covers the user
  profile on every OS). For videos on other Windows drives, add e.g. `"D:/**"`.
- **Windows dev prereqs:** MSVC C++ Build Tools + WebView2 runtime, plus Node + Rust.

## Done (shipped)

- **Player**: full-window video, centered transport (skip ±10), ✕→mini bar, auto-hide controls,
  **Up Next** queue, **progress/resume** (v6). Mini bar = controls + thumbnail (audio continues).
- **Queue engine** (`state.tsx`): context + manual queue, auto-shuffle at end.
- **Favorites-only** (v4 drops likes); single heart. Recently Listened + Shows-grid views.
- **Remote streaming sources** (v3): RSS, direct URL, YouTube/Vimeo embeds; fetch via
  `tauri-plugin-http`. Native embed chrome suppressed (transparent cover, see gotcha 9).
- **Downloads** (v5): opt-in local cache; MP4 native, HLS via ffmpeg, YT/Vimeo via yt-dlp,
  gated by Settings › Tools. yt-dlp scrape now a runtime toggle.
- **Single Import screen**; **Settings** (tools/sources/downloads/theme); Feeds → Settings › Sources.
- **Editable + collapsible sidebar**; **theme picker** (Dead Terminal + 10 VS Code skins);
  native menu + `Cmd/Ctrl+,` Settings. Thumbnails everywhere (paste image/URL).
- Metadata capture (original filename/title, duration, resolution) via migration v2.

Full "why" for each: `docs/decisions.md`. File/data map: `docs/ARCHITECTURE.md`. In-flight state
+ test steps: `docs/handoff.md`.

## Next up

1. 🔜 Folder-scan import (pick a directory).
2. 🔜 "Relink" flow for moved/renamed files.
3. 🔜 Optional YouTube Data API enrichment (URL / description / air-date; needs a key).
4. 🔜 Download **progress** reporting (currently busy → done/failed only).

Keep this file, `docs/ARCHITECTURE.md`, `docs/decisions.md`, and `docs/handoff.md` current as
decisions land. The **`docs-sync` skill** (`/docs-sync`) automates this per the doc contract.
