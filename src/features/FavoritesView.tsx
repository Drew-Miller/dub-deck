import { useEffect, useState } from "react";
import type { JSX } from "react";
import { listEpisodes } from "../lib/db";
import { usePlayer, useLibraryVersion } from "../lib/state";
import type { Episode } from "../types";
import "./Sidebars.css";

/** Format an ISO 'YYYY-MM-DD' date into something compact and readable. */
function formatDate(date: string | null): string {
  if (!date) return "";
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function FavoritesView(): JSX.Element {
  const { play, playQueue } = usePlayer();
  const version = useLibraryVersion();
  const [episodes, setEpisodes] = useState<Episode[]>([]);

  useEffect(() => {
    let cancelled = false;
    listEpisodes({ favoritedOnly: true, sort: "added_desc" })
      .then((rows) => {
        if (!cancelled) setEpisodes(rows);
      })
      .catch(() => {
        if (!cancelled) setEpisodes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  return (
    <div className="dd-view">
      <div>
        <h2 className="dd-view-title">Favorites</h2>
        <p className="dd-view-sub">Everything you've hearted, newest first.</p>
      </div>

      <div className="card dd-panel dd-panel-main">
        <div className="row spread dd-panel-head">
          <h3>Favorite episodes</h3>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => playQueue(episodes, 0, "Favorites")}
            disabled={episodes.length === 0}
          >
            <span aria-hidden="true">&#9654;</span> Play all
          </button>
        </div>

        {episodes.length === 0 ? (
          <div className="dd-empty">
            <span className="dd-empty-icon" aria-hidden="true">♡</span>
            <span>No favorites yet.</span>
          </div>
        ) : (
          <div className="dd-list scroll-y">
            {episodes.map((ep, i) => (
              <div
                key={ep.id}
                className="dd-row"
                role="button"
                tabIndex={0}
                onClick={() => play(ep, episodes, "Favorites")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    play(ep, episodes, "Favorites");
                  }
                }}
              >
                <span className="dd-row-num">
                  <span className="dd-row-index">{i + 1}</span>
                  <span className="dd-row-play" aria-hidden="true">&#9654;</span>
                </span>
                <span className="dd-row-body">
                  <span className="dd-row-title truncate">{ep.title}</span>
                  <span className="dd-row-sub truncate">{ep.show_title}</span>
                </span>
                <span className="dd-row-date">{formatDate(ep.published_date)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
