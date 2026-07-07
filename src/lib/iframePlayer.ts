// Iframe player adapter: gives YouTube/Vimeo embeds the same transport surface as
// the native <video>, so the Player's controls (play/pause/seek/volume) and
// time/duration/ended feedback work identically for embeds.
//
// The adapter builds its player into a private child of the host element (never the
// host itself) so React keeps owning the host node while the SDK manages its child —
// avoiding reconciliation conflicts when episodes change.

import VimeoPlayer from "@vimeo/player";
import type { EmbedProvider } from "./sources";

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export interface IframeCallbacks {
  onTime: (seconds: number) => void;
  onDuration: (seconds: number) => void;
  onPlaying: (playing: boolean) => void;
  onEnded: () => void;
}

export interface IframeAdapter {
  play(): void;
  pause(): void;
  paused(): boolean;
  seek(seconds: number): void;
  setVolume(v: number): void;
  setMuted(m: boolean): void;
  destroy(): void;
}

let ytApi: Promise<any> | null = null;
function loadYouTubeApi(): Promise<any> {
  if (ytApi) return ytApi;
  ytApi = new Promise((resolve) => {
    if (window.YT?.Player) {
      resolve(window.YT);
      return;
    }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT);
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  });
  return ytApi;
}

async function createYouTube(
  host: HTMLElement,
  videoId: string,
  cb: IframeCallbacks
): Promise<IframeAdapter> {
  const YT = await loadYouTubeApi();
  const mount = document.createElement("div");
  host.appendChild(mount);

  let paused = true;
  let timer: number | null = null;

  const player: any = await new Promise((resolve) => {
    const p = new YT.Player(mount, {
      width: "100%",
      height: "100%",
      videoId,
      playerVars: { autoplay: 1, rel: 0, playsinline: 1, enablejsapi: 1, controls: 0 },
      events: {
        onReady: () => resolve(p),
        onStateChange: (e: any) => {
          // YT.PlayerState: PLAYING=1, PAUSED=2, ENDED=0
          if (e.data === 1) {
            paused = false;
            cb.onPlaying(true);
            const d = p.getDuration?.();
            if (d) cb.onDuration(d);
          } else if (e.data === 2) {
            paused = true;
            cb.onPlaying(false);
          } else if (e.data === 0) {
            paused = true;
            cb.onEnded();
          }
        },
      },
    });
  });

  // YouTube has no timeupdate event — poll while mounted.
  timer = window.setInterval(() => {
    if (!paused) cb.onTime(player.getCurrentTime?.() ?? 0);
  }, 500);

  return {
    play: () => player.playVideo?.(),
    pause: () => player.pauseVideo?.(),
    paused: () => paused,
    seek: (s) => player.seekTo?.(s, true),
    setVolume: (v) => player.setVolume?.(Math.round(v * 100)),
    setMuted: (m) => (m ? player.mute?.() : player.unMute?.()),
    destroy: () => {
      if (timer) window.clearInterval(timer);
      try {
        player.destroy?.();
      } finally {
        host.innerHTML = "";
      }
    },
  };
}

async function createVimeo(
  host: HTMLElement,
  videoId: string,
  cb: IframeCallbacks
): Promise<IframeAdapter> {
  const mount = document.createElement("div");
  host.appendChild(mount);

  const player = new VimeoPlayer(mount, {
    id: Number(videoId),
    autoplay: true,
    responsive: true,
  });

  let paused = true;
  player.on("timeupdate", (d: { seconds: number; duration: number }) => {
    cb.onTime(d.seconds);
    if (d.duration) cb.onDuration(d.duration);
  });
  player.on("play", () => {
    paused = false;
    cb.onPlaying(true);
  });
  player.on("pause", () => {
    paused = true;
    cb.onPlaying(false);
  });
  player.on("ended", () => {
    paused = true;
    cb.onEnded();
  });

  return {
    play: () => void player.play().catch(() => {}),
    pause: () => void player.pause().catch(() => {}),
    paused: () => paused,
    seek: (s) => void player.setCurrentTime(s).catch(() => {}),
    setVolume: (v) => void player.setVolume(v).catch(() => {}),
    setMuted: (m) => void player.setMuted(m).catch(() => {}),
    destroy: () => {
      void player.destroy().catch(() => {});
      host.innerHTML = "";
    },
  };
}

export function createIframeAdapter(
  provider: EmbedProvider,
  host: HTMLElement,
  videoId: string,
  cb: IframeCallbacks
): Promise<IframeAdapter> {
  return provider === "youtube"
    ? createYouTube(host, videoId, cb)
    : createVimeo(host, videoId, cb);
}
