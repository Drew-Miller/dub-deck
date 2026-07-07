// FeedsView — manage podcast subscriptions: refresh to pull new episodes, or
// unsubscribe (removes the feed and its episodes). Episodes themselves appear in
// the Library under their show.

import { useEffect, useState } from "react";
import type { JSX } from "react";
import { listFeeds, deleteFeed } from "../lib/db";
import { refreshFeed } from "../lib/remoteSources";
import { useBumpLibrary, useLibraryVersion } from "../lib/state";
import type { Feed } from "../types";
import "./FeedsView.css";

export default function FeedsView(): JSX.Element {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const bump = useBumpLibrary();
  const version = useLibraryVersion();

  useEffect(() => {
    listFeeds().then(setFeeds).catch(() => {});
  }, [version]);

  async function onRefresh(feed: Feed) {
    setBusyId(feed.id);
    setStatus(null);
    try {
      const r = await refreshFeed(feed.id);
      setStatus(`${feed.title ?? "Feed"}: ${r.added} new episode${r.added === 1 ? "" : "s"}`);
      bump();
    } catch (e) {
      setStatus(String(e instanceof Error ? e.message : e));
    } finally {
      setBusyId(null);
    }
  }

  async function onRemove(feed: Feed) {
    setBusyId(feed.id);
    try {
      await deleteFeed(feed.id);
      setConfirmId(null);
      bump();
    } catch (e) {
      setStatus(String(e instanceof Error ? e.message : e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="feeds-view">
      <div className="feeds-head">
        <h1>Feeds</h1>
        <span className="mute">{feeds.length} subscription{feeds.length === 1 ? "" : "s"}</span>
      </div>

      {status && <div className="feeds-status card">{status}</div>}

      {feeds.length === 0 ? (
        <div className="feeds-empty mute">
          No subscriptions yet. Use <strong>＋ Add source</strong> and paste a podcast feed URL.
        </div>
      ) : (
        <div className="feeds-list">
          {feeds.map((f) => (
            <div key={f.id} className="feed-row card">
              {f.thumbnail_url && (
                <img className="feed-thumb" src={f.thumbnail_url} alt="" loading="lazy" />
              )}
              <div className="feed-meta grow">
                <div className="feed-title truncate">{f.title ?? f.feed_url}</div>
                <div className="feed-sub mute truncate">
                  {f.episode_count ?? 0} episode{(f.episode_count ?? 0) === 1 ? "" : "s"}
                  {f.last_refreshed_at ? ` · refreshed ${f.last_refreshed_at.slice(0, 10)}` : ""}
                </div>
              </div>
              <div className="feed-actions row">
                <button
                  className="btn btn-ghost"
                  onClick={() => onRefresh(f)}
                  disabled={busyId === f.id}
                >
                  {busyId === f.id ? "…" : "↻ Refresh"}
                </button>
                {confirmId === f.id ? (
                  <>
                    <button className="btn feed-danger" onClick={() => onRemove(f)} disabled={busyId === f.id}>
                      Remove
                    </button>
                    <button className="btn btn-ghost" onClick={() => setConfirmId(null)} disabled={busyId === f.id}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <button className="btn btn-ghost" onClick={() => setConfirmId(f.id)} disabled={busyId === f.id}>
                    Unsubscribe
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
