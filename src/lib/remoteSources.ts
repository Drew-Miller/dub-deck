// Ingest remote sources into the library without hosting any media ourselves:
//   • addDirectUrl  — a single .mp4/.m3u8 link
//   • addVideoUrl   — a YouTube/Vimeo watch URL (embed; oEmbed for title/thumbnail)
//   • addFeed       — subscribe to a podcast RSS / Podcasting 2.0 feed
//   • refreshFeed   — pull new items from a subscription
// All HTTP goes through the Tauri http plugin's fetch, which runs Rust-side and
// therefore bypasses the webview's CORS restrictions.

import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import {
  createEpisode,
  getOrCreateShow,
  getOrCreateFeed,
  getFeed,
  touchFeed,
  feedEpisodeExists,
  setShowImageIfEmpty,
} from "./db";
import { parseEpisodeNumber } from "./importer";
import { detectProvider } from "./sources";
import { log } from "./log";
import type { EmbedProvider } from "./sources";

async function fetchText(url: string): Promise<string> {
  const res = await tauriFetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`Fetch failed (${res.status}) for ${url}`);
  return res.text();
}

/** Last path segment of a URL, extension stripped, separators spaced. */
function titleFromUrl(url: string): string {
  try {
    const p = new URL(url).pathname.split("/").filter(Boolean).pop() ?? url;
    return decodeURIComponent(p).replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || url;
  } catch {
    return url;
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// -------------------------------------------------------------- direct URL

export async function addDirectUrl(
  url: string,
  meta: { showTitle?: string; title?: string } = {}
): Promise<number> {
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) throw new Error("Enter a valid http(s) URL.");
  const title = meta.title?.trim() || titleFromUrl(trimmed);
  const showTitle = meta.showTitle?.trim() || "Streamed";
  const id = await createEpisode({
    showTitle,
    title,
    source_type: "direct_url",
    source_url: trimmed,
    episode_number: parseEpisodeNumber(title),
  });
  log.info("remoteSources: direct url added", { id, url: trimmed });
  return id;
}

// -------------------------------------------------------- youtube / vimeo

interface OembedMeta {
  title?: string;
  author?: string;
  authorUrl?: string;
  thumbnail?: string;
}

async function fetchOembed(provider: EmbedProvider, url: string): Promise<OembedMeta> {
  const endpoint =
    provider === "youtube"
      ? `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
      : `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`;
  try {
    const res = await tauriFetch(endpoint, { method: "GET" });
    if (!res.ok) {
      log.warn("remoteSources: oembed non-ok", { provider, status: res.status });
      return {};
    }
    const j = (await res.json()) as Record<string, unknown>;
    return {
      title: typeof j.title === "string" ? j.title : undefined,
      author: typeof j.author_name === "string" ? j.author_name : undefined,
      authorUrl: typeof j.author_url === "string" ? j.author_url : undefined,
      thumbnail: typeof j.thumbnail_url === "string" ? j.thumbnail_url : undefined,
    };
  } catch (e) {
    // Enrichment is best-effort: fall back to a URL-derived title, but log it.
    log.warn("remoteSources: oembed failed", { provider, error: String(e) });
    return {};
  }
}

/** Best-effort: fetch a channel/author page and pull its og:image (the channel
 *  avatar/art). Returns null on any failure — enrichment is never fatal. */
async function fetchChannelImage(pageUrl: string | undefined): Promise<string | null> {
  if (!pageUrl || !/^https?:\/\//i.test(pageUrl)) return null;
  try {
    const html = await fetchText(pageUrl);
    const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    return m ? m[1] : null;
  } catch (e) {
    log.warn("remoteSources: channel image fetch failed", { pageUrl, error: String(e) });
    return null;
  }
}

export async function addVideoUrl(url: string): Promise<number> {
  const trimmed = url.trim();
  const provider = detectProvider(trimmed);
  if (!provider) throw new Error("Not a recognized YouTube or Vimeo URL.");
  const meta = await fetchOembed(provider, trimmed);
  const title = meta.title || titleFromUrl(trimmed);
  const showTitle = meta.author?.trim() || (provider === "youtube" ? "YouTube" : "Vimeo");
  // Resolve the show up front so we can seed its channel art after creating the episode.
  const showId = await getOrCreateShow(showTitle);
  const id = await createEpisode({
    showTitle,
    title,
    source_type: provider,
    source_url: trimmed,
    thumbnail_url: meta.thumbnail ?? null,
    episode_number: parseEpisodeNumber(title),
  });
  // Prefer the channel page's og:image (channel art); fall back to the video
  // thumbnail so the show tile is never blank. Only fills when empty.
  const channelImg = await fetchChannelImage(meta.authorUrl);
  await setShowImageIfEmpty(showId, channelImg ?? meta.thumbnail ?? null);
  log.info("remoteSources: video url added", { id, provider, url: trimmed });
  return id;
}

// ------------------------------------------------------------------- scrape

/** Create a `scrape` episode from an original watch URL. The stream is resolved
 *  at play time by a registered scrape backend (see scrapeBackend.ts). Inert unless
 *  a backend is registered — otherwise playback surfaces a "not configured" message. */
export async function addScrapeUrl(
  url: string,
  meta: { showTitle?: string; title?: string } = {}
): Promise<number> {
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) throw new Error("Enter a valid http(s) URL.");
  const title = meta.title?.trim() || titleFromUrl(trimmed);
  const showTitle = meta.showTitle?.trim() || "Scraped";
  const id = await createEpisode({
    showTitle,
    title,
    source_type: "scrape",
    source_url: trimmed,
    episode_number: parseEpisodeNumber(title),
  });
  log.info("remoteSources: scrape url added", { id, url: trimmed });
  return id;
}

// ---------------------------------------------------------------- RSS feed

interface FeedItem {
  title: string;
  guid: string | null;
  mediaUrl: string | null;
  episodeNumber: number | null;
  date: string | null;
  description: string;
  image: string | null;
}

interface ParsedFeed {
  title: string | null;
  siteUrl: string | null;
  image: string | null;
  items: FeedItem[];
}

/** textContent of the first descendant with this (possibly namespaced) tag name. */
function tagText(el: Element, name: string): string | null {
  const n = el.getElementsByTagName(name)[0];
  const t = n?.textContent?.trim();
  return t ? t : null;
}

/** Convert an RSS pubDate (RFC-822) or ISO date to 'YYYY-MM-DD', or null. */
function toIsoDate(raw: string | null): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** Pick the best playable media URL for an item: prefer a video alternate
 *  enclosure (MP4, then HLS), then the plain enclosure (video or audio). */
function pickMediaUrl(item: Element): string | null {
  const alts = Array.from(item.getElementsByTagName("podcast:alternateEnclosure"));
  const sourceUri = (alt: Element): string | null =>
    alt.getElementsByTagName("podcast:source")[0]?.getAttribute("uri")?.trim() || null;
  const mp4 = alts.find((a) => (a.getAttribute("type") || "").includes("mp4"));
  if (mp4) {
    const u = sourceUri(mp4);
    if (u) return u;
  }
  const hls = alts.find((a) => /mpegurl/i.test(a.getAttribute("type") || ""));
  if (hls) {
    const u = sourceUri(hls);
    if (u) return u;
  }
  const enc = item.getElementsByTagName("enclosure")[0];
  const encUrl = enc?.getAttribute("url")?.trim();
  if (encUrl) return encUrl;
  return null;
}

function parseFeed(xml: string): ParsedFeed {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) {
    throw new Error("Feed is not valid XML.");
  }
  const channel = doc.querySelector("channel");
  if (!channel) throw new Error("Unsupported feed (no RSS <channel> found).");

  const channelImage =
    channel.getElementsByTagName("itunes:image")[0]?.getAttribute("href")?.trim() ||
    tagText(channel, "url") ||
    null;

  const items: FeedItem[] = [];
  for (const item of Array.from(channel.getElementsByTagName("item"))) {
    const title = tagText(item, "title") ?? "Untitled";
    const mediaUrl = pickMediaUrl(item);
    const itunesEp = tagText(item, "itunes:episode");
    const image =
      item.getElementsByTagName("itunes:image")[0]?.getAttribute("href")?.trim() || null;
    items.push({
      title,
      guid: tagText(item, "guid") ?? mediaUrl,
      mediaUrl,
      episodeNumber: itunesEp ? Number(itunesEp) : parseEpisodeNumber(title),
      date: toIsoDate(tagText(item, "pubDate")),
      description: tagText(item, "description") ?? "",
      image,
    });
  }

  return {
    title: tagText(channel, "title"),
    siteUrl: tagText(channel, "link"),
    image: channelImage,
    items,
  };
}

async function ingestItems(feedId: number, showTitle: string, parsed: ParsedFeed): Promise<number> {
  let added = 0;
  for (const it of parsed.items) {
    if (!it.mediaUrl) {
      log.warn("remoteSources: feed item has no media, skipped", { feedId, title: it.title });
      continue;
    }
    if (it.guid && (await feedEpisodeExists(feedId, it.guid))) continue;
    await createEpisode({
      showTitle,
      title: it.title,
      description: it.description,
      episode_number: it.episodeNumber,
      published_date: it.date,
      source_type: "rss",
      source_url: it.mediaUrl,
      thumbnail_url: it.image ?? parsed.image,
      feed_id: feedId,
      guid: it.guid,
    });
    added++;
  }
  return added;
}

export async function addFeed(feedUrl: string): Promise<{ feedId: number; added: number; show: string }> {
  const url = feedUrl.trim();
  if (!/^https?:\/\//i.test(url)) throw new Error("Enter a valid feed URL.");
  const xml = await fetchText(url);
  const parsed = parseFeed(xml);
  const showTitle = parsed.title?.trim() || hostOf(url);
  const showId = await getOrCreateShow(showTitle);
  // Seed the show's cover with the feed's channel/iTunes art if it has none yet.
  await setShowImageIfEmpty(showId, parsed.image);
  const feedId = await getOrCreateFeed(url, {
    title: parsed.title,
    site_url: parsed.siteUrl,
    thumbnail_url: parsed.image,
    show_id: showId,
  });
  const added = await ingestItems(feedId, showTitle, parsed);
  await touchFeed(feedId);
  log.info("remoteSources: feed added", { feedId, show: showTitle, added });
  return { feedId, added, show: showTitle };
}

export async function refreshFeed(feedId: number): Promise<{ added: number }> {
  const feed = await getFeed(feedId);
  if (!feed) throw new Error("Feed not found.");
  const xml = await fetchText(feed.feed_url);
  const parsed = parseFeed(xml);
  const showTitle = feed.title?.trim() || parsed.title?.trim() || hostOf(feed.feed_url);
  // Backfill channel art on refresh for shows still missing a cover.
  if (feed.show_id != null) await setShowImageIfEmpty(feed.show_id, parsed.image);
  const added = await ingestItems(feedId, showTitle, parsed);
  await touchFeed(feedId);
  log.info("remoteSources: feed refreshed", { feedId, added });
  return { added };
}
