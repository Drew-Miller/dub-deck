// Small left-aligned thumbnail for list rows. Uses the episode thumbnail, falling
// back to the show artwork, then a lettered placeholder.

import type { JSX } from "react";
import { imageSrc } from "../lib/sources";
import type { Episode } from "../types";

export default function RowThumb({ ep }: { ep: Episode }): JSX.Element {
  const src = imageSrc(ep.thumbnail_url ?? ep.show_image);
  const initial = (ep.show_title ?? ep.title ?? "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <div className="row-thumb" aria-hidden="true">
      {src ? <img src={src} alt="" loading="lazy" /> : <span>{initial}</span>}
    </div>
  );
}
