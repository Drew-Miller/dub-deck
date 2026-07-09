import { useEffect, useMemo, useState } from "react";
import type { JSX } from "react";
import { listRecentlyPlayed } from "../lib/db";
import { usePlayer, useLibraryVersion } from "../lib/state";
import type { Episode } from "../types";
import RowThumb from "./RowThumb";
import "./Sidebars.css";

function formatDate(date: string | null): string {
  if (!date) return "";
  const parsed = new Date(date.includes("T") ? date : `${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function RecentlyListenedView(): JSX.Element {
  const { play, playQueue } = usePlayer();
  const version = useLibraryVersion();
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [favOnly, setFavOnly] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listRecentlyPlayed()
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

  const shown = useMemo(
    () => (favOnly ? episodes.filter((e) => e.favorited) : episodes),
    [episodes, favOnly]
  );

  return (
    <div className="dd-view">
      <div>
        <h2 className="dd-view-title">Recently Listened</h2>
        <p className="dd-view-sub">Pick up where you left off, most recent first.</p>
      </div>

      <div className="row dd-chips">
        <button
          type="button"
          className={"chip" + (favOnly ? " active" : "")}
          onClick={() => setFavOnly((v) => !v)}
        >
          <span aria-hidden="true">&#9829;</span> Favorites only
        </button>
      </div>

      <div className="card dd-panel dd-panel-main">
        <div className="row spread dd-panel-head">
          <h3>Recently listened</h3>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => playQueue(shown, 0, "Recently Listened")}
            disabled={shown.length === 0}
          >
            <span aria-hidden="true">&#9654;</span> Play all
          </button>
        </div>

        {shown.length === 0 ? (
          <div className="dd-empty">
            <span className="dd-empty-icon" aria-hidden="true">&#9200;</span>
            <span>{favOnly ? "No favorites played yet." : "Nothing played yet."}</span>
          </div>
        ) : (
          <div className="dd-list scroll-y">
            {shown.map((ep, i) => (
              <div
                key={ep.id}
                className="dd-row"
                role="button"
                tabIndex={0}
                onClick={() => play(ep, shown, "Recently Listened")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    play(ep, shown, "Recently Listened");
                  }
                }}
              >
                <RowThumb ep={ep} />
                <span className="dd-row-num">
                  <span className="dd-row-index">{i + 1}</span>
                  <span className="dd-row-play" aria-hidden="true">&#9654;</span>
                </span>
                <span className="dd-row-body">
                  <span className="dd-row-title truncate">{ep.title}</span>
                  <span className="dd-row-sub truncate">{ep.show_title}</span>
                </span>
                <span className="dd-row-date">{formatDate(ep.played_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
