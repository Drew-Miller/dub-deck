// Lightweight app logger. Writes timestamped lines to the local log file
// (via the Rust `append_log` command, which enforces the 250 MB cap) and
// mirrors to the dev console. Use for diagnostics + basic usage metrics.

import { invoke } from "@tauri-apps/api/core";

type Level = "INFO" | "WARN" | "ERROR";

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export function logEvent(level: Level, message: string, data?: unknown): void {
  const ts = new Date().toISOString();
  const extra = data !== undefined ? " " + safeJson(data) : "";
  const line = `${ts} [${level}] ${message}${extra}`;

  // Mirror to the console during development.
  if (level === "ERROR") console.error(line);
  else if (level === "WARN") console.warn(line);
  else console.log(line);

  // Persist to the on-disk log (best effort; never throws into the UI).
  invoke("append_log", { line }).catch(() => {});
}

export const log = {
  info: (msg: string, data?: unknown) => logEvent("INFO", msg, data),
  warn: (msg: string, data?: unknown) => logEvent("WARN", msg, data),
  error: (msg: string, data?: unknown) => logEvent("ERROR", msg, data),
};
