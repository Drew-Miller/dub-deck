import { useEffect, useMemo, useState } from "react";
import type { JSX } from "react";
import { listRecentlyPlayed } from "../lib/db";
import { usePlayer, useLibraryVersion } from "../lib/state";
import { useTools } from "../lib/downloads";
import type { Episode } from "../types";
import EpisodeRow from "./EpisodeRow";
import "./Sidebars.css";

export default function RecentlyListenedView(): JSX.Element {
  const { playQueue } = usePlayer();
  const version = useLibraryVersion();
  const tools = useTools(version);
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
      <div className="row spread dd-toolbar">
        <button
          type="button"
          className={"chip" + (favOnly ? " active" : "")}
          onClick={() => setFavOnly((v) => !v)}
        >
          <span aria-hidden="true">&#9829;</span> Favorites only
        </button>
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
        <div className="episode-list scroll-y">
          {shown.map((ep) => (
            <EpisodeRow key={ep.id} episode={ep} list={shown} label="Recently Listened" tools={tools} />
          ))}
        </div>
      )}
    </div>
  );
}
