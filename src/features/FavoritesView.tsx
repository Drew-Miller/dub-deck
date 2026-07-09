import { useEffect, useState } from "react";
import type { JSX } from "react";
import { listEpisodes } from "../lib/db";
import { usePlayer, useLibraryVersion } from "../lib/state";
import { useTools } from "../lib/downloads";
import type { Episode } from "../types";
import EpisodeRow from "./EpisodeRow";
import "./Sidebars.css";

export default function FavoritesView(): JSX.Element {
  const { playQueue } = usePlayer();
  const version = useLibraryVersion();
  const tools = useTools(version);
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
      <div className="row spread dd-toolbar">
        <span className="muted">{episodes.length} favorite{episodes.length === 1 ? "" : "s"}</span>
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
        <div className="episode-list scroll-y">
          {episodes.map((ep) => (
            <EpisodeRow key={ep.id} episode={ep} list={episodes} label="Favorites" tools={tools} />
          ))}
        </div>
      )}
    </div>
  );
}
