Dub Deck

Handoff

- Remove 'titles' from sidebar items. Playlists, Shows, Recently Listened, & Favorites all show the text above their list. And the list bakground is different looking than the Library list. All 'episode' based viewing should be similar in view to the Library view.
- Make discovering the YT-DLP and FFMPEG easier for the user. Most of them will not have technical knowledge to know where it is installed. See if on settings we can make an interaction that checks for the software and gathers it's path and populates the field for them.
- Right now, remove the 'feeds' area from the settings section
- If possible, on episode import, import the 'channel's image for the shows thumbnail icon if the show does not currently have a thumbnail.

---

## Progress checklist (agent-maintained)

Legend: ✅ done · 🔄 in progress · ⬜ todo

Appearance
- ✅ Sidebar width is mouse-draggable within a clamped min/max (180–420px).
- ✅ 'Recently Added' is the default library sort.
- ✅ An ascending/descending toggle sits to the right of the sort selector.
- ✅ The 'favorites only' filter moved up to the top row of library controls.
- ✅ YouTube/Vimeo embeds show only Dub-Deck's controls (native chrome suppressed, embed click-through so our overlay drives playback).
- ✅ Each library row shows a color-coded source-type badge (Podcast/URL/YouTube/Vimeo/Scrape/Local + downloaded).
- ✅ The row ⋯ menu is grouped with separators and leading icons (Play next · Add to queue │ Download │ Edit · Reveal │ Delete).
- ✅ The Edit page shows more info (source type, source url, file path, and downloaded path).
- ✅ Videos show a thumbnail with a lettered 'no image' placeholder, and Edit lets you paste an image (saved to app-data) or an image URL.
- ✅ All list rows (Library, Playlists, Shows, Favorites, Recently Listened) show a small left thumbnail.
- ✅ A Shows sidebar tab shows a square album-cover grid, most-recently-updated first, clicking into a show's episodes.
- ✅ Download icon is a cloud with a down arrow; library rows have an icon-only Download button (hover "Download") in addition to the ⋯ menu.
- ✅ Removed the empty "•" number box beside thumbnails (episode number shows only when present).
- ✅ Shows can be edited (title + paste a cover image/URL) and favorited (heart) from the Shows grid.
- ✅ A 'Recently Listened' tab sits under Library.
- ✅ 'Import' is a button on the Library main panel (opens the Import view with an ✕ to return).
- ✅ Import view lets you add multiple URLs, each appearing as a staged item (thumbnail + metadata) with edit/remove, newest on top.
- ✅ The Import URL field is a single-line text input with a Paste button that auto-adds from the clipboard.
- ✅ Library has an Edit/multi-select mode to bulk-delete episodes or add them to a playlist.

App chrome
- ✅ Sidebar collapses with Ctrl/Cmd+B and a hamburger icon (floating hamburger to reopen).
- ✅ Theme picker ships Dead Terminal + 10 VS Code skins (Dark+/Light+/Monokai/Dracula/Solarized×2/One Dark/Nord/Gruvbox/Night Owl), applied instantly and remembered.
- ✅ Clicking the logo opens Settings; a native cross-platform menu adds a Preferences item with the Cmd/Ctrl+, hotkey.

User/State settings
- ✅ Played progress is tracked and videos resume where you left off (finished state recorded).
- ✅ Progress bars appear on episode rows (plus a finished ✓).
- ✅ The sidebar is editable (Edit sidebar): show/hide system items, reorder (↑/↓), and pin playlists/shows; persisted.