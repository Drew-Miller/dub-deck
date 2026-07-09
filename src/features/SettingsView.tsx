// SettingsView — manage the tools dub-deck is allowed to use and the sources you've
// added. Tools are opt-in: dub-deck never installs anything; you point it at binaries
// you've installed. Reached from the sidebar footer gear.

import { useEffect, useState } from "react";
import type { JSX } from "react";
import { invoke } from "@tauri-apps/api/core";
import { appDataDir, join } from "@tauri-apps/api/path";
import { getSetting, setSetting } from "../lib/db";
import { loadToolPath, saveToolPath, type ToolName } from "../lib/downloads";
import { THEMES, applyTheme } from "../lib/themes";
import "./SettingsView.css";

type Status = "unknown" | "ok" | "bad";

function ToolRow({
  label,
  hint,
  name,
  toolKey,
}: {
  label: string;
  hint: string;
  /** Binary name for auto-detect (e.g. "yt-dlp", "ffmpeg"). */
  name: string;
  /** Config-file key the verified path is saved under. */
  toolKey: ToolName;
}): JSX.Element {
  const [path, setPath] = useState("");
  const [status, setStatus] = useState<Status>("unknown");
  const [checking, setChecking] = useState(false);
  const [detecting, setDetecting] = useState(false);

  // Load the saved (already-verified) path from the local config file.
  useEffect(() => {
    loadToolPath(toolKey).then(setPath).catch(() => {});
  }, [toolKey]);

  // A path is only persisted once it verifies, so a typed-but-untested path never
  // overwrites a previously-working one.
  async function test() {
    setChecking(true);
    try {
      const ok = await invoke<boolean>("check_tool", { path: path.trim() });
      setStatus(ok ? "ok" : "bad");
      if (ok) await saveToolPath(toolKey, path);
    } finally {
      setChecking(false);
    }
  }

  // Ask Rust to locate the binary by name and, if found + working, fill + save it.
  async function detect() {
    setDetecting(true);
    try {
      const found = await invoke<string | null>("detect_tool", { name });
      if (found && found.trim()) {
        const resolved = found.trim();
        setPath(resolved);
        setStatus("ok");
        await saveToolPath(toolKey, resolved);
      } else {
        setStatus("bad");
      }
    } finally {
      setDetecting(false);
    }
  }

  return (
    <div className="settings-tool">
      <div className="row spread">
        <div>
          <div className="settings-tool-label">{label}</div>
          <div className="mute settings-tool-hint">{hint}</div>
        </div>
        <span className={`settings-status settings-status-${status}`}>
          {status === "ok" ? "detected" : status === "bad" ? "not found" : "untested"}
        </span>
      </div>
      <div className="row settings-tool-row">
        <input
          className="grow"
          placeholder="Path to the binary (e.g. C:\\tools\\yt-dlp.exe or /usr/local/bin/yt-dlp)"
          value={path}
          onChange={(e) => { setPath(e.target.value); setStatus("unknown"); }}
        />
        <button className="btn btn-ghost" onClick={() => void detect()} disabled={detecting}>
          {detecting ? "Searching…" : "Find automatically"}
        </button>
        <button className="btn btn-ghost" onClick={() => void test()} disabled={!path.trim() || checking}>
          {checking ? "Testing…" : "Test"}
        </button>
      </div>
    </div>
  );
}

export default function SettingsView(): JSX.Element {
  const [downloadsDir, setDownloadsDir] = useState("");
  const [theme, setTheme] = useState("dead-terminal");

  useEffect(() => {
    (async () => {
      try {
        setDownloadsDir(await join(await appDataDir(), "downloads"));
      } catch {
        /* ignore */
      }
    })();
    getSetting("ui.theme").then((v) => v && setTheme(v)).catch(() => {});
  }, []);

  function pickTheme(id: string) {
    setTheme(id);
    applyTheme(id);
    void setSetting("ui.theme", id);
  }

  return (
    <div className="settings-view">
      <h1 className="settings-title">Settings</h1>

      <section className="settings-section card">
        <h3>Theme</h3>
        <p className="mute">Pick a skin — applies instantly and is remembered.</p>
        <div className="theme-grid">
          {THEMES.map((t) => (
            <button
              key={t.id}
              className={`theme-swatch${theme === t.id ? " active" : ""}`}
              onClick={() => pickTheme(t.id)}
              title={t.name}
            >
              <span className="theme-dot" style={{ background: t.swatch }} />
              <span className="theme-name">{t.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section card">
        <h3>Tools</h3>
        <p className="mute">
          Opt-in external tools. dub-deck never installs these — point it at binaries you've
          installed. Downloads/scrape for the relevant sources light up once a tool is set.
        </p>
        <ToolRow
          label="yt-dlp"
          hint="Enables downloading (and scrape-playback) of YouTube / Vimeo sources."
          name="yt-dlp"
          toolKey="ytdlp"
        />
        <ToolRow
          label="ffmpeg"
          hint="Enables downloading HLS (.m3u8) streams to a single file."
          name="ffmpeg"
          toolKey="ffmpeg"
        />
      </section>

      <section className="settings-section card">
        <h3>Downloads</h3>
        <p className="mute">Downloaded episodes are stored here and play offline.</p>
        <code className="settings-path">{downloadsDir}</code>
      </section>
    </div>
  );
}
