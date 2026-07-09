import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Vitest runs the frontend logic (queue engine, query builders) in jsdom.
// Layout/appearance assertions live in Playwright (tests/e2e) — jsdom has no
// layout engine, so relative-position checks belong there, not here.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.{test,spec}.{ts,tsx}"],
    setupFiles: ["tests/unit/setup.ts"],
    clearMocks: true,
  },
});
