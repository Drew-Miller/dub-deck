Dub Deck

Handoff

Appearance
- Make side bar width mouse draggable within reasonable min & max widths set
- Make ‘Recently Added’ default sort selection
- Add ‘Ascending/Descending’ button to the right of the sort selector
- Move the ‘favorites only’ filter up by the other top row of controls
- Embedded YouTube videos show YouTube and Dub-Deck’s control overlays. Use our controls only if possible so our controls will work for all video sources.
- I want the ‘source type’ of the video enabled in the library list view, some icon or coloring of text.
- I want to see borders between the list options. For instance, Library view click options -> play next, add to queue | Download | Edit | Delete -> And add icons!
- I want to see more information from the videos including the source like url or file path. If the video was url and downloaded in some manner ensure the file path also shows up for downloaded url videos.
- I want to see a THUMBNAIL for the videos. This includes url sourced, YouTube sourced, and downloaded videos. If no thumbnail is available, show a ‘no image’ icon and color. The user should be able to easily copy and paste an image in the edit song page from the internet browser. By this I mostly mean allow paste from mouse within a large area you click.
- I want similar thumbnail option for ‘shows’ and you can click a shows sidebar tab. The shows will be sorted from last updated/recently added and the view of the shows will be square ‘album cover icon’ view.
- I also want a 'Recently listened to' tab on the side right under library.
- 'Import' should be a button on the Main Panel of 'Library'
- 

User/State settings
- I also want played progress on videos. A user can see how far he is watching the video, and the videos he's finished watching. if I leave a video and come back, I will see the video know and start where I last left off.
- The sidebar options like 'Library', 'Playlists', 'Recently Played', 'Favorite Songs':
  - Will have an edit button
  - 'Pinabble' items and playlists and albums can be pinned to the sidebar.
  - Removable. If the user removes the 'system sidebar options', the will just be unchecked and appear while editing the sidebar
  - The order can change
  - You can include other system options you think the user might want here.

- Sidebar collapse with ctrl+b and has hamburger icon to click
- Theme pickers w/ default skins shipped. Think about VS Code theme marketplace. For now, pick ten vs code popular themes that show a variety of styles available by default shipped with the app for now. Selecting the 'Logo/band' area will bring up app options or have a menu bar iem for app settings you can open them. Remember this is a cross platform app with cross platform menus and also with cmd+, and ctrl+, hotkeys enabled.

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