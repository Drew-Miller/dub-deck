import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { PlayerProvider, RefreshProvider } from "./lib/state";
import { enableYtDlpScrape } from "./lib/scrapeBackend";
import { applyTheme, DEFAULT_THEME_ID } from "./lib/themes";
import { getSetting } from "./lib/db";
import "./theme.css";

// Scrape playback of youtube/vimeo/scrape sources routes through a user-configured
// yt-dlp (set in Settings); inert until then.
enableYtDlpScrape();

// Apply the saved skin as early as possible.
getSetting("ui.theme")
  .then((id) => applyTheme(id ?? DEFAULT_THEME_ID))
  .catch(() => applyTheme(DEFAULT_THEME_ID));

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RefreshProvider>
      <PlayerProvider>
        <App />
      </PlayerProvider>
    </RefreshProvider>
  </React.StrictMode>,
);
