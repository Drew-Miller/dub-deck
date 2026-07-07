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
}

/// Read embedded title/artist/duration from an MP4-family file (mp4/m4v/mov).
/// Used by the import dialog to auto-fill show, title, and episode number so the
/// user doesn't have to type what's already inside the file.
#[tauri::command]
fn read_media_tags(app: tauri::AppHandle, path: String) -> MediaTags {
    match mp4ameta::Tag::read_from_path(&path) {
        Ok(tag) => MediaTags {
            title: tag.title().map(|s| s.to_string()),
            artist: tag.artist().map(|s| s.to_string()),
            duration: tag.duration().map(|d| d.as_secs_f64()),
        },
        Err(e) => {
            write_log_line(&app, &format!("[read_media_tags] no tags for {path}: {e}"));
            MediaTags {
                title: None,
                artist: None,
                duration: None,
            }
        }
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
    }];

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
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
        })
        .invoke_handler(tauri::generate_handler![read_media_tags, append_log])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
