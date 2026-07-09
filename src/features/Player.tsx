// Global media player for dub-deck. Mounted once by App.tsx. Two modes driven by
// player.expanded:
//   • expanded  → full-window video with auto-hiding overlay controls: a centered
//                 transport (skip / play / skip), the title top-left, an ✕ (top-right)
//                 that collapses to the mini bar, and an Up Next queue on the right.
//   • collapsed → an Apple-Music-style mini bar pinned at the bottom (keeps playing).
// A single <video>/<iframe> stage is reused across both modes so playback never restarts.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import Hls from "hls.js";
import { usePlayer, useBumpLibrary } from "../lib/state";
import {
  toggleFavorite,
  setDuration,
  listPlaylists,
  createPlaylist,
  addToPlaylist,
  listRandomEpisodes,
  markPlayed,
  savePosition,
} from "../lib/db";
import { resolveMedia, type ResolvedMedia } from "../lib/sources";
import { createIframeAdapter, type IframeAdapter } from "../lib/iframePlayer";
import { log } from "../lib/log";
import { downloadEpisode, removeDownload, downloadState, loadTools, type Tools } from "../lib/downloads";
import type { Playlist } from "../types";
import "./Player.css";

/** Uniform playback control surface over the native <video> and iframe embeds. */
interface Transport {
  play(): void;
  pause(): void;
  paused(): boolean;
  seek(t: number): void;
  setVolume(v: number): void;
  setMuted(m: boolean): void;
}

const AUTO_HIDE_MS = 1500;
const SKIP_SECONDS = 10;

function fmt(t: number): string {
  if (!Number.isFinite(t) || t < 0) return "0:00";
  const s = Math.floor(t);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

// ---- icons: 80s-sci-fi transport + modern action glyphs (glow comes from CSS) ----
const V = { viewBox: "0 0 24 24", "aria-hidden": true } as const;
const IconPlay = () => (<svg width="26" height="26" fill="currentColor" {...V}><path d="M7 4.5v15a.6.6 0 0 0 .92.5l12-7.5a.6.6 0 0 0 0-1l-12-7.5A.6.6 0 0 0 7 4.5z" /></svg>);
const IconPause = () => (<svg width="26" height="26" fill="currentColor" {...V}><path d="M7 4.6h3.4v14.8H7zM13.6 4.6H17v14.8h-3.4z" /></svg>);
const IconBack10 = () => (<svg width="26" height="26" fill="currentColor" {...V}><path d="M12 6v12L3.5 12 12 6zM21 6v12l-8.5-6L21 6z" /></svg>);
const IconFwd10 = () => (<svg width="26" height="26" fill="currentColor" {...V}><path d="M12 6v12l8.5-6L12 6zM3 6v12l8.5-6L3 6z" /></svg>);
const IconList = () => (<svg width="20" height="20" fill="currentColor" {...V}><path d="M4 6h16v2.2H4zM4 10.9h16v2.2H4zM4 15.8h10v2.2H4z" /></svg>);
const IconPlus = () => (<svg width="20" height="20" fill="currentColor" {...V}><path d="M3 6h12v2H3zM3 11h12v2H3zM3 16h8v2H3zM18 12h2v3h3v2h-3v3h-2v-3h-3v-2h3z" /></svg>);
const IconHeart = ({ on }: { on: boolean }) =>
  on
    ? (<svg width="20" height="20" fill="currentColor" {...V}><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" /></svg>)
    : (<svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" {...V}><path d="M12 20.5l-1.3-1.18C6 15 3 12.2 3 8.75 3 6.13 5.02 4 7.5 4c1.6 0 3.1.86 4 2.2C12.4 4.86 13.9 4 15.5 4 17.98 4 20 6.13 20 8.75c0 3.45-3 6.25-7.7 10.57L12 20.5z" /></svg>);
const IconFull = () => (<svg width="20" height="20" fill="currentColor" {...V}><path d="M4 4h6v2H6v4H4zM20 4v6h-2V6h-4V4zM6 18h4v2H4v-6h2zM18 14h2v6h-6v-2h4z" /></svg>);
const IconDownload = ({ done }: { done: boolean }) =>
  done
    ? (<svg width="20" height="20" fill="currentColor" {...V}><path d="M9.6 16.6L4.4 11.4 5.8 10l3.8 3.8L18.2 5.2 19.6 6.6z" /></svg>)
    : (<svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...V}><path d="M7 19a4 4 0 0 1-.4-7.98A6 6 0 0 1 18 8a4.5 4.5 0 0 1 .5 8.98" /><path d="M12 11.5v5" /><path d="M9.5 14l2.5 2.5 2.5-2.5" /></svg>);
const IconShuffle = () => (<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...V}><path d="M16 3h5v5" /><path d="M4 20 21 3" /><path d="M21 16v5h-5" /><path d="M15 15l6 6" /><path d="M4 4l5 5" /></svg>);
const IconVol = ({ muted }: { muted: boolean }) => (
  <svg width="22" height="22" fill="currentColor" {...V}>
    <path d="M3 10v4h3.5L11 17.8V6.2L6.5 10H3z" />
    {muted ? (
      <path d="M15 9.5l4.5 5M19.5 9.5l-4.5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    ) : (
      <>
        <path d="M14.5 8.5a4.2 4.2 0 0 1 0 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M17 6a7.5 7.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </>
    )}
  </svg>
);

export default function Player(): JSX.Element | null {
  const {
    current,
    expanded,
    next,
    close,
    expand,
    collapse,
    upNext,
    manualCount,
    jumpTo,
    removeFromQueue,
    contextLabel,
    playQueue,
  } = usePlayer();
  const bump = useBumpLibrary();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const embedHostRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const hideTimer = useRef<number | null>(null);
  const transportRef = useRef<Transport | null>(null);

  const [media, setMedia] = useState<ResolvedMedia | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [favorited, setFavorited] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [queueOpen, setQueueOpen] = useState(false);
  const [plOpen, setPlOpen] = useState(false);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [newName, setNewName] = useState("");
  const [tools, setTools] = useState<Tools>({ ytdlp: false, ffmpeg: false });
  const [dlDone, setDlDone] = useState(false);

  const currentId = current?.id ?? null;
  const isIframe = media?.kind === "iframe";

  // Resolve the current episode into playable media (file/url/embed).
  useEffect(() => {
    if (!current) {
      setMedia(null);
      return;
    }
    let cancelled = false;
    setMediaError(null);
    resolveMedia(current)
      .then((m) => {
        if (!cancelled) setMedia(m);
      })
      .catch((e) => {
        if (cancelled) return;
        setMedia(null);
        setMediaError(String(e instanceof Error ? e.message : e));
        log.warn("player: resolveMedia failed", { id: current.id, error: String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, [current, currentId]);

  // Attach the native <video> source (hls.js for .m3u8 since WebView2 has no native HLS).
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !media || media.kind !== "native") return;
    let hls: Hls | null = null;
    const nativeHls = el.canPlayType("application/vnd.apple.mpegurl") !== "";
    if (media.isHls && !nativeHls && Hls.isSupported()) {
      hls = new Hls();
      hls.loadSource(media.url);
      hls.attachMedia(el);
    } else {
      el.src = media.url;
    }
    void el.play().catch(() => {});
    return () => {
      if (hls) hls.destroy();
    };
  }, [media]);

  const nativeTransport = useMemo<Transport>(
    () => ({
      play: () => void videoRef.current?.play().catch(() => {}),
      pause: () => videoRef.current?.pause(),
      paused: () => videoRef.current?.paused ?? true,
      seek: (t) => {
        const el = videoRef.current;
        if (el) el.currentTime = t;
      },
      setVolume: (v) => {
        const el = videoRef.current;
        if (el) {
          el.volume = v;
          el.muted = v === 0;
        }
      },
      setMuted: (m) => {
        const el = videoRef.current;
        if (el) el.muted = m;
      },
    }),
    []
  );

  // Native sources drive the transport through the <video> element.
  useEffect(() => {
    if (media?.kind === "native") transportRef.current = nativeTransport;
  }, [media, nativeTransport]);

  // Embed sources (youtube/vimeo) build a player into the host and expose the same
  // transport surface; time/duration/play/ended feed back into the Player's state.
  useEffect(() => {
    if (!media || media.kind !== "iframe" || !media.provider || !media.videoId) return;
    const host = embedHostRef.current;
    if (!host) return;
    let adapter: IframeAdapter | null = null;
    let cancelled = false;
    setTime(0);
    setDur(0);
    createIframeAdapter(media.provider, host, media.videoId, {
      onTime: (t) => { setTime(t); persistProgress(t); },
      onDuration: (d) => {
        setDur(d);
        if (currentId != null && current?.duration == null && Number.isFinite(d)) {
          void setDuration(currentId, d);
        }
      },
      onPlaying: setPlaying,
      onEnded,
    })
      .then((a) => {
        if (cancelled) {
          a.destroy();
          return;
        }
        adapter = a;
        transportRef.current = a;
        const pos = current?.position ?? 0;
        if (pos > 3 && !current?.finished) a.seek(pos);
      })
      .catch((e) => {
        if (cancelled) return;
        setMediaError(String(e instanceof Error ? e.message : e));
        log.warn("player: iframe adapter failed", { id: current?.id, error: String(e) });
      });
    return () => {
      cancelled = true;
      if (adapter) adapter.destroy();
      if (transportRef.current === adapter) transportRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media, currentId]);

  useEffect(() => {
    if (!current) return;
    setFavorited(current.favorited);
    setDlDone(!!current.download_path);
    setPlOpen(false);
    setControlsVisible(true);
    if (currentId != null) void markPlayed(currentId);
  }, [current, currentId]);

  // Throttled resume-position persistence (every ~4s of playback).
  const lastSave = useRef(0);
  const persistProgress = useCallback(
    (t: number) => {
      if (currentId == null) return;
      const now = performance.now();
      if (now - lastSave.current < 4000) return;
      lastSave.current = now;
      void savePosition(currentId, t, false);
    },
    [currentId]
  );

  const onEnded = useCallback(() => {
    if (currentId != null) void savePosition(currentId, 0, true);
    next();
  }, [currentId, next]);

  useEffect(() => {
    loadTools().then(setTools).catch(() => {});
  }, [currentId]);

  const bumpControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      // Keep controls up while paused (YouTube/Netflix behavior); only hide when playing.
      if (!transportRef.current?.paused()) setControlsVisible(false);
    }, AUTO_HIDE_MS);
  }, []);

  useEffect(() => {
    if (expanded) bumpControls();
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, [expanded, currentId, bumpControls]);

  const onToggleFavorite = useCallback(async () => {
    if (currentId == null) return;
    setFavorited(await toggleFavorite(currentId));
    bump();
  }, [currentId, bump]);

  const onDownload = useCallback(async () => {
    if (!current) return;
    try {
      if (dlDone || current.download_path) {
        await removeDownload(current);
        setDlDone(false);
      } else {
        await downloadEpisode(current);
        setDlDone(true);
      }
      bump();
    } catch (e) {
      log.warn("player: download failed", { id: current.id, error: String(e) });
    }
  }, [current, dlDone, bump]);

  const onShuffle = useCallback(async () => {
    const list = await listRandomEpisodes(50);
    if (list.length) playQueue(list, 0, "Shuffle");
  }, [playQueue]);

  const togglePlay = useCallback(() => {
    const t = transportRef.current;
    if (!t) return;
    if (t.paused()) t.play();
    else t.pause();
  }, []);

  const skipBy = useCallback(
    (delta: number) => {
      const t = transportRef.current;
      if (!t) return;
      const ceil = dur || Number.MAX_SAFE_INTEGER;
      const nt = Math.max(0, Math.min((time || 0) + delta, ceil));
      t.seek(nt);
      setTime(nt);
    },
    [time, dur]
  );

  const onLoadedMetadata = useCallback(() => {
    const el = videoRef.current;
    if (!el || currentId == null) return;
    setDur(el.duration);
    if (current && current.duration == null && Number.isFinite(el.duration)) {
      void setDuration(currentId, el.duration);
    }
    // Resume where you left off (unless finished or near the end).
    const pos = current?.position ?? 0;
    if (pos > 3 && !current?.finished && (!Number.isFinite(el.duration) || pos < el.duration - 5)) {
      el.currentTime = pos;
      setTime(pos);
    }
  }, [current, currentId]);

  const seek = useCallback((v: number) => {
    transportRef.current?.seek(v);
    setTime(v);
  }, []);

  const onVolume = useCallback((v: number) => {
    setVolume(v);
    transportRef.current?.setVolume(v);
    setMuted(v === 0);
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const nextMuted = !m;
      transportRef.current?.setMuted(nextMuted);
      return nextMuted;
    });
  }, []);

  // Fullscreen the stage so the video fills the monitor (works for <video> and embeds).
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void stageRef.current?.requestFullscreen();
  }, []);

  const onPickPlaylist = useCallback(
    async (playlistId: number) => {
      if (currentId == null) return;
      await addToPlaylist(playlistId, currentId);
      setPlOpen(false);
    },
    [currentId]
  );

  const onCreatePlaylist = useCallback(async () => {
    const name = newName.trim();
    if (!name || currentId == null) return;
    const id = await createPlaylist(name);
    await addToPlaylist(id, currentId);
    setNewName("");
    setPlOpen(false);
    bump();
  }, [newName, currentId, bump]);

  if (!current) return null;

  const quality = current.video_height ? `${current.video_height}p` : null;
  const thumb = current.thumbnail_url ?? current.show_image ?? null;
  const initial = (current.show_title ?? current.title ?? "?").trim().charAt(0).toUpperCase() || "?";
  const cursorHidden = expanded && !controlsVisible && playing;
  const dlState = downloadState(current, tools);
  const dlBlocked = dlState === "needs-ytdlp" || dlState === "needs-ffmpeg";
  const dlTitle = dlDone
    ? "Remove download"
    : dlState === "needs-ytdlp"
    ? "Enable yt-dlp in Settings"
    : dlState === "needs-ffmpeg"
    ? "Enable ffmpeg in Settings"
    : "Download for offline";

  return (
    <div ref={rootRef} className={`ddp ${expanded ? "ddp-expanded" : "ddp-mini"}`}>
      <div
        ref={stageRef}
        className={`ddp-stage${cursorHidden ? " cursor-hidden" : ""}`}
        onMouseMove={expanded ? bumpControls : undefined}
        onMouseEnter={expanded ? bumpControls : undefined}
        onClick={expanded ? togglePlay : expand}
      >
        {/* Native <video> stays mounted always (hidden for iframe sources) so
            audio survives the mini/expanded toggle. src is set imperatively. */}
        <video
          ref={videoRef}
          className="ddp-video"
          style={isIframe ? { display: "none" } : undefined}
          onEnded={onEnded}
          onLoadedMetadata={onLoadedMetadata}
          onTimeUpdate={(e) => { const t = e.currentTarget.currentTime; setTime(t); persistProgress(t); }}
          onPlay={() => { setPlaying(true); if (expanded) bumpControls(); }}
          onPause={() => { setPlaying(false); setControlsVisible(true); }}
        />

        {/* Embed host: the iframe adapter (YouTube/Vimeo) builds its player inside. */}
        {isIframe && <div ref={embedHostRef} className="ddp-video ddp-embed-host" />}

        {mediaError && (
          <div className="ddp-media-error">
            <div>Can't play this source</div>
            <div className="mute">{mediaError}</div>
          </div>
        )}

        {/* ---------- EXPANDED overlay ---------- */}
        {expanded && (
          <div
            className={`ddp-overlay${controlsVisible ? " show" : " hide"}`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* top: title (left) + close (right) */}
            <div className="ddp-top">
              <div className="ddp-top-meta grow">
                <div className="ddp-top-show truncate">
                  <span className="ddp-context">{contextLabel || current.show_title || "Now playing"}</span>
                  {quality && <span className="ep-badge">{quality}</span>}
                </div>
                <div className="ddp-top-title truncate">{current.title}</div>
              </div>
              <button className="icon-btn ddp-close" title="Close full player" onClick={collapse}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* center transport: skip / play / skip */}
            <div className="ddp-center">
              <button className="icon-btn ddp-skip" title={`Back ${SKIP_SECONDS}s`} onClick={() => skipBy(-SKIP_SECONDS)}>
                <IconBack10 />
              </button>
              <button className="icon-btn ddp-play-lg" title={playing ? "Pause" : "Play"} onClick={togglePlay}>
                {playing ? <IconPause /> : <IconPlay />}
              </button>
              <button className="icon-btn ddp-skip" title={`Forward ${SKIP_SECONDS}s`} onClick={() => skipBy(SKIP_SECONDS)}>
                <IconFwd10 />
              </button>
            </div>

            {/* bottom: scrubber + secondary controls */}
            <div className="ddp-bottom">
              <div className="ddp-scrub row">
                <span className="ddp-time">{fmt(time)}</span>
                <input
                  className="ddp-range grow"
                  type="range"
                  min={0}
                  max={dur || 0}
                  step="any"
                  value={Math.min(time, dur || 0)}
                  onChange={(e) => seek(Number(e.target.value))}
                />
                <span className="ddp-time">{fmt(dur)}</span>
              </div>

              <div className="ddp-controls">
                <div className="ddp-vol-wrap">
                  <button className="icon-btn" onClick={toggleMute} title={muted ? "Unmute" : "Mute"}>
                    <IconVol muted={muted} />
                  </button>
                  <input
                    className="ddp-vol"
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={muted ? 0 : volume}
                    onChange={(e) => onVolume(Number(e.target.value))}
                    title="Volume"
                  />
                </div>

                <span className="grow" />

                <div className="ddp-group ddp-actions">
                  <button className={`icon-btn fav${favorited ? " active" : ""}`} onClick={onToggleFavorite} title="Favorite">
                    <IconHeart on={favorited} />
                  </button>
                  {current.source_type !== "file" && (
                    <button
                      className={`icon-btn dl${dlDone ? " active" : ""}`}
                      onClick={onDownload}
                      disabled={!dlDone && dlBlocked}
                      title={dlTitle}
                    >
                      <IconDownload done={dlDone} />
                    </button>
                  )}
                </div>

                <div className="ddp-group ddp-window">
                  <div className="ddp-menu-wrap">
                    <button className={`icon-btn${plOpen ? " active" : ""}`} title="Add to playlist"
                      onClick={async () => { if (plOpen) setPlOpen(false); else { setPlaylists(await listPlaylists()); setPlOpen(true); } }}>
                      <IconPlus />
                    </button>
                    {plOpen && (
                      <div className="ddp-menu card ddp-pl" role="menu">
                        <div className="ddp-pl-list scroll-y">
                          {playlists.length === 0 && <div className="mute ddp-pl-empty">No playlists yet.</div>}
                          {playlists.map((pl) => (
                            <button key={pl.id} className="ddp-pl-item" onClick={() => onPickPlaylist(pl.id)}>
                              <span className="truncate grow">{pl.name}</span>
                              {pl.item_count != null && <span className="mute">{pl.item_count}</span>}
                            </button>
                          ))}
                        </div>
                        <div className="ddp-pl-new row">
                          <input className="grow" placeholder="＋ New playlist" value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") void onCreatePlaylist(); }} />
                          <button className="btn btn-primary" onClick={() => void onCreatePlaylist()} disabled={!newName.trim()}>Add</button>
                        </div>
                      </div>
                    )}
                  </div>
                  <button
                    className={`icon-btn ddp-drawer-toggle${queueOpen ? " active" : ""}`}
                    title="Up Next"
                    onClick={() => setQueueOpen((o) => !o)}
                  >
                    <IconList />
                  </button>
                  <button className="icon-btn" onClick={toggleFullscreen} title="Fullscreen">
                    <IconFull />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ---------- EXPANDED right-side Up Next queue ---------- */}
      {expanded && queueOpen && (
        <aside className="ddp-drawer">
          <div className="ddp-drawer-head">
            <span>Up Next <span className="mute">({upNext.length})</span></span>
            <button className="icon-btn ddp-shuffle" title="Shuffle library into the queue" onClick={() => void onShuffle()}>
              <IconShuffle />
            </button>
          </div>
          <div className="ddp-drawer-list scroll-y">
            {upNext.length === 0 && <div className="mute ddp-pl-empty">Nothing up next.</div>}
            {upNext.map((s, i) => {
              const queued = i < manualCount;
              return (
                <div
                  key={`${s.id}-${i}`}
                  className={`ddp-sib${queued ? " queued" : ""}`}
                  onClick={() => jumpTo(s)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter") jumpTo(s); }}
                >
                  <span className="ddp-sib-num episode-num">
                    {s.episode_number != null ? s.episode_number : "•"}
                  </span>
                  <span className="ddp-sib-title truncate grow">{s.title}</span>
                  {queued && <span className="ddp-queued-tag">Queued</span>}
                  {queued && (
                    <button
                      className="icon-btn ddp-sib-remove"
                      title="Remove from queue"
                      onClick={(e) => { e.stopPropagation(); removeFromQueue(s.id); }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </aside>
      )}

      {/* ---------- COLLAPSED mini bar ---------- */}
      {!expanded && (
        <div className="ddp-minibar">
          <div className="ddp-mini-thumb" aria-hidden="true">
            {thumb ? <img src={thumb} alt="" /> : <span>{initial}</span>}
          </div>
          <div className="ddp-mini-meta grow" onClick={expand} role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter") expand(); }}>
            <div className="ddp-mini-title truncate">{current.title}</div>
            <div className="ddp-mini-show truncate mute">{current.show_title ?? ""}</div>
          </div>
          <div className="ddp-group ddp-playback">
            <button className="icon-btn ddp-play" onClick={togglePlay} title={playing ? "Pause" : "Play"}>
              {playing ? <IconPause /> : <IconPlay />}
            </button>
          </div>
          <div className="ddp-group ddp-actions">
            <button className={`icon-btn fav${favorited ? " active" : ""}`} onClick={onToggleFavorite} title="Favorite">
              <IconHeart on={favorited} />
            </button>
            <button className="icon-btn" onClick={close} title="Close">✕</button>
          </div>
        </div>
      )}
    </div>
  );
}
