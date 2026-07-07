// Shared app state: the now-playing queue and a library-refresh signal.
// Feature components use these hooks instead of prop-drilling.

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Episode } from "../types";

// ---------------------------------------------------------- Player

interface PlayerApi {
  current: Episode | null;
  queue: Episode[];
  index: number;
  /** Play a single episode (optionally within a queue for next/prev). */
  play: (episode: Episode, queue?: Episode[]) => void;
  /** Play a queue starting at an index. */
  playQueue: (queue: Episode[], startIndex?: number) => void;
  next: () => void;
  prev: () => void;
  close: () => void;
}

const PlayerContext = createContext<PlayerApi | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Episode[]>([]);
  const [index, setIndex] = useState(0);

  const play = useCallback((episode: Episode, q?: Episode[]) => {
    const list = q && q.length ? q : [episode];
    const startAt = Math.max(0, list.findIndex((e) => e.id === episode.id));
    setQueue(list);
    setIndex(startAt === -1 ? 0 : startAt);
  }, []);

  const playQueue = useCallback((q: Episode[], startIndex = 0) => {
    if (!q.length) return;
    setQueue(q);
    setIndex(Math.min(Math.max(0, startIndex), q.length - 1));
  }, []);

  const next = useCallback(() => setIndex((i) => Math.min(i + 1, queue.length - 1)), [queue.length]);
  const prev = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);
  const close = useCallback(() => {
    setQueue([]);
    setIndex(0);
  }, []);

  const value = useMemo<PlayerApi>(
    () => ({ current: queue[index] ?? null, queue, index, play, playQueue, next, prev, close }),
    [queue, index, play, playQueue, next, prev, close]
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer(): PlayerApi {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within <PlayerProvider>");
  return ctx;
}

// ------------------------------------------------ Library refresh signal

interface RefreshApi {
  version: number;
  bump: () => void;
}

const RefreshContext = createContext<RefreshApi | null>(null);

export function RefreshProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const bumpRef = useRef(() => setVersion((v) => v + 1));
  const value = useMemo<RefreshApi>(() => ({ version, bump: bumpRef.current }), [version]);
  return <RefreshContext.Provider value={value}>{children}</RefreshContext.Provider>;
}

/** Read the current library version — put it in a useEffect dep array to re-query on change. */
export function useLibraryVersion(): number {
  const ctx = useContext(RefreshContext);
  if (!ctx) throw new Error("useLibraryVersion must be used within <RefreshProvider>");
  return ctx.version;
}

/** Get a function that signals all library-bound views to re-query. */
export function useBumpLibrary(): () => void {
  const ctx = useContext(RefreshContext);
  if (!ctx) throw new Error("useBumpLibrary must be used within <RefreshProvider>");
  return ctx.bump;
}
