import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EpisodeSort } from "../../src/types";

// Capture the SQL + params db.ts generates, without a real SQLite engine.
const calls: { sql: string; params: any[] }[] = [];
let nextRows: any[] = [];
const fakeDb = {
  select: vi.fn(async (sql: string, params: any[] = []) => {
    calls.push({ sql, params });
    return nextRows;
  }),
  execute: vi.fn(async () => ({ rowsAffected: 0, lastInsertId: 1 })),
};

vi.mock("@tauri-apps/plugin-sql", () => ({ default: { load: vi.fn(async () => fakeDb) } }));
vi.mock("@tauri-apps/api/core", () => ({ convertFileSrc: (p: string) => `asset://${p}` }));

import { listEpisodes } from "../../src/lib/db";

const lastSql = () => calls[calls.length - 1].sql.replace(/\s+/g, " ").trim();
const lastParams = () => calls[calls.length - 1].params;

beforeEach(() => {
  calls.length = 0;
  nextRows = [];
});

describe("listEpisodes — filter → WHERE clause", () => {
  it("no filter → no WHERE, default sort is number ascending (nulls last)", async () => {
    await listEpisodes();
    expect(lastSql()).not.toContain("WHERE");
    expect(lastSql()).toContain("ORDER BY e.episode_number ASC NULLS LAST");
  });

  it("favoritedOnly adds the favorited predicate", async () => {
    await listEpisodes({ favoritedOnly: true });
    expect(lastSql()).toContain("e.favorited = 1");
  });

  it("search matches title OR description with wildcard params", async () => {
    await listEpisodes({ search: "hello" });
    expect(lastSql()).toContain("e.title LIKE ? OR e.description LIKE ?");
    expect(lastParams()).toEqual(["%hello%", "%hello%"]);
  });

  it("year alone filters on the 4-char date prefix", async () => {
    await listEpisodes({ year: 2020 });
    expect(lastSql()).toContain("substr(e.published_date, 1, 4) = ?");
    expect(lastParams()).toContain("2020");
  });

  it("year + month filters on the YYYY-MM prefix, zero-padded", async () => {
    await listEpisodes({ year: 2020, month: 3 });
    expect(lastSql()).toContain("substr(e.published_date, 1, 7) = ?");
    expect(lastParams()).toContain("2020-03");
  });

  it("episode-number bucket adds inclusive min/max bounds", async () => {
    await listEpisodes({ episodeMin: 100, episodeMax: 199 });
    expect(lastSql()).toContain("e.episode_number >= ?");
    expect(lastSql()).toContain("e.episode_number <= ?");
    expect(lastParams()).toEqual([100, 199]);
  });

  it("showIds produces a parameterized IN list", async () => {
    await listEpisodes({ showIds: [1, 2, 3] });
    expect(lastSql()).toContain("e.show_id IN (?,?,?)");
    expect(lastParams()).toEqual([1, 2, 3]);
  });

  it("combines multiple filters with AND in a single WHERE", async () => {
    await listEpisodes({ favoritedOnly: true, search: "x", year: 2021 });
    const sql = lastSql();
    expect(sql).toContain("WHERE");
    expect(sql.match(/ AND /g)?.length).toBe(2); // three predicates joined by two ANDs
  });
});

describe("listEpisodes — sort field mapping", () => {
  const cases: Array<[EpisodeSort, string]> = [
    ["number_asc", "e.episode_number ASC NULLS LAST"],
    ["number_desc", "e.episode_number DESC NULLS LAST"],
    ["date_asc", "e.published_date ASC NULLS LAST"],
    ["date_desc", "e.published_date DESC NULLS LAST"],
    ["added_asc", "e.added_at ASC"],
    ["added_desc", "e.added_at DESC"],
    ["title_asc", "e.title COLLATE NOCASE ASC"],
    ["title_desc", "e.title COLLATE NOCASE DESC"],
  ];
  for (const [sort, fragment] of cases) {
    it(`${sort} → ORDER BY ${fragment}`, async () => {
      await listEpisodes({ sort });
      expect(lastSql()).toContain(`ORDER BY ${fragment}`);
    });
  }
});

describe("normalizeEpisode — row shaping (via listEpisodes)", () => {
  it("coerces SQLite 0/1 into booleans and defaults null description to ''", async () => {
    nextRows = [
      { id: 1, show_id: 1, show_title: "S", title: "T", description: null,
        favorited: 1, finished: 0, added_at: "x", source_type: "youtube" },
    ];
    const [ep] = await listEpisodes();
    expect(ep.favorited).toBe(true);
    expect(ep.finished).toBe(false);
    expect(ep.description).toBe("");
    expect(ep.source_type).toBe("youtube");
  });
});
