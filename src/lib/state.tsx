// Shared app state: the now-playing queue and a library-refresh signal.
// Feature components use these hooks instead of prop-drilling.

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Episode } from "../types";
import { randomEpisode } from "./db";

// ---------------------------------------------------------- Player

interface PlayerApi {
  current: Episode | null;
  /** Where playback started from (a show title, "Favorites", "Shuffle", …). */
  contextLabel: string;
  /** Upcoming episodes: manual queue first, then the rest of the context list. */
  upNext: Episode[];
  /** How many leading `upNext` items are manually queued (vs. context). */
  manualCount: number;
  /** True = full-window video view; false = collapsed mini bar. */
  expanded: boolean;
  /** Start playback from a context list (defaults to just the episode). Opens full-window. */
  play: (episode: Episode, context?: Episode[], label?: string) => void;
  /** Start a context list at an index. Opens full-window. */
  playQueue: (context: Episode[], startIndex?: number, label?: string) => void;
  /** Insert an episode to play immediately after the current one. */
  playNext: (episode: Episode) => void;
  /** Append an episode to the end of the manual queue. */
  addToQueue: (episode: Episode) => void;
  /** Remove a manually-queued episode by id. */
  removeFromQueue: (episodeId: number) => void;
  /** Play an Up-Next item right now. */
  jumpTo: (episode: Episode) => void;
  expand: () => void;
  collapse: () => void;
  next: () => void;
  prev: () => void;
  close: () => void;
}

const PlayerContext = createContext<PlayerApi | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  // context = the ordered list playback was started from (its sort/filter order);
  // manual = episodes the user explicitly queued. current is tracked explicitly since
  // a manual item is not part of the context.
  const [context, setContext] = useState<Episode[]>([]);
  const [contextIndex, setContextIndex] = useState(0);
  const [contextLabel, setContextLabel] = useState("");
  const [manual, setManual] = useState<Episode[]>([]);
  const [current, setCurrent] = useState<Episode | null>(null);
  const [expanded, setExpanded] = useState(false);

  const play = useCallback((episode: Episode, ctx?: Episode[], label = "") => {
    const list = ctx && ctx.length ? ctx : [episode];
    const at = list.findIndex((e) => e.id === episode.id);
    setContext(list);
    setContextIndex(at < 0 ? 0 : at);
    setContextLabel(label);
    setManual([]);
    setCurrent(episode);
    setExpanded(true);
  }, []);

  const playQueue = useCallback((list: Episode[], startIndex = 0, label = "") => {
    if (!list.length) return;
    const i = Math.min(Math.max(0, startIndex), list.length - 1);
    setContext(list);
    setContextIndex(i);
    setContextLabel(label);
    setManual([]);
    setCurrent(list[i]);
    setExpanded(true);
  }, []);

  const playNext = useCallback(
    (ep: Episode) => setManual((m) => [ep, ...m.filter((e) => e.id !== ep.id)]),
    []
  );
  const addToQueue = useCallback(
    (ep: Episode) => setManual((m) => [...m.filter((e) => e.id !== ep.id), ep]),
    []
  );
  const removeFromQueue = useCallback(
    (id: number) => setManual((m) => m.filter((e) => e.id !== id)),
    []
  );

  const next = useCallback(() => {
    if (manual.length) {
      setCurrent(manual[0]);
      setManual(manual.slice(1));
      return;
    }
    if (contextIndex + 1 < context.length) {
      const ni = contextIndex + 1;
      setContextIndex(ni);
      setCurrent(context[ni]);
      return;
    }
    // End of the list you started from → keep playing by shuffling the whole library.
    const excludeId = current?.id ?? null;
    void randomEpisode().then(async (ep) => {
      let pick = ep;
      if (pick && excludeId != null && pick.id === excludeId) {
        pick = (await randomEpisode()) ?? pick;
      }
      if (!pick) {
        setCurrent(null);
        return;
      }
      setContext([pick]);
      setContextIndex(0);
      setContextLabel("Shuffle");
      setCurrent(pick);
    });
  }, [manual, context, contextIndex, current]);

  const prev = useCallback(() => {
    if (contextIndex > 0) {
      const pi = contextIndex - 1;
      setContextIndex(pi);
      setCurrent(context[pi]);
    }
  }, [context, contextIndex]);

  const jumpTo = useCallback(
    (ep: Episode) => {
      const mi = manual.findIndex((e) => e.id === ep.id);
      if (mi >= 0) {
        setManual(manual.slice(mi + 1));
        setCurrent(ep);
        return;
      }
      const ci = context.findIndex((e) => e.id === ep.id);
      if (ci >= 0) {
        setContextIndex(ci);
        setCurrent(ep);
      }
    },
    [manual, context]
  );

  const expand = useCallback(() => setExpanded(true), []);
  const collapse = useCallback(() => setExpanded(false), []);
  const close = useCallback(() => {
    setContext([]);
    setContextIndex(0);
    setContextLabel("");
    setManual([]);
    setCurrent(null);
    setExpanded(false);
  }, []);

  const upNext = useMemo(
    () => [...manual, ...context.slice(contextIndex + 1)],
    [manual, context, contextIndex]
  );

  const value = useMemo<PlayerApi>(
    () => ({
      current,
      contextLabel,
      upNext,
      manualCount: manual.length,
      expanded,
      play,
      playQueue,
      playNext,
      addToQueue,
      removeFromQueue,
      jumpTo,
      expand,
      collapse,
      next,
      prev,
      close,
    }),
    [current, contextLabel, upNext, manual.length, expanded, play, playQueue, playNext, addToQueue, removeFromQueue, jumpTo, expand, collapse, next, prev, close]
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
