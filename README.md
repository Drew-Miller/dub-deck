# dub-deck 🔀📼

A **local desktop podcast/video player** — a personal "YouTube" for the video files
you already have on disk. Import your own videos, organize them into shows and episodes,
search and filter deeply, and like / favorite / playlist them while they play.
Themed as a **"Dead Terminal"** sci-fi-horror console (cold black, phosphor-green
readouts, blood-red alarms, monospace, CRT scanlines).

Built with **Tauri** (Rust desktop shell) + **React + TypeScript** + **SQLite**.
Cross-platform: **macOS** and **Windows** (Linux should work too).

---

## Features

- ✅ **Desktop app** that plays your **own local video files** (not YouTube links).
- ✅ **One-click import** — pick files and they import instantly; show, title, and episode
  number are auto-derived from each file's embedded tags. Files are **referenced in place,
  never copied** (a big library costs ~0 extra disk).
- ✅ **Shows → episodes**, with metadata: original filename, title, episode #, date,
  description, duration, resolution. **Edit / Delete / Reveal-in-Finder** via a per-row ⋯ menu.
- ✅ **Search** by title or description; **filter** by year, month (e.g. "2020 NOV"),
  episode-number buckets of 100 (1–100, 100–200…), liked/favorited; sort by episode/date/title.
- ✅ **Now Playing** — clicking an episode opens a **full-window video** with auto-hiding
  overlay controls, a back arrow, and the show's other episodes in a side drawer.
- ✅ **Mini bar** — collapsing keeps playing as an Apple-Music-style bottom bar (**audio +
  controls only**; video is viewed in the full player).
- ✅ **Like / Favorite / Playlists** from the player; **Liked & Favorites** views.
- ✅ **Shuffle** random play across any mix of shows (or a shuffled queue of N).
- 🔜 Folder-scan import; optional YouTube Data API enrichment (URL/description/air-date).

---

## Where your data lives

dub-deck **references video files in place** — only lightweight metadata is stored.

| What | Location | Holds |
|---|---|---|
| Your videos | `media/` or anywhere on disk | the actual files (referenced, never copied) |
| Metadata DB (**SQLite**) | see per-OS path below | shows, episodes, likes, playlists, **file paths** |
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

See **`ARCHITECTURE.md`** for the full file/folder map and **`.claude/docs/decisions.md`**
for the running record of design decisions.

## Supported video formats
`.mp4 .mkv .mov .webm .avi .m4v` — embedded-tag auto-fill works for MP4-family files.
