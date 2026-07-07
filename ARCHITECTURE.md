# dub-deck — Architecture & File/Folder Map

A living map of **where everything lives** — source files, runtime data, and build
outputs. Update this whenever files or storage locations are added or moved.

Project root: `~/Developer/dub-deck` (`/Users/drewmiller/Developer/dub-deck`)

---

## 1. Where data lives at runtime (important)

dub-deck **references video files in place — it never copies or moves them.** Four
distinct locations are in play:

| What | Location | Notes |
|------|----------|-------|
| **Your video files** | `~/Developer/dub-deck/media/` (or anywhere on disk) | The actual `.mp4`s. `media/` is a convenient home; files may live anywhere under `$HOME` or `/Volumes`. |
| **Metadata database** | `~/Library/Application Support/com.dubdeck.app/dubdeck.db` | SQLite. Shows, episodes (title, description, number, date, **file path**), likes, favorites, playlists. **No video bytes.** Survives moving the project. |
| **Logs** | `~/Library/Application Support/com.dubdeck.app/logs/dub-deck.log` | Timestamped events + basic metrics. **Hard-capped at 250 MB** — deleted & restarted on reaching the cap (checked at startup and on every write). |
| **App identity** | `com.dubdeck.app` | Bundle id; determines the folder names above. Set in `src-tauri/tauri.conf.json`. |

> Moving/renaming a video after import breaks that episode's link. (Planned mitigation:
> store the original filename permanently and add a "relink" flow.)

---

## 2. Source tree

```
dub-deck/
├── CLAUDE.md                  ← agent-facing brief (decisions, requirements, gotchas)
├── ARCHITECTURE.md            ← this file
├── README.md                  ← project overview & requirements checklist
├── index.html                 ← Vite HTML entry
├── package.json / vite.config.ts / tsconfig*.json
│
├── media/                     ← YOUR VIDEO FILES (referenced, not copied)
├── public/                    ← static assets
│
├── src/                       ← FRONTEND (React + TypeScript)
│   ├── main.tsx               ← entry; mounts providers (Player + Refresh) + theme
│   ├── App.tsx                ← shell: sidebar nav, view switching, one-click import, toast, Player
│   ├── App.css                ← shell/sidebar/toast layout
│   ├── theme.css              ← GLOBAL design tokens + utility classes (current: "Dead Terminal")
│   ├── types.ts               ← shared domain types (Show, Episode, Playlist, filters)
│   │
│   ├── lib/
│   │   ├── db.ts              ← TYPED DATA-ACCESS API (only place SQL is called)
│   │   ├── importer.ts        ← one-click auto-import: pick files → parse tags → createEpisode
│   │   ├── log.ts             ← frontend logger → Rust `append_log`
│   │   └── state.tsx          ← app state: player queue + library-refresh signal
│   │
│   └── features/              ← component + its CSS per feature
│       ├── EditEpisodeDialog.tsx/.css ← edit/delete episode metadata
│       ├── Player.tsx/.css            ← docked video player + like/fav/playlist controls
│       ├── LibraryView.tsx/.css       ← episode list; hosts FilterBar (+ currently an edit dialog)
│       ├── FilterBar.tsx              ← search + year/month/episode-range/like filters
│       ├── PlaylistsView.tsx          ← playlist CRUD + play
│       ├── FavoritesView.tsx          ← Liked / Favorites tabs
│       ├── ShuffleView.tsx            ← random play across selected shows
│       └── Sidebars.css               ← shared styles for Playlists/Favorites/Shuffle
│       (ImportDialog.* was removed — import is now one-click via lib/importer.ts)
│
└── src-tauri/                 ← BACKEND (Rust / Tauri desktop shell)
    ├── Cargo.toml             ← Rust deps; tauri "protocol-asset", sql "sqlite", mp4ameta
    ├── tauri.conf.json        ← window, bundle id, assetProtocol scope (streaming perms)
    ├── capabilities/
    │   └── default.json       ← permission grants — MUST include `sql:allow-execute` (writes!)
    ├── src/
    │   ├── lib.rs             ← app entry: plugins, SQLITE MIGRATIONS, commands, log sink, 250MB cap
    │   └── main.rs            ← thin binary entry
    ├── icons/                 ← app icons
    └── gen/schemas/           ← auto-generated permission schemas (do not edit)
```

---

## 3. Rust commands (in `src-tauri/src/lib.rs`)

| Command | Purpose |
|---|---|
| `read_media_tags(path)` | Read embedded `title` / `artist` / `duration` from an MP4-family file (via `mp4ameta`). Powers import auto-fill. |
| `append_log(line)` | Persist one pre-formatted log line; enforces the 250 MB cap on every write. |

App-defined commands do **not** need ACL/capability entries (only *plugin* commands do).

---

## 4. Data model (migration in `lib.rs`)

```
shows           (id, title, created_at)
episodes        (id, show_id→shows, title, description, episode_number,
                 published_date 'YYYY-MM-DD', file_path, duration,
                 liked, favorited, liked_at, favorited_at, added_at)
playlists       (id, name, created_at)
playlist_items  (playlist_id→playlists, episode_id→episodes, position, added_at)
```

Schema changes = add a new `Migration { version: N, ... }` in `lib.rs`; never edit an
already-applied version.

**Sorting:** default `number_asc` = episode number ascending, `NULLS LAST`, then title
A–Z — so episodes without a number sort alphabetically at the end.

---

## 5. Logging & metrics

- **Frontend:** `src/lib/log.ts` → `log.info/warn/error(msg, data?)`. Formats an ISO-timestamped
  line, mirrors to console, and calls the Rust `append_log`.
- **Backend:** `write_log_line()` in `lib.rs` (used at startup and by `read_media_tags`).
- **File:** `<app_data>/logs/dub-deck.log`.
- **Cap:** `LOG_CAP_BYTES = 250 MB`. Checked at startup and before every append; when reached,
  the file is deleted and started fresh (never exceeds ~250 MB).
- Import is instrumented end-to-end (start, per-file result, failures, summary).

---

## 6. Build outputs (git-ignored, safe to delete/regenerate)

| Path | Regenerate with |
|------|-----------------|
| `node_modules/` | `npm install` |
| `dist/` | `npm run build` |
| `src-tauri/target/` | `cargo build` / `npm run tauri dev` |
| `src-tauri/gen/` | regenerated on build |

> Moving the project invalidates absolute paths baked into `src-tauri/target/`.
> After a move, run `cargo clean --manifest-path src-tauri/Cargo.toml` before `tauri dev`.

---

## 7. Commands

```bash
cd ~/Developer/dub-deck
npm run tauri dev      # desktop app, hot reload (Vite :1420)
npm run build          # typecheck + build frontend only
npm run tauri build    # native .app bundle (src-tauri/target/release/bundle)
```

---

## 8. Conventions

- **All DB access via `src/lib/db.ts`.** Components never touch the SQL plugin directly.
- **Look & feel flows from `src/theme.css`** design tokens — recolor globally from there.
- **Playback scope:** `tauri.conf.json → app.security.assetProtocol.scope`
  (`$HOME/**`, `/Volumes/**`, `/media/**`, `/mnt/**`). Add paths if videos live elsewhere.
- **React 19:** no global `JSX` namespace — annotate return types with `import type { JSX } from "react"`.
- This Claude Code chat session was originally anchored to `/Users/drewmiller`. After you migrate
  and launch `claude` from `~/Developer/dub-deck`, new sessions read this repo's `CLAUDE.md`.
