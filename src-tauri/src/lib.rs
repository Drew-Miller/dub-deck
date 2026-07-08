use std::io::Write;
use std::path::PathBuf;
use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

/// Hard cap on the local log file. When it reaches this size it is deleted and
/// started fresh, so dub-deck never keeps more than ~250 MB of logs on disk.
const LOG_CAP_BYTES: u64 = 250 * 1024 * 1024;

/// Resolve (and create) the logs directory inside the app's data folder:
/// `<app_data_dir>/logs/dub-deck.log`.
fn log_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_data_dir().ok()?.join("logs");
    std::fs::create_dir_all(&dir).ok()?;
    Some(dir.join("dub-deck.log"))
}

/// Append one line to the log, enforcing the 250 MB cap on every write
/// (the file is deleted and restarted once it reaches the cap).
fn write_log_line(app: &tauri::AppHandle, line: &str) {
    let Some(path) = log_path(app) else { return };
    if let Ok(meta) = std::fs::metadata(&path) {
        if meta.len() >= LOG_CAP_BYTES {
            let _ = std::fs::remove_file(&path);
        }
    }
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
        let _ = writeln!(f, "{line}");
    }
}

/// Frontend logging sink. The frontend formats the timestamped line; Rust just
/// persists it (and enforces the size cap).
#[tauri::command]
fn append_log(app: tauri::AppHandle, line: String) {
    write_log_line(&app, &line);
}

/// Metadata read from a media file's embedded tags. All fields are optional —
/// non-MP4 files (or files without tags) simply come back empty.
#[derive(serde::Serialize)]
struct MediaTags {
    title: Option<String>,
    artist: Option<String>,
    duration: Option<f64>,
    width: Option<u16>,
    height: Option<u16>,
}

/// Read the first video track's pixel dimensions (for a quality badge).
fn read_dimensions(path: &str) -> Option<(u16, u16)> {
    let file = std::fs::File::open(path).ok()?;
    let size = file.metadata().ok()?.len();
    let reader = std::io::BufReader::new(file);
    let mp4 = mp4::Mp4Reader::read_header(reader, size).ok()?;
    for track in mp4.tracks().values() {
        if matches!(track.track_type(), Ok(mp4::TrackType::Video)) {
            return Some((track.width(), track.height()));
        }
    }
    None
}

/// Read embedded title/artist/duration from an MP4-family file (mp4/m4v/mov).
/// Used by the import dialog to auto-fill show, title, and episode number so the
/// user doesn't have to type what's already inside the file.
#[tauri::command]
fn read_media_tags(app: tauri::AppHandle, path: String) -> MediaTags {
    let (width, height) = match read_dimensions(&path) {
        Some((w, h)) => (Some(w), Some(h)),
        None => (None, None),
    };
    match mp4ameta::Tag::read_from_path(&path) {
        Ok(tag) => MediaTags {
            title: tag.title().map(|s| s.to_string()),
            artist: tag.artist().map(|s| s.to_string()),
            duration: tag.duration().map(|d| d.as_secs_f64()),
            width,
            height,
        },
        Err(e) => {
            write_log_line(&app, &format!("[read_media_tags] no tags for {path}: {e}"));
            MediaTags {
                title: None,
                artist: None,
                duration: None,
                width,
                height,
            }
        }
    }
}

/// Extracted stream for a scraped source (yt-dlp -g).
#[derive(serde::Serialize)]
struct ScrapeResult {
    stream_url: String,
    is_hls: bool,
}

/// Resolve a playable stream URL from a watch URL using a user-configured yt-dlp.
/// Enabled at runtime via Settings (the caller passes the configured `ytdlp` path);
/// errors if unconfigured. Scraping violates some sites' ToS and yields IP-locked,
/// short-lived URLs. See `docs/handoff.md`.
#[tauri::command]
fn resolve_scrape(url: String, ytdlp: String) -> Result<ScrapeResult, String> {
    if ytdlp.trim().is_empty() {
        return Err("yt-dlp is not configured (Settings \u{203a} Tools).".into());
    }
    let out = std::process::Command::new(&ytdlp)
        .args(["-g", "-f", "best", &url])
        .output()
        .map_err(|e| format!("yt-dlp not runnable: {e}"))?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    let stream_url = String::from_utf8_lossy(&out.stdout)
        .lines()
        .next()
        .unwrap_or("")
        .trim()
        .to_string();
    if stream_url.is_empty() {
        return Err("yt-dlp returned no stream URL".into());
    }
    let is_hls = stream_url.contains(".m3u8");
    Ok(ScrapeResult { stream_url, is_hls })
}

/// True if the given binary path runs `--version` successfully (Settings tool status).
#[tauri::command]
fn check_tool(path: String) -> bool {
    if path.trim().is_empty() {
        return false;
    }
    std::process::Command::new(&path)
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Download a direct media file (mp4/etc.) to `dest`, streaming to disk.
#[tauri::command]
fn download_media(url: String, dest: String) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&dest).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut resp = reqwest::blocking::get(&url).map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    let mut file = std::fs::File::create(&dest).map_err(|e| e.to_string())?;
    std::io::copy(&mut resp, &mut file).map_err(|e| e.to_string())?;
    Ok(())
}

/// Download + remux an HLS (.m3u8) stream to `dest` via a user-configured ffmpeg.
#[tauri::command]
fn download_hls(url: String, dest: String, ffmpeg: String) -> Result<(), String> {
    if ffmpeg.trim().is_empty() {
        return Err("ffmpeg is not configured (Settings \u{203a} Tools).".into());
    }
    if let Some(parent) = std::path::Path::new(&dest).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let out = std::process::Command::new(&ffmpeg)
        .args(["-y", "-i", &url, "-c", "copy", &dest])
        .output()
        .map_err(|e| format!("ffmpeg not runnable: {e}"))?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(())
}

/// Download a YouTube/Vimeo video to `dest` via a user-configured yt-dlp.
#[tauri::command]
fn download_scrape(url: String, dest: String, ytdlp: String) -> Result<(), String> {
    if ytdlp.trim().is_empty() {
        return Err("yt-dlp is not configured (Settings \u{203a} Tools).".into());
    }
    if let Some(parent) = std::path::Path::new(&dest).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let out = std::process::Command::new(&ytdlp)
        .args(["-f", "best", "-o", &dest, &url])
        .output()
        .map_err(|e| format!("yt-dlp not runnable: {e}"))?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(())
}

/// Delete a downloaded file (best-effort; ok if already gone).
#[tauri::command]
fn remove_file(path: String) -> Result<(), String> {
    match std::fs::remove_file(&path) {
        Ok(_) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![Migration {
        version: 1,
        description: "create initial dub-deck schema",
        kind: MigrationKind::Up,
        sql: "
            CREATE TABLE IF NOT EXISTS shows (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                title      TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS episodes (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                show_id        INTEGER NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
                title          TEXT NOT NULL,
                description    TEXT NOT NULL DEFAULT '',
                episode_number INTEGER,
                published_date TEXT,               -- ISO 'YYYY-MM-DD'
                file_path      TEXT NOT NULL,       -- absolute path on disk (referenced, not copied)
                duration       REAL,                -- seconds, filled in after first play
                liked          INTEGER NOT NULL DEFAULT 0,
                favorited      INTEGER NOT NULL DEFAULT 0,
                liked_at       TEXT,
                favorited_at   TEXT,
                added_at       TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE INDEX IF NOT EXISTS idx_episodes_show      ON episodes(show_id);
            CREATE INDEX IF NOT EXISTS idx_episodes_number    ON episodes(episode_number);
            CREATE INDEX IF NOT EXISTS idx_episodes_date      ON episodes(published_date);
            CREATE INDEX IF NOT EXISTS idx_episodes_liked     ON episodes(liked);
            CREATE INDEX IF NOT EXISTS idx_episodes_favorited ON episodes(favorited);

            CREATE TABLE IF NOT EXISTS playlists (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                name       TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS playlist_items (
                playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
                episode_id  INTEGER NOT NULL REFERENCES episodes(id)  ON DELETE CASCADE,
                position    INTEGER NOT NULL DEFAULT 0,
                added_at    TEXT NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (playlist_id, episode_id)
            );

            CREATE INDEX IF NOT EXISTS idx_playlist_items_pl ON playlist_items(playlist_id, position);
        ",
        },
        Migration {
            version: 2,
            description: "keep original file metadata (filename, raw title, resolution)",
            kind: MigrationKind::Up,
            sql: "
            ALTER TABLE episodes ADD COLUMN original_filename TEXT;
            ALTER TABLE episodes ADD COLUMN original_title TEXT;
            ALTER TABLE episodes ADD COLUMN video_height INTEGER;
        ",
        },
        Migration {
            version: 3,
            description: "remote streaming sources: feeds table + source columns on episodes",
            kind: MigrationKind::Up,
            sql: "
            CREATE TABLE IF NOT EXISTS feeds (
                id                INTEGER PRIMARY KEY AUTOINCREMENT,
                show_id           INTEGER REFERENCES shows(id) ON DELETE SET NULL,
                feed_url          TEXT NOT NULL UNIQUE,
                title             TEXT,
                site_url          TEXT,
                thumbnail_url     TEXT,
                last_refreshed_at TEXT,
                created_at        TEXT NOT NULL DEFAULT (datetime('now'))
            );

            -- source_type keys every playback/UI decision; file_path stays NOT NULL
            -- (remote episodes store '') to avoid a risky table rebuild. No CHECK on
            -- source_type so a future 'scrape' value needs no migration.
            ALTER TABLE episodes ADD COLUMN source_type   TEXT NOT NULL DEFAULT 'file';
            ALTER TABLE episodes ADD COLUMN source_url    TEXT;
            ALTER TABLE episodes ADD COLUMN thumbnail_url TEXT;
            ALTER TABLE episodes ADD COLUMN feed_id       INTEGER REFERENCES feeds(id) ON DELETE SET NULL;
            ALTER TABLE episodes ADD COLUMN guid          TEXT;

            CREATE INDEX IF NOT EXISTS idx_episodes_feed        ON episodes(feed_id);
            CREATE INDEX IF NOT EXISTS idx_episodes_source_type ON episodes(source_type);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_episodes_feed_guid
                ON episodes(feed_id, guid) WHERE feed_id IS NOT NULL AND guid IS NOT NULL;
        ",
        },
        Migration {
            version: 4,
            description: "favorites-only: drop likes; add show image_url",
            kind: MigrationKind::Up,
            sql: "
            DROP INDEX IF EXISTS idx_episodes_liked;
            ALTER TABLE episodes DROP COLUMN liked;
            ALTER TABLE episodes DROP COLUMN liked_at;
            ALTER TABLE shows ADD COLUMN image_url TEXT;
        ",
        },
        Migration {
            version: 5,
            description: "downloads + settings: episodes.download_path, settings key/value table",
            kind: MigrationKind::Up,
            sql: "
            ALTER TABLE episodes ADD COLUMN download_path TEXT;
            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
        ",
    }];

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_sql::Builder::new()
                .add_migrations("sqlite:dubdeck.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Enforce the log cap once at startup, then record the session start.
            let handle = app.handle().clone();
            if let Some(path) = log_path(&handle) {
                if let Ok(meta) = std::fs::metadata(&path) {
                    if meta.len() >= LOG_CAP_BYTES {
                        let _ = std::fs::remove_file(&path);
                    }
                }
            }
            write_log_line(&handle, "[startup] dub-deck launched");
            Ok(())
        });

    builder
        .invoke_handler(tauri::generate_handler![
            read_media_tags,
            append_log,
            resolve_scrape,
            check_tool,
            download_media,
            download_hls,
            download_scrape,
            remove_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
