import type { Episode } from "../../src/types";

// Minimal Episode factory for state/logic tests. Only fields the queue engine and
// list rendering read need to be realistic; the rest get harmless defaults.
export function makeEpisode(id: number, over: Partial<Episode> = {}): Episode {
  return {
    id,
    show_id: 1,
    show_title: "Test Show",
    title: `Episode ${id}`,
    description: "",
    episode_number: id,
    published_date: null,
    source_type: "file",
    source_url: null,
    thumbnail_url: null,
    feed_id: null,
    guid: null,
    file_path: `/media/ep${id}.mp4`,
    original_filename: `ep${id}.mp4`,
    original_title: null,
    video_height: null,
    duration: null,
    favorited: false,
    added_at: "2026-01-01 00:00:00",
    show_image: null,
    download_path: null,
    position: null,
    played_at: null,
    finished: false,
    ...over,
  };
}

export function makeEpisodes(...ids: number[]): Episode[] {
  return ids.map((id) => makeEpisode(id));
}
