// EpisodeRow — the single episode row shared by every episode list (Library,
// Favorites, Recently Listened, Playlists, Show detail) so they all look and behave
// the same: thumbnail, episode number, title/show, source badge, watch progress, a
// hover play button, an optional download control, and a ⋯ menu (Play next / Add to
// queue / Download / Edit / Reveal / Delete). Views pass the ordered `list` + `label`
// that playback should use as its context, plus the loaded `tools`.

import { useEffect, useState } from "react";
import type { JSX, ReactNode } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type { Episode } from "../types";
import { deleteEpisode } from "../lib/db";
import { downloadEpisode, removeDownload, downloadState, type Tools } from "../lib/downloads";
import { usePlayer, useBumpLibrary } from "../lib/state";
import { log } from "../lib/log";
import RowThumb from "./RowThumb";
import EditEpisodeDialog from "./EditEpisodeDialog";
import "./EpisodeRow.css";

/** Per-source-type label + color class for the row badge. */
const SOURCE_META: Record<string, { label: string; cls: string }> = {
  file: { label: "Local", cls: "src-file" },
  rss: { label: "Podcast", cls: "src-rss" },
  direct_url: { label: "URL", cls: "src-url" },
  youtube: { label: "YouTube", cls: "src-youtube" },
  vimeo: { label: "Vimeo", cls: "src-vimeo" },
  scrape: { label: "Scrape", cls: "src-scrape" },
};

const IconCloudDownload = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 19a4 4 0 0 1-.4-7.98A6 6 0 0 1 18 8a4.5 4.5 0 0 1 .5 8.98" />
    <path d="M12 11.5v5" />
    <path d="M9.5 14l2.5 2.5 2.5-2.5" />
  </svg>
);
const IconCheck = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M9.6 16.6L4.4 11.4 5.8 10l3.8 3.8L18.2 5.2 19.6 6.6z" />
  </svg>
);

function formatDate(iso: string | null): string {
  return iso ?? "—";
}

export interface EpisodeRowProps {
  episode: Episode;
  /** The ordered list playback should walk (the current filtered/sorted view). */
  list: Episode[];
  /** Context label shown in the player ("Library", a show/playlist name, …). */
  label: string;
  tools: Tools;
  /** Multi-select mode (Library edit): show a checkbox, click toggles instead of plays. */
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: number) => void;
  /** Extra menu items rendered at the top of the ⋯ menu (e.g. Remove from playlist). */
  extraMenuItems?: ReactNode;
}

export default function EpisodeRow({
  episode: ep,
  list,
  label,
  tools,
  selectMode = false,
  selected = false,
  onToggleSelect,
  extraMenuItems,
}: EpisodeRowProps): JSX.Element {
  const player = usePlayer();
  const bump = useBumpLibrary();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  const isCurrent = player.current?.id === ep.id;
  const dl = downloadState(ep, tools);
  const src = SOURCE_META[ep.source_type] ?? { label: ep.source_type, cls: "" };

  const playThis = () => player.play(ep, list, label);
  const activate = () => (selectMode ? onToggleSelect?.(ep.id) : playThis());

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = () => setMenuOpen(false);
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const onDownload = async () => {
    setMenuOpen(false);
    try {
      await downloadEpisode(ep);
      bump();
    } catch (e) {
      log.warn("download failed", { id: ep.id, error: String(e) });
    }
  };
  const onRemoveDownload = async () => {
    setMenuOpen(false);
    try {
      await removeDownload(ep);
      bump();
    } catch (e) {
      log.warn("remove download failed", { id: ep.id, error: String(e) });
    }
  };
  const onReveal = async () => {
    setMenuOpen(false);
    try {
      await revealItemInDir(ep.file_path);
    } catch (e) {
      log.warn("reveal in finder failed", { error: String(e) });
    }
  };
  const onDelete = async () => {
    setMenuOpen(false);
    await deleteEpisode(ep.id);
    bump();
  };

  return (
    <div
      className={`episode-row${isCurrent ? " current" : ""}${selectMode && selected ? " selected" : ""}`}
      role="button"
      tabIndex={0}
      onClick={activate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activate();
        }
      }}
    >
      {selectMode && (
        <div className="episode-check" aria-hidden="true">
          {selected ? "☑" : "☐"}
        </div>
      )}
      <RowThumb ep={ep} />
      {ep.episode_number != null && <div className="episode-num">{ep.episode_number}</div>}

      <div className="grow episode-main">
        <div className="episode-title truncate">{ep.title}</div>
        <div className="episode-sub muted truncate">
          {ep.show_title ?? "Unknown show"} · {formatDate(ep.published_date)}
        </div>
        {ep.duration && ep.position ? (
          <div className="episode-progress" title={`${Math.round((ep.position / ep.duration) * 100)}% watched`}>
            <div
              className="episode-progress-fill"
              style={{ width: `${Math.min(100, (ep.position / ep.duration) * 100)}%` }}
            />
          </div>
        ) : null}
      </div>

      <div className="episode-flags">
        {ep.finished && <span className="src-badge src-finished" title="Finished">✓</span>}
        <span className={`src-badge ${src.cls}`} title={`Source: ${src.label}`}>{src.label}</span>
        {ep.download_path && <span className="src-badge src-downloaded" title="Downloaded">⬇</span>}
        {ep.favorited && <span className="flag fav" title="Favorite">♥</span>}
      </div>

      {!selectMode && (
        <button
          className="icon-btn play-btn"
          title="Play"
          onClick={(e) => {
            e.stopPropagation();
            playThis();
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>
      )}

      {!selectMode && dl !== "none" && (
        <button
          className={`icon-btn dl-btn${dl === "downloaded" ? " active" : ""}`}
          title={dl === "downloaded" ? "Downloaded — remove" : dl === "needs-ytdlp" ? "Enable yt-dlp in Settings" : dl === "needs-ffmpeg" ? "Enable ffmpeg in Settings" : "Download"}
          disabled={dl === "needs-ytdlp" || dl === "needs-ffmpeg"}
          onClick={(e) => { e.stopPropagation(); if (dl === "downloaded") void onRemoveDownload(); else void onDownload(); }}
        >
          {dl === "downloaded" ? <IconCheck /> : <IconCloudDownload />}
        </button>
      )}

      {!selectMode && (
        <div className="row-menu-wrap" onClick={(e) => e.stopPropagation()}>
          <button
            className="icon-btn"
            title="More"
            aria-haspopup="menu"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
          >
            <span aria-hidden="true">⋯</span>
          </button>
          {menuOpen && (
            <div className="row-menu card" role="menu" onMouseDown={(e) => e.stopPropagation()}>
              {extraMenuItems && (
                <>
                  {extraMenuItems}
                  <div className="row-menu-sep" />
                </>
              )}
              <button role="menuitem" onClick={() => { setMenuOpen(false); player.playNext(ep); }}>
                <span className="row-menu-icon" aria-hidden="true">⏭</span> Play next
              </button>
              <button role="menuitem" onClick={() => { setMenuOpen(false); player.addToQueue(ep); }}>
                <span className="row-menu-icon" aria-hidden="true">＋</span> Add to queue
              </button>
              {dl !== "none" && (
                <>
                  <div className="row-menu-sep" />
                  {dl === "downloaded" && (
                    <button role="menuitem" onClick={() => void onRemoveDownload()}>
                      <span className="row-menu-icon" aria-hidden="true">✓</span> Remove download
                    </button>
                  )}
                  {dl === "available" && (
                    <button role="menuitem" onClick={() => void onDownload()}>
                      <span className="row-menu-icon" aria-hidden="true">⬇</span> Download
                    </button>
                  )}
                  {dl === "needs-ytdlp" && (
                    <button role="menuitem" disabled title="Enable yt-dlp in Settings">
                      <span className="row-menu-icon" aria-hidden="true">⬇</span> Download (needs yt-dlp)
                    </button>
                  )}
                  {dl === "needs-ffmpeg" && (
                    <button role="menuitem" disabled title="Enable ffmpeg in Settings">
                      <span className="row-menu-icon" aria-hidden="true">⬇</span> Download (needs ffmpeg)
                    </button>
                  )}
                </>
              )}
              <div className="row-menu-sep" />
              <button role="menuitem" onClick={() => { setMenuOpen(false); setEditing(true); }}>
                <span className="row-menu-icon" aria-hidden="true">✎</span> Edit metadata
              </button>
              {ep.source_type === "file" && (
                <button role="menuitem" onClick={() => void onReveal()}>
                  <span className="row-menu-icon" aria-hidden="true">↗</span> Reveal in Finder
                </button>
              )}
              <div className="row-menu-sep" />
              <button role="menuitem" className="row-menu-danger" onClick={() => void onDelete()}>
                <span className="row-menu-icon" aria-hidden="true">🗑</span> Delete episode
              </button>
            </div>
          )}
        </div>
      )}

      {editing && (
        <EditEpisodeDialog
          episode={ep}
          onSaved={() => bump()}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}
