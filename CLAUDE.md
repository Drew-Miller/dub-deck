# CLAUDE.md — dub-deck

Guidance for AI agents (and humans) working in this repo. Read this first, then
`ARCHITECTURE.md` for the file/folder + data-location map, and
**`.claude/docs/decisions.md`** for the running record of decisions.

> **Decision log — `.claude/docs/decisions.md`:** the canonical, durable record of every
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

**Organization / metadata**
- ✅ Shows (podcasts) → episodes. Per-episode: show, episode #, title, description, date.
- ✅ Edit/delete episode metadata after import.
- ✅ Auto-derive show/title/episode # from the file's embedded tags on import.
- 🔜 **Always keep the original filename tied to the file**, even when other fields are derived.
- 🔜 Also keep the **original embedded title** (raw) + **duration** (fill at import).
- 💬 Optional extra attributes to store (resolution/quality badge, file size). Decide with user.
- ❌ URL / description / air date are **NOT** embedded in the user's files (confirmed via ffprobe);
  would require the YouTube Data API later (opt-in, needs a key + video-id matching).

**Search / filter**
- ✅ Search by title OR description.
- ✅ Filter by year; by month (e.g. "2020 NOV"); by episode-number buckets of 100 (1–100, 100–200…);
  by liked/favorited; plus sorting. Default sort: episode # asc, then alphabetical for unnumbered.

**Playback / collections (Spotify/Apple-Music style)**
- ✅ Like, favorite, add-to-playlist while playing (from the player). Playlists CRUD. Liked/Favorites views.
- ✅ Shuffle/random play across multiple selected shows; build a shuffled queue of N.

**Import UX**
- ✅ One-click: pick files → auto-import immediately (no form). Date intentionally left off.
- 🔜 Folder-scan import (pick a directory).

**Library UX** 🔜 (next major task — see "Current work")
- 🔜 iTunes-style: clicking an episode does **not** immediately play. It opens a **detail panel
  docked at the bottom** while the list stays visible above; the panel has a **Play** button and a
  **three-dot (⋯) menu** whose options include **Edit**. Move edit OUT of the per-row button into ⋯.

**Look & feel**
- ✅ Distinct, creative theming. History: Apple-Music-ish (rejected) → retro hi-fi amber (rejected)
  → modern Winamp neon (rejected) → **Dead Terminal / sci-fi horror** (current). Recolor via `theme.css` tokens only.

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
   `src-tauri/capabilities/default.json`, every write (import, like, favorite, playlist,
   edit, delete) silently fails. This caused the "Nothing imported" bug.
2. **Moving the project breaks `src-tauri/target/`** (absolute paths baked in). After any
   move, `cargo clean --manifest-path src-tauri/Cargo.toml` then `npm run tauri dev`.
3. **React 19 removed the global `JSX` namespace.** Use `import type { JSX } from "react"`
   for `JSX.Element` return-type annotations.
4. **Asset-protocol needs both** the `protocol-asset` Cargo feature (Cargo.toml) **and** an
   `assetProtocol.scope` entry (tauri.conf.json) covering the video's path, or playback fails.
5. **App-defined Rust commands need no ACL entry** (only plugin commands do).

---

## Logging & metrics

- Frontend: `src/lib/log.ts` → `log.info/warn/error(msg, data?)`.
- Backend sink: `append_log` command + `write_log_line()` in `lib.rs`.
- File: `~/Library/Application Support/com.dubdeck.app/logs/dub-deck.log`.
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

## Commands

```bash
cd ~/Developer/dub-deck
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

- Full-window **Now Playing** player (auto-hiding overlay controls, back arrow, side drawer
  of the show's episodes) + Apple-Music **mini bar** (controls only; video hidden, audio continues).
- Edit / Delete / Reveal moved to a **per-row ⋯ menu** in the library.
- Metadata capture (original filename/title, duration, resolution) via migration v2.

## Next up

1. 🔜 Folder-scan import (pick a directory).
2. 🔜 Optional YouTube Data API enrichment (URL / description / air-date; needs a key).
3. 🔜 "Relink" flow for moved/renamed files.

Keep this file, `ARCHITECTURE.md`, and `.claude/docs/decisions.md` updated as decisions land.
