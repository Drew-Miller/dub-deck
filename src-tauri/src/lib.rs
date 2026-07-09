use std::io::Write;
use std::path::PathBuf;
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{Emitter, Manager};
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

/// True if `path` is a runnable version of the tool. Tries both `--version`
/// (yt-dlp) and `-version` (ffmpeg's single-dash flag) so a valid ffmpeg isn't
/// reported as missing. Surrounding quotes/whitespace (common when pasting a
/// Windows path) are stripped first.
fn tool_responds(path: &str) -> bool {
    let p = path.trim().trim_matches('"').trim();
    if p.is_empty() {
        return false;
    }
    ["--version", "-version"].iter().any(|flag| {
        std::process::Command::new(p)
            .arg(flag)
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    })
}

/// True if the given binary path runs a version query successfully (Settings tool status).
#[tauri::command]
fn check_tool(path: String) -> bool {
    tool_responds(&path)
}

/// Recursively search `dir` (bounded by `depth`) for a file named exactly `name`,
/// returning the first match. Used to dig binaries out of WinGet's per-package
/// folders (e.g. ffmpeg lands in `WinGet\Packages\Gyan.FFmpeg_*\...\bin\ffmpeg.exe`).
fn find_binary(dir: &std::path::Path, name: &str, depth: u8) -> Option<String> {
    let entries = std::fs::read_dir(dir).ok()?;
    let mut subdirs: Vec<PathBuf> = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            subdirs.push(path);
        } else if path.file_name().and_then(|n| n.to_str()) == Some(name) {
            return path.to_str().map(|s| s.to_string());
        }
    }
    if depth == 0 {
        return None;
    }
    for sub in subdirs {
        if let Some(hit) = find_binary(&sub, name, depth - 1) {
            return Some(hit);
        }
    }
    None
}

/// Auto-locate an installed binary (`yt-dlp`, `ffmpeg`, …) so non-technical users
/// don't have to hunt for a path. Builds a candidate list — the OS locator
/// (`where`/`which`), common install locations, and a bounded scan of WinGet's
/// package folders — and returns the first candidate that responds, else `None`.
#[tauri::command]
fn detect_tool(name: String) -> Option<String> {
    let name = name.trim();
    if name.is_empty() {
        return None;
    }

    let mut candidates: Vec<String> = Vec::new();

    // 1) Ask the OS where the binary lives. Each stdout line is a candidate.
    #[cfg(windows)]
    {
        // On Windows also try the `.exe` form so `where` finds it either way.
        for query in [name.to_string(), format!("{name}.exe")] {
            if let Ok(out) = std::process::Command::new("where").arg(&query).output() {
                if out.status.success() {
                    for line in String::from_utf8_lossy(&out.stdout).lines() {
                        let line = line.trim();
                        if !line.is_empty() {
                            candidates.push(line.to_string());
                        }
                    }
                }
            }
        }
    }
    #[cfg(not(windows))]
    {
        if let Ok(out) = std::process::Command::new("which").arg(name).output() {
            if out.status.success() {
                for line in String::from_utf8_lossy(&out.stdout).lines() {
                    let line = line.trim();
                    if !line.is_empty() {
                        candidates.push(line.to_string());
                    }
                }
            }
        }
    }

    // 2) Append common install locations (env-based paths skipped if unset).
    #[cfg(windows)]
    {
        let exe = format!("{name}.exe");
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            candidates.push(format!("{local}\\Microsoft\\WinGet\\Links\\{exe}"));
            // WinGet extracts zip packages (like Gyan.FFmpeg) under Packages\ without a
            // Links shim, so scan that tree for the binary.
            let packages = std::path::Path::new(&local).join("Microsoft\\WinGet\\Packages");
            if let Some(hit) = find_binary(&packages, &exe, 6) {
                candidates.push(hit);
            }
        }
        if let Ok(home) = std::env::var("USERPROFILE") {
            candidates.push(format!("{home}\\scoop\\shims\\{exe}"));
        }
        candidates.push(format!("C:\\ProgramData\\chocolatey\\bin\\{exe}"));
        candidates.push(format!("C:\\Program Files\\{name}\\bin\\{exe}"));
        candidates.push(format!("C:\\{name}\\bin\\{exe}"));
    }
    #[cfg(not(windows))]
    {
        candidates.push(format!("/opt/homebrew/bin/{name}"));
        candidates.push(format!("/usr/local/bin/{name}"));
        candidates.push(format!("/usr/bin/{name}"));
        if let Ok(home) = std::env::var("HOME") {
            candidates.push(format!("{home}/.local/bin/{name}"));
        }
    }

    // 3) Verify each candidate; first one that responds wins.
    candidates.into_iter().find(|candidate| tool_responds(candidate))
}

/// Verified tool paths, persisted to `<app_data>/tools.json` (see read/write below).
#[derive(serde::Serialize, serde::Deserialize, Default)]
struct ToolConfig {
    #[serde(default)]
    ytdlp: String,
    #[serde(default)]
    ffmpeg: String,
}

fn tool_config_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    Some(app.path().app_data_dir().ok()?.join("tools.json"))
}

/// Read the persisted tool paths. Missing/unreadable file → empty config.
#[tauri::command]
fn read_tool_config(app: tauri::AppHandle) -> ToolConfig {
    tool_config_path(&app)
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

/// Persist verified tool paths to the local config file (JSON).
#[tauri::command]
fn write_tool_config(app: tauri::AppHandle, ytdlp: String, ffmpeg: String) -> Result<(), String> {
    let path = tool_config_path(&app).ok_or("no app data dir")?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let cfg = ToolConfig { ytdlp, ffmpeg };
    let json = serde_json::to_string_pretty(&cfg).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
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

/// Save raw image bytes (e.g. a pasted thumbnail) to `dest`.
#[tauri::command]
fn save_thumbnail(dest: String, data: Vec<u8>) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&dest).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&dest, &data).map_err(|e| e.to_string())?;
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
        },
        Migration {
            version: 6,
            description: "playback progress: resume position, last-played, finished",
            kind: MigrationKind::Up,
            sql: "
            ALTER TABLE episodes ADD COLUMN position REAL;
            ALTER TABLE episodes ADD COLUMN played_at TEXT;
            ALTER TABLE episodes ADD COLUMN finished INTEGER NOT NULL DEFAULT 0;
            CREATE INDEX IF NOT EXISTS idx_episodes_played ON episodes(played_at);
        ",
        },
        Migration {
            version: 7,
            description: "favorite shows",
            kind: MigrationKind::Up,
            sql: "ALTER TABLE shows ADD COLUMN favorited INTEGER NOT NULL DEFAULT 0;",
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

            // Cross-platform menu with a Preferences item (Cmd/Ctrl+,) that opens
            // Settings, plus a standard Edit submenu so clipboard shortcuts work.
            let prefs = MenuItemBuilder::new("Preferences…")
                .id("preferences")
                .accelerator("CmdOrCtrl+,")
                .build(app)?;
            let app_menu = SubmenuBuilder::new(app, "dub-deck")
                .item(&prefs)
                .separator()
                .quit()
                .build()?;
            let edit_menu = SubmenuBuilder::new(app, "Edit")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()?;
            let menu = MenuBuilder::new(app).items(&[&app_menu, &edit_menu]).build()?;
            app.set_menu(menu)?;
            app.on_menu_event(|app, event| {
                if event.id() == "preferences" {
                    let _ = app.emit("open-settings", ());
                }
            });

            Ok(())
        });

    builder
        .invoke_handler(tauri::generate_handler![
            read_media_tags,
            append_log,
            resolve_scrape,
            check_tool,
            detect_tool,
            read_tool_config,
            write_tool_config,
            download_media,
            download_hls,
            download_scrape,
            save_thumbnail,
            remove_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
