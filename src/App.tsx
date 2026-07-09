import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { listen } from "@tauri-apps/api/event";
import { usePlayer, useLibraryVersion } from "./lib/state";
import { getSetting, setSetting, listPlaylists, listShowsRecent } from "./lib/db";
import type { Playlist, Show } from "./types";
import Player from "./features/Player";
import ImportView from "./features/ImportView";
import LibraryView from "./features/LibraryView";
import PlaylistsView from "./features/PlaylistsView";
import RecentlyListenedView from "./features/RecentlyListenedView";
import FavoritesView from "./features/FavoritesView";
import ShowsView from "./features/ShowsView";
import SettingsView from "./features/SettingsView";
import "./App.css";

type View = "library" | "playlists" | "recent" | "favorites" | "shows" | "import" | "settings";
type SysId = "library" | "shows" | "playlists" | "recent" | "favorites";

const SYS_META: Record<SysId, { label: string; icon: string; view: View }> = {
  library: { label: "Library", icon: "▤", view: "library" },
  shows: { label: "Shows", icon: "▦", view: "shows" },
  playlists: { label: "Playlists", icon: "≣", view: "playlists" },
  recent: { label: "Recently Listened", icon: "⏱", view: "recent" },
  favorites: { label: "Favorites", icon: "♥", view: "favorites" },
};

type Entry =
  | { kind: "system"; id: SysId; visible: boolean }
  | { kind: "playlist"; id: number; visible: boolean }
  | { kind: "show"; id: number; visible: boolean };

const DEFAULT_SIDEBAR: Entry[] = [
  { kind: "system", id: "library", visible: true },
  { kind: "system", id: "playlists", visible: true },
  { kind: "system", id: "recent", visible: true },
  { kind: "system", id: "favorites", visible: true },
  { kind: "system", id: "shows", visible: false },
];

const SIDEBAR_MIN = 180;
const SIDEBAR_MAX = 420;

const IconUser = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 4-6.5 8-6.5s8 2.5 8 6.5" />
  </svg>
);

const IconBrand = () => (
  <svg className="app-brand-icon" width="26" height="26" viewBox="0 0 64 64" aria-hidden="true">
    <rect x="1" y="1" width="62" height="62" rx="15" fill="#0a1610" stroke="#1f3a2b" strokeWidth="2" />
    <circle cx="32" cy="32" r="17" fill="none" stroke="#57d98a" strokeWidth="4" />
    <path d="M32 15 a17 17 0 0 1 0 34 z" fill="#57d98a" />
  </svg>
);

function App() {
  const [view, setView] = useState<View>("library");
  const [sidebarW, setSidebarW] = useState(244);
  const [collapsed, setCollapsed] = useState(false);
  const [sidebar, setSidebar] = useState<Entry[]>(DEFAULT_SIDEBAR);
  const [editingSidebar, setEditingSidebar] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [shows, setShows] = useState<Show[]>([]);
  const [openPlaylist, setOpenPlaylist] = useState<number | undefined>(undefined);
  const [openShow, setOpenShow] = useState<number | undefined>(undefined);
  const draggingRef = useRef(false);
  const { current } = usePlayer();
  const version = useLibraryVersion();

  // Load the persisted sidebar config; load playlists/shows for pin labels + picker.
  useEffect(() => {
    getSetting("ui.sidebar")
      .then((raw) => {
        if (!raw) return;
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setSidebar(parsed);
        } catch {
          /* ignore */
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    listPlaylists().then(setPlaylists).catch(() => {});
    listShowsRecent().then(setShows).catch(() => {});
  }, [version]);

  // Keyboard: Ctrl/Cmd+B toggles the sidebar; Ctrl/Cmd+, opens Settings.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "b" || e.key === "B")) {
        e.preventDefault();
        setCollapsed((c) => !c);
      } else if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        setCollapsed(false);
        setView("settings");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const un = listen("open-settings", () => {
      setCollapsed(false);
      setView("settings");
    });
    return () => { void un.then((f) => f()); };
  }, []);

  // Draggable sidebar width.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      setSidebarW(Math.max(SIDEBAR_MIN, Math.min(e.clientX, SIDEBAR_MAX)));
    };
    const onUp = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const startResize = () => {
    draggingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  function saveSidebar(next: Entry[]) {
    setSidebar(next);
    void setSetting("ui.sidebar", JSON.stringify(next));
  }
  const toggleVisible = (i: number) =>
    saveSidebar(sidebar.map((e, idx) => (idx === i ? { ...e, visible: !e.visible } : e)));
  const onDropAt = (dropIndex: number) => {
    if (dragIndex == null || dragIndex === dropIndex) return;
    const next = sidebar.slice();
    const [moved] = next.splice(dragIndex, 1);
    next.splice(dropIndex, 0, moved);
    saveSidebar(next);
    setDragIndex(null);
  };
  const removeEntry = (i: number) => saveSidebar(sidebar.filter((_, idx) => idx !== i));
  const addPin = (kind: "playlist" | "show", id: number) => {
    if (sidebar.some((e) => e.kind === kind && e.id === id)) return;
    saveSidebar([...sidebar, { kind, id, visible: true }]);
  };

  const goSystem = (sys: SysId) => {
    setView(SYS_META[sys].view);
    if (sys === "playlists") setOpenPlaylist(undefined);
    if (sys === "shows") setOpenShow(undefined);
  };
  const goPlaylist = (id: number) => { setView("playlists"); setOpenPlaylist(id); };
  const goShow = (id: number) => { setView("shows"); setOpenShow(id); };

  function entryMeta(entry: Entry) {
    if (entry.kind === "system") {
      const m = SYS_META[entry.id];
      const active =
        view === m.view &&
        (entry.id !== "playlists" || openPlaylist == null) &&
        (entry.id !== "shows" || openShow == null);
      return { label: m.label, icon: m.icon, onClick: () => goSystem(entry.id), active };
    }
    if (entry.kind === "playlist") {
      const p = playlists.find((x) => x.id === entry.id);
      if (!p) return null;
      return { label: p.name, icon: "≣", onClick: () => goPlaylist(entry.id), active: view === "playlists" && openPlaylist === entry.id };
    }
    const s = shows.find((x) => x.id === entry.id);
    if (!s) return null;
    return { label: s.title, icon: "▦", onClick: () => goShow(entry.id), active: view === "shows" && openShow === entry.id };
  }

  const unpinnedPlaylists = playlists.filter((p) => !sidebar.some((e) => e.kind === "playlist" && e.id === p.id));
  const unpinnedShows = shows.filter((s) => !sidebar.some((e) => e.kind === "show" && e.id === s.id));

  return (
    <div
      className={`app-shell ${current ? "with-player" : ""}${collapsed ? " collapsed" : ""}`}
      style={{ ["--sidebar-w" as string]: `${collapsed ? 0 : sidebarW}px` } as CSSProperties}
    >
      {collapsed && (
        <button className="app-hamburger-float icon-btn" onClick={() => setCollapsed(false)} title="Show sidebar (Ctrl+B)">☰</button>
      )}
      <aside className="app-sidebar">
        <div className="app-brand">
          <button className="app-hamburger icon-btn" onClick={() => setCollapsed(true)} title="Collapse sidebar (Ctrl+B)">☰</button>
          <button className="app-brand-btn" onClick={() => setView("settings")} title="App settings">
            <IconBrand /> dub-deck
          </button>
        </div>

        <nav className="app-nav scroll-y">
          {sidebar.map((entry, i) => {
            const m = entryMeta(entry);
            if (editingSidebar) {
              const label = m?.label ?? (entry.kind === "playlist" ? "(deleted playlist)" : entry.kind === "show" ? "(deleted show)" : "");
              const icon = m?.icon ?? (entry.kind === "show" ? "▦" : "≣");
              return (
                <div
                  key={`${entry.kind}-${entry.id}`}
                  className={`app-nav-edit${dragIndex === i ? " dragging" : ""}`}
                  draggable
                  onDragStart={() => setDragIndex(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDropAt(i)}
                  onDragEnd={() => setDragIndex(null)}
                >
                  <span className="app-nav-drag" aria-hidden="true">⠿</span>
                  <button
                    className={`app-nav-toggle${entry.visible ? " on" : ""}`}
                    onClick={() => toggleVisible(i)}
                    title={entry.visible ? "Shown — click to hide" : "Hidden — click to show"}
                  >
                    {entry.visible && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                  <span className="app-nav-icon">{icon}</span>
                  <span className="truncate app-nav-edit-label">{label}</span>
                  {entry.kind !== "system" && (
                    <button className="icon-btn app-nav-remove" title="Unpin" onClick={() => removeEntry(i)}>✕</button>
                  )}
                </div>
              );
            }
            if (!entry.visible || !m) return null;
            return (
              <button key={`${entry.kind}-${entry.id}`} className={`app-nav-item ${m.active ? "active" : ""}`} onClick={m.onClick}>
                <span className="app-nav-icon">{m.icon}</span>
                <span className="truncate">{m.label}</span>
              </button>
            );
          })}

          {editingSidebar && (
            <div className="app-pin-adder">
              {unpinnedPlaylists.length > 0 && (
                <select defaultValue="" onChange={(e) => { if (e.target.value) addPin("playlist", Number(e.target.value)); e.currentTarget.value = ""; }}>
                  <option value="">＋ Pin a playlist…</option>
                  {unpinnedPlaylists.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
              {unpinnedShows.length > 0 && (
                <select defaultValue="" onChange={(e) => { if (e.target.value) addPin("show", Number(e.target.value)); e.currentTarget.value = ""; }}>
                  <option value="">＋ Pin a show…</option>
                  {unpinnedShows.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                </select>
              )}
            </div>
          )}

          <button className="app-nav-item app-sidebar-edit" onClick={() => setEditingSidebar((v) => !v)}>
            <span className="app-nav-icon">✎</span>
            {editingSidebar ? "Done" : "Edit sidebar"}
          </button>
        </nav>

        <div className="app-sidebar-foot">
          <button className={`app-nav-item ${view === "settings" ? "active" : ""}`} onClick={() => setView("settings")}>
            <span className="app-nav-icon"><IconUser /></span>
            Settings
          </button>
        </div>
        <div className="app-sidebar-resizer" onMouseDown={startResize} title="Drag to resize" />
      </aside>

      <main className="app-main scroll-y">
        {view === "library" && <LibraryView onImport={() => setView("import")} />}
        {view === "import" && <ImportView onClose={() => setView("library")} />}
        {view === "playlists" && <PlaylistsView openId={openPlaylist} />}
        {view === "recent" && <RecentlyListenedView />}
        {view === "favorites" && <FavoritesView />}
        {view === "shows" && <ShowsView openId={openShow} />}
        {view === "settings" && <SettingsView />}
      </main>

      <Player />
    </div>
  );
}

export default App;
