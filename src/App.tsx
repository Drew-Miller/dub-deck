import { useState } from "react";
import { usePlayer } from "./lib/state";
import Player from "./features/Player";
import ImportView from "./features/ImportView";
import LibraryView from "./features/LibraryView";
import PlaylistsView from "./features/PlaylistsView";
import FavoritesView from "./features/FavoritesView";
import SettingsView from "./features/SettingsView";
import "./App.css";

type View = "import" | "library" | "playlists" | "favorites" | "settings";

const NAV: { id: View; label: string; icon: string }[] = [
  { id: "import", label: "Import", icon: "＋" },
  { id: "library", label: "Library", icon: "▤" },
  { id: "playlists", label: "Playlists", icon: "≣" },
  { id: "favorites", label: "Favorites", icon: "♥" },
];

const IconUser = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 4-6.5 8-6.5s8 2.5 8 6.5" />
  </svg>
);

// dub-deck mark: a phosphor-green half-disc (◐) on a dark terminal tile.
const IconBrand = () => (
  <svg className="app-brand-icon" width="26" height="26" viewBox="0 0 64 64" aria-hidden="true">
    <rect x="1" y="1" width="62" height="62" rx="15" fill="#0a1610" stroke="#1f3a2b" strokeWidth="2" />
    <circle cx="32" cy="32" r="17" fill="none" stroke="#57d98a" strokeWidth="4" />
    <path d="M32 15 a17 17 0 0 1 0 34 z" fill="#57d98a" />
  </svg>
);

function App() {
  const [view, setView] = useState<View>("library");
  const { current } = usePlayer();

  return (
    <div className={`app-shell ${current ? "with-player" : ""}`}>
      <aside className="app-sidebar">
        <div className="app-brand">
          <IconBrand /> dub-deck
        </div>
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
        <div className="app-sidebar-foot">
          <button
            className={`app-nav-item ${view === "settings" ? "active" : ""}`}
            onClick={() => setView("settings")}
          >
            <span className="app-nav-icon"><IconUser /></span>
            Settings
          </button>
        </div>
      </aside>

      <main className="app-main scroll-y">
        {view === "import" && <ImportView />}
        {view === "library" && <LibraryView />}
        {view === "playlists" && <PlaylistsView />}
        {view === "favorites" && <FavoritesView />}
        {view === "settings" && <SettingsView />}
      </main>

      <Player />
    </div>
  );
}

export default App;
