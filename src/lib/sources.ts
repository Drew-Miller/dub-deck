// Source abstraction: the single place that decides HOW an episode plays.
// Local files and remote media (direct URL / RSS) play in the native <video>;
// YouTube/Vimeo play in an <iframe> embed. `resolveMedia` is the one choke point
// the Player calls, so no component needs to branch on source_type itself.

import { convertFileSrc } from "@tauri-apps/api/core";
import type { Episode, SourceType } from "../types";

export type PlaybackKind = "native" | "iframe";
export type EmbedProvider = "youtube" | "vimeo";

/** native = plays in <video> (file/direct_url/rss/scrape); iframe = embed (youtube/vimeo). */
export function playbackKind(source: SourceType): PlaybackKind {
  return source === "youtube" || source === "vimeo" ? "iframe" : "native";
}

export function isHlsUrl(url: string): boolean {
  return /\.m3u8(\?|#|$)/i.test(url);
}

/** Extract a YouTube video id from watch / youtu.be / embed / shorts URLs. */
export function youTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return u.pathname.slice(1) || null;
    if (host.endsWith("youtube.com")) {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      const m = u.pathname.match(/^\/(embed|shorts|v)\/([^/?#]+)/);
      if (m) return m[2];
    }
    return null;
  } catch {
    return null;
  }
}

/** Extract a Vimeo numeric id from vimeo.com/<id> or player.vimeo.com/video/<id>. */
export function vimeoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (!u.hostname.replace(/^www\./, "").endsWith("vimeo.com")) return null;
    const m = u.pathname.match(/(\d+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** Detect an embeddable provider from a pasted watch URL. */
export function detectProvider(url: string): EmbedProvider | null {
  if (youTubeId(url)) return "youtube";
  if (vimeoId(url)) return "vimeo";
  return null;
}

/** The iframe embed URL for a youtube/vimeo episode. */
export function embedUrl(ep: Episode): string {
  if (ep.source_type === "youtube") {
    const id = youTubeId(ep.source_url ?? "") ?? "";
    return `https://www.youtube.com/embed/${id}?enablejsapi=1&rel=0&playsinline=1`;
  }
  if (ep.source_type === "vimeo") {
    const id = vimeoId(ep.source_url ?? "") ?? "";
    return `https://player.vimeo.com/video/${id}`;
  }
  return ep.source_url ?? "";
}

// ------------------------------------------------------------ scrape seam

/** Resolves a playable stream URL from an original watch URL at play time.
 *  Left unconfigured on machines without a scrape backend (e.g. yt-dlp). */
export interface ScrapeResolver {
  resolve(sourceUrl: string): Promise<{ streamUrl: string; isHls: boolean; expiresAt?: number }>;
}

let scrapeResolver: ScrapeResolver = {
  async resolve() {
    throw new Error("Scrape backend not configured on this machine.");
  },
};

/** Install a scrape backend (e.g. one that invokes yt-dlp via a Rust command).
 *  See docs/handoff.md for enabling this on a machine that allows it. */
export function registerScrapeResolver(r: ScrapeResolver): void {
  scrapeResolver = r;
}

// ------------------------------------------------------------ resolve

export interface ResolvedMedia {
  kind: PlaybackKind;
  /** native: the media URL for <video>; iframe: the embed URL. */
  url: string;
  isHls: boolean;
  provider?: EmbedProvider;
  videoId?: string;
}

/** The single choke point the Player uses to turn an episode into playable media. */
export async function resolveMedia(ep: Episode): Promise<ResolvedMedia> {
  switch (ep.source_type) {
    case "file":
      return { kind: "native", url: convertFileSrc(ep.file_path), isHls: false };
    case "direct_url":
    case "rss": {
      const url = ep.source_url ?? "";
      return { kind: "native", url, isHls: isHlsUrl(url) };
    }
    case "youtube":
      return {
        kind: "iframe",
        url: embedUrl(ep),
        isHls: false,
        provider: "youtube",
        videoId: youTubeId(ep.source_url ?? "") ?? undefined,
      };
    case "vimeo":
      return {
        kind: "iframe",
        url: embedUrl(ep),
        isHls: false,
        provider: "vimeo",
        videoId: vimeoId(ep.source_url ?? "") ?? undefined,
      };
    case "scrape": {
      const r = await scrapeResolver.resolve(ep.source_url ?? "");
      return { kind: "native", url: r.streamUrl, isHls: r.isHls };
    }
  }
}
