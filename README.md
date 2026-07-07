# dub-deck 🔀📼

A **local desktop podcast/video player** — think a personal YouTube for the video
files already on your computer. Import your own video files, organize them into shows
and episodes, search and filter deeply, and like / favorite / playlist them while they
play. Styled with a warm **retro hi-fi / cassette-deck** look (amber LED accents,
monospace episode counters).

Built with **Tauri** (Rust desktop shell) + **React + TypeScript** + **SQLite**.

---

## Requirements (as specified)

This is the running list of what dub-deck is meant to do, captured from the project
brief. ✅ = built, 🔜 = planned.

### Core concept
- ✅ A **desktop GUI app** (installed program), not a website.
- ✅ Play **your own local video files** in a **YouTube-style player** (they are *not*
  YouTube links — actual files on disk).
- ✅ **Import** files that already live on your computer, then browse/play them in-app.
- ✅ **Storage-conscious**: reference video files **in place — never copy or move them**,
  because a user's disk may not hold a large library. Only tiny metadata is stored.

### Organization
- ✅ **Shows** (podcasts) and **episodes** under them.
- ✅ Per-episode metadata: **show, episode number, title, description, date**.
- ✅ **Edit** any episode's metadata after import (and delete episodes).

### Search & filtering
- ✅ **Search by title or description** (description captured at import).
- ✅ **Filter by year** (2017, 2018, 2020 …).
- ✅ **Filter by date range down to month** (2020 NOV, 2020 DEC …).
- ✅ **Filter by episode range in buckets of 100** (1–100, 100–200, 200–300 …).
- ✅ Filter by **Liked** / **Favorited**, plus sorting.

### Playback & collections (Spotify / Apple Music style)
- ✅ **Like** episodes.
- ✅ **Favorite** episodes.
- ✅ **Make playlists** and add episodes to them.
- ✅ Do all of the above **while the episode is playing**, from the player.

### Discovery
- ✅ **Random / shuffle play** an episode across **multiple shows** at once (choose which
  shows are in the mix, or shuffle everything; also build a shuffled queue of N).

### Import
- ✅ Import **individual files**.
- 🔜 Import a **whole folder** (scan a directory for videos).

### Look & feel
- ✅ Distinct **retro hi-fi** aesthetic (deliberately *not* Apple Music).

---

## Why it won't fill up your disk

Three separate things live in three places (see `ARCHITECTURE.md`):

| | Where | Holds |
|---|---|---|
| Your videos | `media/` (or anywhere on disk) | the actual files — referenced, never copied |
| Metadata DB | `~/Library/Application Support/com.dubdeck.app/dubdeck.db` | titles, descriptions, likes, playlists, **file paths** |
| — | | (no video bytes are ever duplicated) |

> Trade-off (same as Plex/iTunes): if you move or rename an original file after import,
> that episode's link breaks and needs re-importing/editing.

---

## Getting started

1. Put video files anywhere (a convenient spot is `~/Developer/dub-deck/media/`).
2. Run the app (below).
3. Click **＋ Import episodes**, choose your files, fill in show/number/title/date/description.
4. Click an episode to play. Use ♥ like, ★ favorite, ＋ add-to-playlist while it plays.
5. Explore **Library** (search + filters), **Shuffle**, **Playlists**, **Liked & Favorites**.

## Run

```bash
cd ~/Developer/dub-deck
npm run tauri dev      # desktop app, dev mode with hot reload
npm run tauri build    # produce a native .app bundle
```

Requires the Rust toolchain (via rustup) and Node.js. Rust is a **build-time
dependency only** — the shipped app doesn't need it.

## Learn more

- **`ARCHITECTURE.md`** — full file/folder map, data model, and storage locations.

## Supported video formats

`.mp4 .mkv .mov .webm .avi .m4v`
