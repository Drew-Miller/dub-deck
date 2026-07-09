import { defineConfig, devices } from "@playwright/test";

// Relative-position layout tests run against the real frontend (Vite dev server) in
// Chromium, with the Tauri backend stubbed in the browser (tests/e2e/support/tauriStub).
// Real geometry is the whole point — jsdom can't do it — so assertions are relational
// (left-of / above / below), never fixed pixels.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  fullyParallel: true,
  use: {
    baseURL: "http://localhost:1420",
    viewport: { width: 1280, height: 800 },
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:1420",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
