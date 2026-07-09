import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";
import { PlayerProvider, usePlayer } from "../../src/lib/state";
import { makeEpisode, makeEpisodes } from "../support/factories";

// The queue engine pulls a random library episode only at the end of the list.
// Mock db so that boundary is deterministic and no Tauri/SQLite is touched.
vi.mock("../../src/lib/db", () => ({ randomEpisode: vi.fn() }));
import { randomEpisode } from "../../src/lib/db";
const mockRandom = vi.mocked(randomEpisode);

const wrapper = ({ children }: { children: ReactNode }) => (
  <PlayerProvider>{children}</PlayerProvider>
);
const setup = () => renderHook(() => usePlayer(), { wrapper });
const ids = (eps: { id: number }[]) => eps.map((e) => e.id);

beforeEach(() => mockRandom.mockReset());

describe("play() — starting playback captures the context", () => {
  it("sets current, label, expands, and derives upNext from the played-from list", () => {
    const list = makeEpisodes(1, 2, 3);
    const { result } = setup();
    act(() => result.current.play(list[0], list, "Library"));

    expect(result.current.current?.id).toBe(1);
    expect(result.current.contextLabel).toBe("Library");
    expect(result.current.expanded).toBe(true);
    expect(result.current.manualCount).toBe(0);
    expect(ids(result.current.upNext)).toEqual([2, 3]); // rest of the context, in order
  });

  it("starting mid-list makes upNext the items after the chosen one", () => {
    const list = makeEpisodes(1, 2, 3, 4);
    const { result } = setup();
    act(() => result.current.play(list[1], list, "Library"));

    expect(result.current.current?.id).toBe(2);
    expect(ids(result.current.upNext)).toEqual([3, 4]);
  });

  it("with no context list, the episode is its own single-item context", () => {
    const { result } = setup();
    act(() => result.current.play(makeEpisode(7)));
    expect(result.current.current?.id).toBe(7);
    expect(result.current.upNext).toEqual([]);
  });
});

describe("manual queue — Play next / Add to queue", () => {
  it("playNext jumps to the front of upNext; addToQueue appends to the end", () => {
    const list = makeEpisodes(1, 2, 3);
    const { result } = setup();
    act(() => result.current.play(list[0], list, "Library"));

    act(() => result.current.addToQueue(makeEpisode(20)));
    act(() => result.current.playNext(makeEpisode(10)));

    // manual (10 then 20) plays before the context remainder (2, 3)
    expect(ids(result.current.upNext)).toEqual([10, 20, 2, 3]);
    expect(result.current.manualCount).toBe(2);
  });

  it("re-queuing an episode dedupes rather than duplicating", () => {
    const { result } = setup();
    act(() => result.current.play(makeEpisode(1)));
    act(() => result.current.addToQueue(makeEpisode(5)));
    act(() => result.current.addToQueue(makeEpisode(5)));
    expect(ids(result.current.upNext)).toEqual([5]);
  });

  it("removeFromQueue drops a manual item by id", () => {
    const { result } = setup();
    act(() => result.current.play(makeEpisode(1)));
    act(() => result.current.addToQueue(makeEpisode(5)));
    act(() => result.current.addToQueue(makeEpisode(6)));
    act(() => result.current.removeFromQueue(5));
    expect(ids(result.current.upNext)).toEqual([6]);
  });
});

describe("next() — advance order: manual, then context, then shuffle", () => {
  it("plays the manual queue before resuming the context", () => {
    const list = makeEpisodes(1, 2, 3);
    const { result } = setup();
    act(() => result.current.play(list[0], list, "Library"));
    act(() => result.current.playNext(makeEpisode(99)));

    act(() => result.current.next());
    expect(result.current.current?.id).toBe(99); // manual item first
    expect(result.current.manualCount).toBe(0);

    act(() => result.current.next());
    expect(result.current.current?.id).toBe(2); // context resumes where it was
  });

  it("at the end of the context it auto-shuffles the library and relabels", async () => {
    const single = [makeEpisode(1)];
    mockRandom.mockResolvedValueOnce(makeEpisode(42));
    const { result } = setup();
    act(() => result.current.play(single[0], single, "Library"));

    await act(async () => {
      result.current.next();
    });

    await waitFor(() => expect(result.current.current?.id).toBe(42));
    expect(result.current.contextLabel).toBe("Shuffle");
    expect(mockRandom).toHaveBeenCalled();
  });

  it("auto-shuffle avoids immediately repeating the current episode", async () => {
    const single = [makeEpisode(5)];
    mockRandom
      .mockResolvedValueOnce(makeEpisode(5)) // same as current → rejected
      .mockResolvedValueOnce(makeEpisode(8)); // retry lands on a different one
    const { result } = setup();
    act(() => result.current.play(single[0], single, "Library"));

    await act(async () => {
      result.current.next();
    });

    await waitFor(() => expect(result.current.current?.id).toBe(8));
    expect(mockRandom).toHaveBeenCalledTimes(2);
  });
});

describe("jumpTo() — clicking an Up Next row plays it now", () => {
  it("jumping to a manual item consumes the manual items before it", () => {
    const { result } = setup();
    act(() => result.current.play(makeEpisode(1)));
    act(() => result.current.addToQueue(makeEpisode(10)));
    act(() => result.current.addToQueue(makeEpisode(11)));
    act(() => result.current.addToQueue(makeEpisode(12)));

    act(() => result.current.jumpTo(makeEpisode(11)));
    expect(result.current.current?.id).toBe(11);
    expect(ids(result.current.upNext)).toEqual([12]); // 10 and 11 consumed
  });

  it("jumping to a context item moves the context index there", () => {
    const list = makeEpisodes(1, 2, 3, 4);
    const { result } = setup();
    act(() => result.current.play(list[0], list, "Library"));
    act(() => result.current.jumpTo(list[2]));
    expect(result.current.current?.id).toBe(3);
    expect(ids(result.current.upNext)).toEqual([4]);
  });
});

describe("prev() / expand / collapse / close", () => {
  it("prev steps back through the context", () => {
    const list = makeEpisodes(1, 2, 3);
    const { result } = setup();
    act(() => result.current.play(list[2], list, "Library"));
    act(() => result.current.prev());
    expect(result.current.current?.id).toBe(2);
  });

  it("collapse and expand toggle the view without changing playback", () => {
    const { result } = setup();
    act(() => result.current.play(makeEpisode(1)));
    act(() => result.current.collapse());
    expect(result.current.expanded).toBe(false);
    expect(result.current.current?.id).toBe(1);
    act(() => result.current.expand());
    expect(result.current.expanded).toBe(true);
  });

  it("close clears the queue entirely", () => {
    const list = makeEpisodes(1, 2, 3);
    const { result } = setup();
    act(() => result.current.play(list[0], list, "Library"));
    act(() => result.current.close());
    expect(result.current.current).toBeNull();
    expect(result.current.upNext).toEqual([]);
    expect(result.current.expanded).toBe(false);
  });
});
