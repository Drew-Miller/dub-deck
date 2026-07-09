// Browser-side Tauri IPC stub. dub-deck's frontend talks to the Rust backend through
// window.__TAURI_INTERNALS__ (invoke + convertFileSrc). In a plain Chromium page that
// object is absent, so the real <App/> would crash on first DB call. This install()
// runs as a Playwright init script (before app code) and answers the SQL plugin with a
// small seeded library so the shell renders deterministically. Layout is what we assert;
// data only has to be plausible.

export interface Seed {
  shows: Record<string, unknown>[];
  episodes: Record<string, unknown>[];
}

export const SEED: Seed = {
  shows: [
    { id: 1, title: "Alpha Show", created_at: "2026-01-01", image_url: null, favorited: 0, episode_count: 2 },
    { id: 2, title: "Beta Show", created_at: "2026-01-02", image_url: null, favorited: 0, episode_count: 1 },
  ],
  episodes: [1, 2, 3].map((n) => ({
    id: n,
    show_id: n === 3 ? 2 : 1,
    show_title: n === 3 ? "Beta Show" : "Alpha Show",
    title: `Episode ${n}`,
    description: "",
    episode_number: n,
    published_date: `2026-01-0${n}`,
    source_type: "file",
    source_url: null,
    thumbnail_url: null,
    feed_id: null,
    guid: null,
    file_path: `/media/ep${n}.mp4`,
    original_filename: `ep${n}.mp4`,
    original_title: null,
    video_height: null,
    duration: 100,
    favorited: 0,
    added_at: `2026-01-0${n} 00:00:00`,
    show_image: null,
    download_path: null,
    position: null,
    played_at: null,
    finished: 0,
  })),
};

// Serialized into the page. Must be self-contained (no outer references except `seed`).
export function install(seed: Seed): void {
  const rowsFor = (query: string): unknown[] => {
    const q = String(query);
    if (/FROM settings/i.test(q)) return [];
    if (/FROM shows s/i.test(q)) return seed.shows;
    if (/FROM episodes e/i.test(q)) return seed.episodes;
    return [];
  };
  (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
    invoke: async (cmd: string, payload: { query?: string } = {}) => {
      if (cmd === "plugin:sql|load") return "sqlite:dubdeck.db";
      if (cmd === "plugin:sql|select") return rowsFor(payload.query ?? "");
      if (cmd === "plugin:sql|execute") return [0, 1];
      return null;
    },
    convertFileSrc: (path: string) => path,
    transformCallback: (cb: unknown) => cb,
  };
}
