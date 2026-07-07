// Global media player for dub-deck. Mounted once by App.tsx. Two modes driven by
// player.expanded:
//   • expanded  → full-window video with auto-hiding overlay controls, a back arrow,
//                 and the show's other episodes in a right-side drawer.
//   • collapsed → an Apple-Music-style mini bar pinned at the bottom (keeps playing).
// A single <video> element is reused across both modes so playback never restarts.
// Edit / delete / reveal live at the episode-list level, NOT here (see decisions.md).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import Hls from "hls.js";
import { usePlayer, useBumpLibrary, useLibraryVersion } from "../lib/state";
import {
  toggleLike,
  toggleFavorite,
  setDuration,
  listEpisodes,
  listPlaylists,
  createPlaylist,
  addToPlaylist,
} from "../lib/db";
import { resolveMedia, type ResolvedMedia } from "../lib/sources";
import { createIframeAdapter, type IframeAdapter } from "../lib/iframePlayer";
import { log } from "../lib/log";
import type { Episode, Playlist } from "../types";
import "./Player.css";

/** Uniform playback control surface over the native <video> and (later) iframe embeds. */
interface Transport {
  play(): void;
  pause(): void;
  paused(): boolean;
  seek(t: number): void;
  setVolume(v: number): void;
  setMuted(m: boolean): void;
}

const AUTO_HIDE_MS = 2500;

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
const IconPlay = () => (<svg width="24" height="24" fill="currentColor" {...V}><path d="M7 4.5v15a.6.6 0 0 0 .92.5l12-7.5a.6.6 0 0 0 0-1l-12-7.5A.6.6 0 0 0 7 4.5z" /></svg>);
const IconPause = () => (<svg width="24" height="24" fill="currentColor" {...V}><path d="M7 4.6h3.4v14.8H7zM13.6 4.6H17v14.8h-3.4z" /></svg>);
const IconList = () => (<svg width="20" height="20" fill="currentColor" {...V}><path d="M4 6h16v2.2H4zM4 10.9h16v2.2H4zM4 15.8h10v2.2H4z" /></svg>);
const IconPlus = () => (<svg width="20" height="20" fill="currentColor" {...V}><path d="M3 6h12v2H3zM3 11h12v2H3zM3 16h8v2H3zM18 12h2v3h3v2h-3v3h-2v-3h-3v-2h3z" /></svg>);
const IconHeart = ({ on }: { on: boolean }) =>
  on
    ? (<svg width="20" height="20" fill="currentColor" {...V}><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" /></svg>)
    : (<svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" {...V}><path d="M12 20.5l-1.3-1.18C6 15 3 12.2 3 8.75 3 6.13 5.02 4 7.5 4c1.6 0 3.1.86 4 2.2C12.4 4.86 13.9 4 15.5 4 17.98 4 20 6.13 20 8.75c0 3.45-3 6.25-7.7 10.57L12 20.5z" /></svg>);
const IconStar = ({ on }: { on: boolean }) =>
  on
    ? (<svg width="20" height="20" fill="currentColor" {...V}><path d="M12 2l2.9 6.26 6.85.7-5.13 4.6 1.48 6.74L12 17.6 5.9 20.3l1.48-6.74L2.25 8.96l6.85-.7z" /></svg>)
    : (<svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" {...V}><path d="M12 4l2.4 5.2 5.6.6-4.2 3.8 1.2 5.6L12 16.3 6.99 19.2l1.2-5.6L4 9.8l5.6-.6z" /></svg>);
const IconFull = () => (<svg width="20" height="20" fill="currentColor" {...V}><path d="M4 4h6v2H6v4H4zM20 4v6h-2V6h-4V4zM6 18h4v2H4v-6h2zM18 14h2v6h-6v-2h4z" /></svg>);
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
  const { current, expanded, play, next, close, expand, collapse } = usePlayer();
  const bump = useBumpLibrary();
  const version = useLibraryVersion();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const embedHostRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const hideTimer = useRef<number | null>(null);
  const transportRef = useRef<Transport | null>(null);

  const [media, setMedia] = useState<ResolvedMedia | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [liked, setLiked] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [plOpen, setPlOpen] = useState(false);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [newName, setNewName] = useState("");
  const [siblings, setSiblings] = useState<Episode[]>([]);

  const currentId = current?.id ?? null;
  const showId = current?.show_id ?? null;
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
      onTime: setTime,
      onDuration: (d) => {
        setDur(d);
        if (currentId != null && current?.duration == null && Number.isFinite(d)) {
          void setDuration(currentId, d);
        }
      },
      onPlaying: setPlaying,
      onEnded: next,
    })
      .then((a) => {
        if (cancelled) {
          a.destroy();
          return;
        }
        adapter = a;
        transportRef.current = a;
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
    setLiked(current.liked);
    setFavorited(current.favorited);
    setPlOpen(false);
    setControlsVisible(true);
  }, [current, currentId]);

  useEffect(() => {
    if (showId == null) return;
    let cancelled = false;
    listEpisodes({ showIds: [showId], sort: "number_asc" }).then((rows) => {
      if (!cancelled) setSiblings(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [showId, version]);

  const bumpControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (!transportRef.current?.paused()) setControlsVisible(false);
    }, AUTO_HIDE_MS);
  }, []);

  useEffect(() => {
    if (expanded) bumpControls();
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, [expanded, currentId, bumpControls]);

  const onToggleLike = useCallback(async () => {
    if (currentId == null) return;
    setLiked(await toggleLike(currentId));
    bump();
  }, [currentId, bump]);

  const onToggleFavorite = useCallback(async () => {
    if (currentId == null) return;
    setFavorited(await toggleFavorite(currentId));
    bump();
  }, [currentId, bump]);

  const togglePlay = useCallback(() => {
    const t = transportRef.current;
    if (!t) return;
    if (t.paused()) t.play();
    else t.pause();
  }, []);

  const onLoadedMetadata = useCallback(() => {
    const el = videoRef.current;
    if (!el || currentId == null) return;
    setDur(el.duration);
    if (current && current.duration == null && Number.isFinite(el.duration)) {
      void setDuration(currentId, el.duration);
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
      const next = !m;
      transportRef.current?.setMuted(next);
      return next;
    });
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void rootRef.current?.requestFullscreen();
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

  return (
    <div ref={rootRef} className={`ddp ${expanded ? "ddp-expanded" : "ddp-mini"}`}>
      <div
        className="ddp-stage"
        onMouseMove={expanded ? bumpControls : undefined}
        onClick={expanded ? togglePlay : expand}
      >
        {/* Native <video> stays mounted always (hidden for iframe sources) so
            audio survives the mini/expanded toggle. src is set imperatively. */}
        <video
          ref={videoRef}
          className="ddp-video"
          style={isIframe ? { display: "none" } : undefined}
          onEnded={next}
          onLoadedMetadata={onLoadedMetadata}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
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
            <div className="ddp-top">
              <button className="icon-btn ddp-back" title="Back to episodes" onClick={collapse}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M15.7 5.3a1 1 0 0 1 0 1.4L10.42 12l5.3 5.3a1 1 0 0 1-1.42 1.4l-6-6a1 1 0 0 1 0-1.4l6-6a1 1 0 0 1 1.4 0z" />
                </svg>
              </button>
              <div className="ddp-top-meta grow">
                <div className="ddp-top-show truncate">
                  {current.show_title ?? "Unknown show"}
                  {quality && <span className="ep-badge">{quality}</span>}
                </div>
                <div className="ddp-top-title truncate">{current.title}</div>
              </div>
            </div>

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
                {/* far left: episodes / theater drawer toggle */}
                <button
                  className={`icon-btn ddp-drawer-toggle${drawerOpen ? " active" : ""}`}
                  title="Episodes"
                  onClick={() => setDrawerOpen((o) => !o)}
                >
                  <IconList />
                </button>

                {/* playback: play/pause + volume with slider (drives the native
                    <video> or the embed adapter through the shared transport) */}
                <div className="ddp-group ddp-playback">
                  <button className="icon-btn ddp-play" onClick={togglePlay} title={playing ? "Pause" : "Play"}>
                    {playing ? <IconPause /> : <IconPlay />}
                  </button>
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
                </div>

                <span className="grow" />

                {/* favorite (Twitter-style) */}
                <div className="ddp-group ddp-actions">
                  <button className={`icon-btn like${liked ? " active" : ""}`} onClick={onToggleLike} title="Like">
                    <IconHeart on={liked} />
                  </button>
                  <button className={`icon-btn fav${favorited ? " active" : ""}`} onClick={onToggleFavorite} title="Favorite">
                    <IconStar on={favorited} />
                  </button>
                </div>

                {/* small space, then: playlist, then fullscreen (rightmost) */}
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
                  <button className="icon-btn" onClick={toggleFullscreen} title="Fullscreen">
                    <IconFull />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ---------- EXPANDED right-side episodes drawer ---------- */}
      {expanded && drawerOpen && (
        <aside className="ddp-drawer">
          <div className="ddp-drawer-head">Episodes <span className="mute">({siblings.length})</span></div>
          <div className="ddp-drawer-list scroll-y">
            {siblings.map((s) => (
              <div
                key={s.id}
                className={`ddp-sib${s.id === currentId ? " active" : ""}`}
                onClick={() => play(s, siblings)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === "Enter") play(s, siblings); }}
              >
                <span className="ddp-sib-num episode-num">{s.episode_number != null ? s.episode_number : "•"}</span>
                <span className="ddp-sib-title truncate grow">{s.title}</span>
                {s.liked && <span className="like">♥</span>}
              </div>
            ))}
          </div>
        </aside>
      )}

      {/* ---------- COLLAPSED mini bar ---------- */}
      {!expanded && (
        <div className="ddp-minibar">
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
            <button className={`icon-btn like${liked ? " active" : ""}`} onClick={onToggleLike} title="Like">
              <IconHeart on={liked} />
            </button>
            <button className={`icon-btn fav${favorited ? " active" : ""}`} onClick={onToggleFavorite} title="Favorite">
              <IconStar on={favorited} />
            </button>
            <button className="icon-btn" onClick={close} title="Close">✕</button>
          </div>
        </div>
      )}
    </div>
  );
}
