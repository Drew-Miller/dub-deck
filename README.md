# dub-deck 🔀📼

A **local desktop podcast/video player** — a personal "YouTube" for the video files
you already have on disk, plus streaming sources you add by URL. Import your own videos,
subscribe to podcast feeds, add direct/YouTube/Vimeo links, organize everything into shows
and episodes, search and filter deeply, and favorite / queue / playlist them while they play.
Ships a **"Dead Terminal"** sci-fi-horror skin (cold black, phosphor-green, blood-red alarms,
monospace, CRT scanlines) plus 10 VS Code themes, switchable in Settings.

Built with **Tauri** (Rust desktop shell) + **React + TypeScript** + **SQLite**.
Cross-platform: **macOS** and **Windows** (Linux should work too).

---

## Features

- ✅ **Desktop app** that plays your **own local video files** and **streaming sources** you add.
- ✅ **One-click import** — pick files and they import instantly; show, title, and episode
  number are auto-derived from each file's embedded tags. Files are **referenced in place,
  never copied** (a big library costs ~0 extra disk).
- ✅ **Streaming sources (zero storage)** — subscribe to **podcast RSS** feeds, add a **direct
  media URL** (.mp4/.m3u8, HLS via hls.js), or a **YouTube/Vimeo** link (iframe embed). Only URLs
  + metadata are stored; media streams from the origin.
- ✅ **Optional downloads** — cache a remote episode locally for offline play (MP4 built in; HLS
  needs ffmpeg, YouTube/Vimeo need yt-dlp — pointed at from Settings, nothing auto-installed).
- ✅ **Shows → episodes**, with metadata: original filename, title, episode #, date,
  description, duration, resolution, **thumbnail** (paste an image or URL). Edit / Delete /
  Reveal via a per-row ⋯ menu; multi-select edit mode for bulk delete / add-to-playlist.
- ✅ **Search** by title or description; **filter** by year, month (e.g. "2020 NOV"),
  episode-number buckets of 100, favorites; sort by episode/date/title with asc/desc.
- ✅ **Player** — a **full-window video** with a centered transport (skip ±10s), auto-hiding
  controls, **progress/resume** (picks up where you left off), and an **Up Next** queue. One
  control surface drives local, direct, HLS, and embedded sources.
- ✅ **Queue** — Play next / Add to queue; auto-advances through the list you played from, then
  auto-shuffles the library.
- ✅ **Mini bar** — collapsing keeps playing as a bottom bar (**audio + controls only**; video is
  viewed in the full player) with the show thumbnail.
- ✅ **Favorite / Playlists** from the player; **Favorites** and **Recently Listened** views;
  **Shows** album-cover grid.
- ✅ **Editable, collapsible sidebar** (`Ctrl/Cmd+B`); **theme picker** (Dead Terminal + 10 VS
  Code skins); cross-platform menu with **Settings** (`Cmd/Ctrl+,`).
- 🔜 Folder-scan import; "relink" moved files; optional YouTube Data API enrichment.

---

## Where your data lives

dub-deck **references video files in place** — only lightweight metadata is stored.

| What | Location | Holds |
|---|---|---|
| Your videos | anywhere on disk | the actual local files (referenced, never copied) |
| Remote media | not stored | streamed from the publisher; only the URL + metadata are saved |
| Downloads (opt-in) | `<app-data>/downloads/` | locally cached copies of remote episodes |
| Metadata DB (**SQLite**) | see per-OS path below | shows, episodes, feeds, playlists, settings, favorites, **paths + progress** |
| Logs (250 MB cap) | `<app-data>/logs/dub-deck.log` | diagnostics + import metrics |

Per-OS app-data folder (`com.dubdeck.app`):
- **macOS:** `~/Library/Application Support/com.dubdeck.app/dubdeck.db`
- **Windows:** `%APPDATA%\com.dubdeck.app\dubdeck.db`
- **Linux:** `~/.local/share/com.dubdeck.app/dubdeck.db`

> Trade-off (like Plex/iTunes): move or rename an original file after import and that
> episode's link breaks — re-import or edit it.

---

## Develop

### Prerequisites (both platforms)
- **Node.js** 18+ (this repo used v24)
- **Rust** (stable) via [rustup](https://rustup.rs)

### macOS extras
- Xcode Command Line Tools: `xcode-select --install`

### Windows extras
- **Microsoft C++ Build Tools** (the "Desktop development with C++" workload)
- **WebView2 runtime** (preinstalled on Windows 11; otherwise install from Microsoft)
- Use PowerShell or Windows Terminal.

### Run it
```bash
git clone <your-repo-url> dub-deck
cd dub-deck
npm install
npm run tauri dev      # launches the desktop app with hot reload
```

### Build a distributable
```bash
npm run tauri build
# macOS   → src-tauri/target/release/bundle/macos/dub-deck.app (+ .dmg)
# Windows → src-tauri/target/release/bundle/{msi,nsis}/*.msi / *-setup.exe
```
Rust is a **build-time dependency only** — the shipped app doesn't need it.

### Launch shortcut
- **macOS:** a `dub-deck` shell function (in `~/.zshrc`) opens the built app if present,
  else runs dev. (Personal to your machine, not in the repo.)
- **Windows:** run the installed app, or `npm run tauri dev` from the repo.

---

## Cross-platform / porting notes (Windows)

- The whole stack (Tauri, the Rust `mp4`/`mp4ameta` crates, the SQL/dialog/fs/opener
  plugins) is cross-platform; no macOS-only code. App-data & log paths resolve correctly
  per-OS via Tauri.
- The **library is per-machine** (the DB and your video files live locally). Porting the
  **code** is what transfers; you re-import your videos on each machine.
- **Playback scope:** `src-tauri/tauri.conf.json → app.security.assetProtocol.scope`
  controls which disk paths may be streamed. It includes `$HOME/**` (covers your user
  profile on every OS, e.g. `C:\Users\you\**` on Windows). If your videos live on another
  drive (e.g. `D:\`), add an entry like `"D:/**"` there.
- Line endings: a `.gitattributes` isn't required, but if you develop on both OSes and see
  churn, consider adding one.

See **`docs/ARCHITECTURE.md`** for the full file/folder map and **`docs/decisions.md`**
for the running record of design decisions.

## Supported video formats
`.mp4 .mkv .mov .webm .avi .m4v` — embedded-tag auto-fill works for MP4-family files.
