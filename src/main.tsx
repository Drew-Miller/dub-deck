import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { PlayerProvider, RefreshProvider } from "./lib/state";
import "./theme.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RefreshProvider>
      <PlayerProvider>
        <App />
      </PlayerProvider>
    </RefreshProvider>
  </React.StrictMode>,
);
