import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { PlayerProvider, RefreshProvider } from "./lib/state";
import { enableYtDlpScrape } from "./lib/scrapeBackend";
import "./theme.css";

// Scrape playback of youtube/vimeo/scrape sources routes through a user-configured
// yt-dlp (set in Settings); inert until then.
enableYtDlpScrape();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RefreshProvider>
      <PlayerProvider>
        <App />
      </PlayerProvider>
    </RefreshProvider>
  </React.StrictMode>,
);
