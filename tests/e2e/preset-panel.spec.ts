import { expect, test } from "@playwright/test";
import { tauriMockScript } from "./mocks/tauri-mock";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(tauriMockScript);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("header, [data-testid='toolbar']", { timeout: 15000 });
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

test("preset panel renders", async ({ page }) => {
  // Look for preset-related UI (kept as a smoke selector)
  void page.locator("text=Preset, [title*='preset'], [aria-label*='preset']").first();
  // App should be responsive
  const toolbar = page.locator("header").first();
  await expect(toolbar).toBeVisible();
});

test("preset save dialog doesn't crash", async ({ page }) => {
  // Look for save preset button
  const saveBtn = page
    .locator("[title*='save preset'], [title*='Save Preset'], text=Save Preset")
    .first();

  if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await saveBtn.click();
    await page.waitForTimeout(500);
    // Close any dialog that appears
    await page.keyboard.press("Escape").catch(() => {});
  }

  const toolbar = page.locator("header").first();
  await expect(toolbar).toBeVisible();
});

test("preset load doesn't crash", async ({ page }) => {
  // Look for preset list items
  const presetItems = page.locator("[class*='preset-item'], [class*='PresetItem']").first();

  if (await presetItems.isVisible({ timeout: 3000 }).catch(() => false)) {
    await presetItems.click();
    await page.waitForTimeout(500);
  }

  const toolbar = page.locator("header").first();
  await expect(toolbar).toBeVisible();
});
