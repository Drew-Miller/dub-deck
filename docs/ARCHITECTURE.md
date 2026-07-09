# dub-deck — Architecture & File/Folder Map

A living map of **where everything lives** — source files, runtime data, and build
outputs. Update this whenever files or storage locations are added or moved.

Project root is per-machine (macOS: `~/Developer/dub-deck`; Windows:
`C:\Users\<you>\Projects\dub-deck`). The code is identical across machines; only the checkout
path and the local library differ.

---

## 1. Where data lives at runtime (important)

dub-deck **references video files in place — it never copies or moves them.** Four
distinct locations are in play:

| What | Location | Notes |
|------|----------|-------|
| **Your video files** | anywhere on disk (local `file` sources) | The actual `.mp4`s, referenced in place. May live anywhere the asset-protocol scope allows (`$HOME/**` + configured drive roots). |
| **Remote media** | not stored — streamed from the origin | `direct_url` / `rss` / `youtube` / `vimeo` episodes hold only a `source_url`; bytes come from the publisher at play time. |
| **Downloaded media** | `<app-data>/downloads/` | Opt-in local cache of a remote episode (`episodes.download_path`). Played locally when present, else streamed. |
| **Metadata database** | `<app-data>/dubdeck.db` | SQLite. Shows, episodes (title, description, number, date, **file/source path**, favorited, progress), feeds, playlists, settings. **No video bytes.** Survives moving the project. |
| **Logs** | `<app-data>/logs/dub-deck.log` | Timestamped events + basic metrics. **Hard-capped at 250 MB** — deleted & restarted on reaching the cap (checked at startup and on every write). |
| **App identity** | `com.dubdeck.app` | Bundle id; determines the app-data folder. Set in `src-tauri/tauri.conf.json`. |

`<app-data>` resolves per-OS: macOS `~/Library/Application Support/com.dubdeck.app`, Windows
`%APPDATA%\com.dubdeck.app`, Linux `~/.local/share/com.dubdeck.app`.

> Moving/renaming a local video after import breaks that episode's link (a "relink" flow is
> backlog). The original filename is retained (migration v2) to aid future relinking.

---

## 2. Source tree

```
dub-deck/
├── CLAUDE.md                  ← agent-facing brief (auto-loaded from root; requirements, gotchas)
├── README.md                  ← project overview & requirements checklist
├── docs/                      ← project documentation (living docs)
│   ├── ARCHITECTURE.md        ← this file — file/folder + data-location map
│   ├── decisions.md           ← durable decision log (what + why, dated)
│   └── handoff.md             ← current task state + cross-machine test steps
├── .claude/skills/docs-sync/  ← skill that keeps this doc set current + non-redundant
├── vitest.config.ts           ← Vitest (jsdom) config for the unit tier
├── playwright.config.ts       ← Playwright (Chromium) config for the layout tier
├── tests/
│   ├── unit/                  ← Vitest: queue engine + db query builders (Tauri mocked)
│   ├── support/               ← shared factories (episode fixtures)
│   └── e2e/                   ← Playwright: relative-geometry layout specs + Tauri browser stub
├── index.html                 ← Vite HTML entry
├── package.json / vite.config.ts / tsconfig*.json
│
├── media/                     ← YOUR VIDEO FILES (referenced, not copied)
├── public/                    ← static assets
│
├── src/                       ← FRONTEND (React + TypeScript)
│   ├── main.tsx               ← entry; mounts providers (Player + Refresh) + theme
│   ├── App.tsx                ← shell: editable sidebar, view switching, collapse, native-menu wiring, toast, Player
│   ├── App.css                ← shell/sidebar/edit-mode/toast layout
│   ├── theme.css              ← GLOBAL design tokens + utility classes (default skin: "Dead Terminal")
│   ├── types.ts               ← shared domain types (Show, Episode, Playlist, sorts, settings)
│   │
│   ├── lib/
│   │   ├── db.ts              ← TYPED DATA-ACCESS API (only place SQL is called); episodes/shows/feeds/playlists/settings/downloads/progress
│   │   ├── importer.ts        ← one-click auto-import: pick files → parse tags → createEpisode
│   │   ├── sources.ts         ← source abstraction: playbackKind + resolveMedia (prefers download_path) + scrape seam
│   │   ├── remoteSources.ts   ← ingest remote sources (direct URL / youtube-vimeo / RSS feed)
│   │   ├── iframePlayer.ts    ← YouTube IFrame API + @vimeo/player adapter (embed transport, native chrome suppressed)
│   │   ├── downloads.ts       ← download orchestration: pick Rust command per source_type, gated by Settings tools
│   │   ├── themes.ts          ← THEMES (Dead Terminal + 10 VS Code skins); applyTheme() sets CSS vars on :root
│   │   ├── scrapeBackend.ts   ← OPTIONAL yt-dlp resolver registration (wired when yt-dlp enabled in Settings)
│   │   ├── log.ts             ← frontend logger → Rust `append_log`
│   │   └── state.tsx          ← player queue engine (context + manual queue, auto-shuffle) + library-refresh signal
│   │
│   └── features/              ← component + its CSS per feature
│       ├── Player.tsx/.css            ← full-window player (native <video> + iframe embeds) + mini bar; centered transport, Up Next, progress/resume, downloads
│       ├── LibraryView.tsx/.css       ← episode list; source badges, thumbnails, progress bars, row download, multi-select edit, grouped ⋯ menu
│       ├── FilterBar.tsx              ← search pill + year/month/episode-range/favorites filters + sort field/dir
│       ├── PlaylistsView.tsx          ← playlist CRUD + play
│       ├── FavoritesView.tsx          ← single Favorites list (heart)
│       ├── RecentlyListenedView.tsx   ← most-recently-played episodes
│       ├── ShowsView.tsx/.css         ← album-cover grid (recent first); favorite + edit a show
│       ├── ShowEditDialog.tsx         ← edit show title + paste/URL cover image
│       ├── EditEpisodeDialog.tsx/.css ← edit episode metadata + paste thumbnail + view source/file/download paths
│       ├── ImportView.tsx/.css        ← single Import screen: local files + feed/direct/youtube-vimeo URLs (staged list)
│       ├── SettingsView.tsx/.css      ← tools (yt-dlp/ffmpeg paths), sources (feeds), downloads, theme picker
│       ├── FeedsView.tsx/.css         ← feed subscription list (rendered inside Settings › Sources)
│       ├── RowThumb.tsx               ← shared left-thumbnail for all list rows
│       └── Sidebars.css               ← shared styles for list/grid views
│       (AddSourceDialog.* and ImportDialog.* retired — import is the single ImportView; add-source folded in)
│
└── src-tauri/                 ← BACKEND (Rust / Tauri desktop shell)
    ├── Cargo.toml             ← Rust deps; tauri "protocol-asset", sql "sqlite", mp4ameta, tauri-plugin-http, reqwest
    ├── tauri.conf.json        ← window, bundle id, assetProtocol scope (streaming perms), csp: null
    ├── capabilities/
    │   └── default.json       ← permission grants — MUST include `sql:allow-execute` (writes!) + `http:default`
    ├── src/
    │   ├── lib.rs             ← app entry: plugins, SQLITE MIGRATIONS (v1–v7), commands, native menu, log sink, 250MB cap
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
| `check_tool(path)` | Verify a user-configured tool binary (yt-dlp/ffmpeg) exists and runs. Powers Settings "Test". |
| `download_media(url, dest)` | Fetch an MP4 to `dest` via `reqwest` (no external tool). Direct-URL / RSS-MP4 downloads. |
| `download_hls(url, dest, ffmpeg)` | Mux an `.m3u8` stream to a file using the Settings-configured **ffmpeg** path. |
| `download_scrape(url, dest, ytdlp)` | Download YouTube/Vimeo via the Settings-configured **yt-dlp** path. |
| `resolve_scrape(url, ytdlp)` | Resolve a `scrape` source to a stream URL via yt-dlp. Always compiled; inert until a path is passed. |
| `save_thumbnail(dest, data)` | Write pasted/downloaded image bytes into app-data (episode/show cover). |
| `remove_file(path)` | Delete a downloaded media file ("remove download" reverts to streaming). |

App-defined commands do **not** need ACL/capability entries (only *plugin* commands do).
Remote fetching (feeds, oEmbed, downloads) uses **`tauri-plugin-http`** / `reqwest` (Rust-side,
bypasses webview CORS); the capability grant is `http:default` scoped to `https://**` in
`default.json`. The **native menu** (Preferences → emits `open-settings`, `CmdOrCtrl+,`) is built
in `lib.rs` setup. External tools are **runtime opt-in** (paths in the `settings` table); nothing
is auto-installed and commands are inert until a path is configured.

---

## 4. Data model (migration in `lib.rs`)

Current migration version: **7** (`src-tauri/src/lib.rs`).

```
shows           (id, title, created_at,
                 image_url,                                          -- v4
                 favorited)                                          -- v7
episodes        (id, show_id→shows, title, description, episode_number,
                 published_date 'YYYY-MM-DD', file_path, duration,
                 favorited, favorited_at, added_at,
                 original_filename, original_title, video_height,    -- v2
                 source_type, source_url, thumbnail_url, feed_id→feeds, guid,  -- v3
                 download_path,                                      -- v5
                 position, played_at, finished)                     -- v6
feeds           (id, show_id→shows, feed_url UNIQUE, title, site_url,          -- v3
                 thumbnail_url, last_refreshed_at, created_at)
settings        (key PRIMARY KEY, value)                            -- v5
playlists       (id, name, created_at)
playlist_items  (playlist_id→playlists, episode_id→episodes, position, added_at)
```

Migration history: v1 base · v2 metadata capture · v3 remote sources · **v4 drops `liked`/
`liked_at`** (favorites-only) + `shows.image_url` · v5 `episodes.download_path` + `settings`
table · v6 playback progress (`position`/`played_at`/`finished`) · v7 `shows.favorited`.

**Source of media (`source_type`)** keys every playback/UI decision:
`file` (local `file_path`) · `direct_url` / `rss` (stream `source_url` in native `<video>`) ·
`youtube` / `vimeo` (iframe embed) · `scrape` (resolved at play time via yt-dlp; inert until
configured in Settings). Remote episodes keep `file_path = ''`; it stays `NOT NULL` to avoid a
risky table rebuild. `resolveMedia` prefers `download_path` (local) when set, else streams.

Schema changes = add a new `Migration { version: N, ... }` in `lib.rs`; never edit an
already-applied version. (SQLite ≥3.35 required for the v4 `DROP COLUMN`.)

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
# cd into your checkout (macOS ~/Developer/dub-deck, Windows C:\Users\<you>\Projects\dub-deck)
npm run tauri dev      # desktop app, hot reload (Vite :1420)
npm run build          # typecheck + build frontend only
npm run tauri build    # native bundle (src-tauri/target/release/bundle)
```

---

## 8. Conventions

- **All DB access via `src/lib/db.ts`.** Components never touch the SQL plugin directly.
- **Look & feel flows from `src/theme.css`** design tokens — recolor globally from there.
- **Playback scope:** `tauri.conf.json → app.security.assetProtocol.scope`
  (`$HOME/**` covers the user profile on every OS). Add drive roots (e.g. `D:/**`) if videos
  live elsewhere.
- **React 19:** no global `JSX` namespace — annotate return types with `import type { JSX } from "react"`.
- **Theme** is applied at runtime: `themes.ts → applyTheme(id)` writes design-token CSS vars onto
  `:root`, so all views recolor from one place. `theme.css` holds the default token values.
