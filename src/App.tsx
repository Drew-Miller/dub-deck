import { useState } from "react";
import { usePlayer, useBumpLibrary } from "./lib/state";
import { pickAndImport } from "./lib/importer";
import Player from "./features/Player";
import LibraryView from "./features/LibraryView";
import PlaylistsView from "./features/PlaylistsView";
import FavoritesView from "./features/FavoritesView";
import ShuffleView from "./features/ShuffleView";
import "./App.css";

type View = "library" | "playlists" | "favorites" | "shuffle";

const NAV: { id: View; label: string; icon: string }[] = [
  { id: "library", label: "Library", icon: "▤" },
  { id: "shuffle", label: "Shuffle", icon: "🔀" },
  { id: "playlists", label: "Playlists", icon: "≣" },
  { id: "favorites", label: "Liked & Favorites", icon: "♥" },
];

function App() {
  const [view, setView] = useState<View>("library");
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const bump = useBumpLibrary();
  const { current } = usePlayer();

  async function handleImport() {
    if (importing) return;
    setImporting(true);
    try {
      const result = await pickAndImport();
      if (result && result.imported > 0) {
        bump();
        const showLabel =
          result.shows.length === 1 ? ` to ${result.shows[0]}` : "";
        const failLabel = result.failed ? ` (${result.failed} failed)` : "";
        setToast(
          `Imported ${result.imported} episode${result.imported === 1 ? "" : "s"}${showLabel}${failLabel}`
        );
      } else if (result && result.imported === 0) {
        setToast("Nothing imported");
      }
    } catch (e) {
      setToast(`Import failed: ${String(e)}`);
    } finally {
      setImporting(false);
      setTimeout(() => setToast(null), 4000);
    }
  }

  return (
    <div className={`app-shell ${current ? "with-player" : ""}`}>
      <aside className="app-sidebar">
        <div className="app-brand">
          <span className="app-brand-mark">◐</span> dub-deck
        </div>
        <button
          className="btn btn-primary app-import"
          onClick={handleImport}
          disabled={importing}
        >
          {importing ? "Importing…" : "＋ Import episodes"}
        </button>
        <nav className="app-nav">
          {NAV.map((n) => (
            <button
              key={n.id}
              className={`app-nav-item ${view === n.id ? "active" : ""}`}
              onClick={() => setView(n.id)}
            >
              <span className="app-nav-icon">{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>
        <div className="app-sidebar-foot mute">Local library · files referenced in place</div>
      </aside>

      <main className="app-main scroll-y">
        {view === "library" && <LibraryView />}
        {view === "playlists" && <PlaylistsView />}
        {view === "favorites" && <FavoritesView />}
        {view === "shuffle" && <ShuffleView />}
      </main>

      <Player />

      {toast && <div className="app-toast card">{toast}</div>}
    </div>
  );
}

export default App;
