import { useEffect, useMemo, useState } from "react";
import type { JSX } from "react";
import { listShows, randomEpisode } from "../lib/db";
import { usePlayer, useLibraryVersion } from "../lib/state";
import type { Show, Episode } from "../types";
import "./Sidebars.css";

export default function ShuffleView(): JSX.Element {
  const { play, playQueue } = usePlayer();
  const version = useLibraryVersion();

  const [shows, setShows] = useState<Show[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [queueSize, setQueueSize] = useState("20");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "error" | "ok" | "info"; text: string } | null>(
    null
  );

  // Re-query the list of shows on library changes; drop selections that vanish.
  useEffect(() => {
    let cancelled = false;
    listShows()
      .then((rows) => {
        if (cancelled) return;
        setShows(rows);
        setSelectedIds((prev) => prev.filter((id) => rows.some((s) => s.id === id)));
      })
      .catch(() => {
        if (!cancelled) setShows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  // Empty selection means "all shows"; randomEpisode() treats [] the same way.
  const showIdsArg = selectedIds.length ? selectedIds : undefined;

  const includedLabel = useMemo(() => {
    if (!selectedIds.length) return "all shows";
    const names = shows.filter((s) => selectedIds.includes(s.id)).map((s) => s.title);
    return names.join(", ");
  }, [selectedIds, shows]);

  function toggleShow(id: number) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function shufflePlay() {
    if (busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const ep = await randomEpisode(showIdsArg);
      if (!ep) {
        setStatus({ kind: "error", text: "No episodes to shuffle." });
        return;
      }
      play(ep);
      setStatus({ kind: "ok", text: `Now playing "${ep.title}".` });
    } finally {
      setBusy(false);
    }
  }

  async function buildQueue() {
    if (busy) return;
    const target = Math.max(1, Math.floor(Number(queueSize) || 0));
    setBusy(true);
    setStatus(null);
    try {
      const picked: Episode[] = [];
      const seen = new Set<number>();
      // randomEpisode() gives one at a time, so poll until we have `target`
      // distinct episodes. Bail out after a run of misses so a small library
      // (fewer than `target` unique episodes) can't spin forever.
      let misses = 0;
      const maxMisses = 12;
      while (picked.length < target && misses < maxMisses) {
        const ep = await randomEpisode(showIdsArg);
        if (!ep) break;
        if (seen.has(ep.id)) {
          misses += 1;
          continue;
        }
        seen.add(ep.id);
        picked.push(ep);
        misses = 0;
      }

      if (!picked.length) {
        setStatus({ kind: "error", text: "No episodes to shuffle." });
        return;
      }
      playQueue(picked, 0);
      setStatus({
        kind: "ok",
        text:
          picked.length < target
            ? `Built a queue of ${picked.length} (only ${picked.length} unique episode${
                picked.length === 1 ? "" : "s"
              } available).`
            : `Shuffling a queue of ${picked.length} episodes.`,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dd-view">
      <div>
        <h2 className="dd-view-title">Shuffle</h2>
        <p className="dd-view-sub">
          Play something at random across your library — or just the shows you pick.
        </p>
      </div>

      <div className="card dd-panel dd-panel-main">
        <div className="dd-panel-head">
          <h3>Include shows</h3>
        </div>

        <div className="row dd-chips">
          <button
            type="button"
            className={"chip" + (selectedIds.length === 0 ? " active" : "")}
            onClick={() => setSelectedIds([])}
          >
            All shows
          </button>
          {shows.map((s) => (
            <button
              key={s.id}
              type="button"
              className={"chip" + (selectedIds.includes(s.id) ? " active" : "")}
              onClick={() => toggleShow(s.id)}
              title={`${s.episode_count ?? 0} episodes`}
            >
              {s.title}
            </button>
          ))}
        </div>
        {shows.length === 0 && (
          <p className="mute">Import some episodes first to shuffle.</p>
        )}

        <div className="card dd-shuffle-hero">
          <p className="muted" style={{ margin: 0 }}>
            Shuffling from <strong>{includedLabel}</strong>.
          </p>

          <div className="row dd-shuffle-actions">
            <button
              type="button"
              className="btn btn-primary dd-shuffle-big"
              onClick={shufflePlay}
              disabled={busy || shows.length === 0}
            >
              <span aria-hidden="true">&#128256;</span> Shuffle Play
            </button>

            <div className="row dd-queue-build">
              <label className="muted" htmlFor="dd-queue-size">
                Queue of
              </label>
              <input
                id="dd-queue-size"
                type="number"
                min={1}
                value={queueSize}
                onChange={(e) => setQueueSize(e.currentTarget.value)}
                disabled={busy}
              />
              <button
                type="button"
                className="btn"
                onClick={buildQueue}
                disabled={busy || shows.length === 0}
              >
                Build shuffle queue
              </button>
            </div>
          </div>

          {status && (
            <p
              className={
                "dd-shuffle-status" +
                (status.kind === "error" ? " error" : status.kind === "ok" ? " ok" : "")
              }
            >
              {status.text}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
