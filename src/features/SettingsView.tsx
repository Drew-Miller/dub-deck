// SettingsView — manage the tools dub-deck is allowed to use and the sources you've
// added. Tools are opt-in: dub-deck never installs anything; you point it at binaries
// you've installed. Reached from the sidebar footer gear.

import { useEffect, useState } from "react";
import type { JSX } from "react";
import { invoke } from "@tauri-apps/api/core";
import { appDataDir, join } from "@tauri-apps/api/path";
import { getSetting, setSetting } from "../lib/db";
import { SETTING_KEYS } from "../lib/downloads";
import FeedsView from "./FeedsView";
import "./SettingsView.css";

type Status = "unknown" | "ok" | "bad";

function ToolRow({ label, hint, settingKey }: { label: string; hint: string; settingKey: string }): JSX.Element {
  const [path, setPath] = useState("");
  const [status, setStatus] = useState<Status>("unknown");
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    getSetting(settingKey).then((v) => setPath(v ?? "")).catch(() => {});
  }, [settingKey]);

  async function persist() {
    await setSetting(settingKey, path.trim());
    setStatus("unknown");
  }

  async function test() {
    setChecking(true);
    try {
      await setSetting(settingKey, path.trim());
      const ok = await invoke<boolean>("check_tool", { path: path.trim() });
      setStatus(ok ? "ok" : "bad");
    } finally {
      setChecking(false);
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
          onChange={(e) => setPath(e.target.value)}
          onBlur={() => void persist()}
        />
        <button className="btn btn-ghost" onClick={() => void test()} disabled={!path.trim() || checking}>
          {checking ? "Testing…" : "Test"}
        </button>
      </div>
    </div>
  );
}

export default function SettingsView(): JSX.Element {
  const [downloadsDir, setDownloadsDir] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setDownloadsDir(await join(await appDataDir(), "downloads"));
      } catch {
        /* ignore */
      }
    })();
  }, []);

  return (
    <div className="settings-view">
      <h1 className="settings-title">Settings</h1>

      <section className="settings-section card">
        <h3>Tools</h3>
        <p className="mute">
          Opt-in external tools. dub-deck never installs these — point it at binaries you've
          installed. Downloads/scrape for the relevant sources light up once a tool is set.
        </p>
        <ToolRow
          label="yt-dlp"
          hint="Enables downloading (and scrape-playback) of YouTube / Vimeo sources."
          settingKey={SETTING_KEYS.ytdlp}
        />
        <ToolRow
          label="ffmpeg"
          hint="Enables downloading HLS (.m3u8) streams to a single file."
          settingKey={SETTING_KEYS.ffmpeg}
        />
      </section>

      <section className="settings-section card">
        <h3>Downloads</h3>
        <p className="mute">Downloaded episodes are stored here and play offline.</p>
        <code className="settings-path">{downloadsDir}</code>
      </section>

      <section className="settings-section">
        <h3 className="settings-sources-head">Sources</h3>
        <FeedsView />
      </section>
    </div>
  );
}
