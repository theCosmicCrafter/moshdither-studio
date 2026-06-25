import { expect, test } from "@playwright/test";
import { tauriMockScript } from "./mocks/tauri-mock";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(tauriMockScript);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-testid='app-layout'], .app-layout", { timeout: 15000 });
  await page
    .locator("text=Discard")
    .click({ timeout: 2000 })
    .catch(() => {});
  await page
    .locator("text=Skip")
    .click({ timeout: 2000 })
    .catch(() => {});
  await page
    .locator("text=Get Started")
    .click({ timeout: 2000 })
    .catch(() => {});
});

test("proxy media panel is visible", async ({ page }) => {
  const proxyPanel = page.locator("text=Proxy Media").first();
  await expect(proxyPanel).toBeVisible({ timeout: 10000 });
});

async function openPanelTab(page: import("@playwright/test").Page, panelId: string) {
  const tab = page.locator(`[data-testid="dock-tab-${panelId}"]`).first();
  await tab.click();
  await page.waitForTimeout(300);
}

test("proxy panel has generate button", async ({ page }) => {
  await openPanelTab(page, "proxy");
  const generateBtn = page.locator("text=Generate Proxy").first();
  await expect(generateBtn).toBeVisible({ timeout: 10000 });
});

test("proxy panel has quality slider", async ({ page }) => {
  await openPanelTab(page, "proxy");
  const qualityLabel = page.locator("text=/Quality \\(CRF\\):/").first();
  await expect(qualityLabel).toBeVisible({ timeout: 10000 });
});

test("tracks panel is visible", async ({ page }) => {
  const tracksPanel = page.locator("text=Tracks").first();
  await expect(tracksPanel).toBeVisible({ timeout: 10000 });
});

test("tracks panel add button creates a track", async ({ page }) => {
  await openPanelTab(page, "tracks");
  const addBtn = page.locator("text=+ Add").first();
  await expect(addBtn).toBeVisible({ timeout: 10000 });
  await addBtn.click();
  // After clicking add, a track with default name should appear
  await expect(page.locator("input[value='Track 1']").first()).toBeVisible({ timeout: 5000 });
});

test("tracks panel shows empty state when no tracks", async ({ page }) => {
  await openPanelTab(page, "tracks");
  const emptyState = page.locator("text=No tracks").first();
  await expect(emptyState).toBeVisible({ timeout: 10000 });
});
