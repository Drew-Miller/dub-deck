import { test, expect, type Page, type Locator } from "@playwright/test";
import { install, SEED } from "./support/tauriStub";

// Geometry helpers: assert relationships, never pixel values.
async function box(loc: Locator) {
  const b = await loc.boundingBox();
  if (!b) throw new Error("element has no bounding box (not visible?)");
  return { ...b, right: b.x + b.width, bottom: b.y + b.height };
}

test.beforeEach(async ({ page }: { page: Page }) => {
  await page.addInitScript(install, SEED);
  await page.goto("/");
  await page.locator(".app-sidebar").waitFor();
});

test.describe("app shell — relative placement", () => {
  test("sidebar sits to the LEFT of the main panel", async ({ page }) => {
    const sidebar = await box(page.locator(".app-sidebar"));
    const main = await box(page.locator(".app-main"));
    expect(sidebar.right).toBeLessThanOrEqual(main.x + 1);
  });

  test("brand sits ABOVE the nav list within the sidebar", async ({ page }) => {
    const brand = await box(page.locator(".app-brand"));
    const nav = await box(page.locator(".app-nav"));
    expect(brand.bottom).toBeLessThanOrEqual(nav.y + 1);
  });

  test("Settings footer sits BELOW the nav list", async ({ page }) => {
    const nav = await box(page.locator(".app-nav"));
    const foot = await box(page.locator(".app-sidebar-foot"));
    expect(foot.y).toBeGreaterThanOrEqual(nav.y);
  });
});

test.describe("episode views — Library-style consistency", () => {
  test("Favorites renders the shared episode row, not the old card list", async ({ page }) => {
    await page.getByRole("button", { name: /Favorites/ }).first().click();
    await page.locator(".episode-row").first().waitFor();
    expect(await page.locator(".episode-row").count()).toBeGreaterThan(0);
    // the retired dd-row card-list markup must be gone from episode views
    expect(await page.locator(".dd-row").count()).toBe(0);
  });
});

test.describe("player — relative placement", () => {
  test("clicking an episode opens a player that FILLS the window", async ({ page }) => {
    await page.locator(".episode-row").first().click();
    const player = page.locator(".ddp-expanded");
    await player.waitFor();

    const b = await box(player);
    const vp = page.viewportSize()!;
    expect(b.x).toBeLessThanOrEqual(1);
    expect(b.y).toBeLessThanOrEqual(1);
    expect(b.width).toBeGreaterThanOrEqual(vp.width * 0.95);
    expect(b.height).toBeGreaterThanOrEqual(vp.height * 0.95);
  });

  test("collapsing docks the mini bar BELOW main and RIGHT OF the sidebar", async ({ page }) => {
    await page.locator(".episode-row").first().click();
    await page.locator(".ddp-expanded").waitFor();
    await page.locator(".ddp-close").click();

    const mini = await box(page.locator(".ddp-mini"));
    const sidebar = await box(page.locator(".app-sidebar"));
    const main = await box(page.locator(".app-main"));

    // docked at the bottom: its top is below the main panel's top
    expect(mini.y).toBeGreaterThan(main.y);
    // starts at/after the sidebar's right edge (does not overlap the sidebar)
    expect(mini.x).toBeGreaterThanOrEqual(sidebar.right - 1);
  });
});
