import { useEffect, useState } from "react";
import type { JSX } from "react";
import { listEpisodes } from "../lib/db";
import { usePlayer, useLibraryVersion } from "../lib/state";
import type { Episode } from "../types";
import "./Sidebars.css";

type Tab = "liked" | "favorites";

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

  const [tab, setTab] = useState<Tab>("liked");
  const [episodes, setEpisodes] = useState<Episode[]>([]);

  // Re-query the active list whenever the tab or the library changes.
  useEffect(() => {
    let cancelled = false;
    const filter =
      tab === "liked"
        ? { likedOnly: true, sort: "added_desc" as const }
        : { favoritedOnly: true, sort: "added_desc" as const };
    listEpisodes(filter)
      .then((rows) => {
        if (!cancelled) setEpisodes(rows);
      })
      .catch(() => {
        if (!cancelled) setEpisodes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, version]);

  const emptyLabel =
    tab === "liked" ? "No liked episodes yet." : "No favorites yet.";

  return (
    <div className="dd-view">
      <div>
        <h2 className="dd-view-title">Saved</h2>
        <p className="dd-view-sub">Everything you have liked or starred, newest first.</p>
      </div>

      <div className="row dd-chips">
        <button
          type="button"
          className={"chip" + (tab === "liked" ? " active" : "")}
          onClick={() => setTab("liked")}
        >
          <span aria-hidden="true">&#9829;</span> Liked
        </button>
        <button
          type="button"
          className={"chip" + (tab === "favorites" ? " active" : "")}
          onClick={() => setTab("favorites")}
        >
          <span aria-hidden="true">&#9733;</span> Favorites
        </button>
      </div>

      <div className="card dd-panel dd-panel-main">
        <div className="row spread dd-panel-head">
          <h3>{tab === "liked" ? "Liked episodes" : "Favorite episodes"}</h3>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => playQueue(episodes, 0)}
            disabled={episodes.length === 0}
          >
            <span aria-hidden="true">&#9654;</span> Play all
          </button>
        </div>

        {episodes.length === 0 ? (
          <div className="dd-empty">
            <span className="dd-empty-icon" aria-hidden="true">
              {tab === "liked" ? "♡" : "☆"}
            </span>
            <span>{emptyLabel}</span>
          </div>
        ) : (
          <div className="dd-list scroll-y">
            {episodes.map((ep, i) => (
              <div
                key={ep.id}
                className="dd-row"
                role="button"
                tabIndex={0}
                onClick={() => play(ep, episodes)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    play(ep, episodes);
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
