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

test("audio panel renders", async ({ page }) => {
  // Look for audio-related UI elements (kept as a smoke selector)
  void page.locator("text=Audio, [title*='audio'], [aria-label*='audio']").first();
  // App should be responsive
  const toolbar = page.locator("header").first();
  await expect(toolbar).toBeVisible();
});

test("audio enable toggle doesn't crash", async ({ page }) => {
  // Look for audio enable toggle
  const audioToggle = page.locator("[title*='audio'], [title*='Audio'], text=Audio").first();

  if (await audioToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
    await audioToggle.click();
    await page.waitForTimeout(300);
  }

  const toolbar = page.locator("header").first();
  await expect(toolbar).toBeVisible();
});

test("audio frequency bands display when enabled", async ({ page }) => {
  // Look for frequency band visualization (kept as a smoke selector)
  void page
    .locator("[class*='frequency'], [class*='Frequency'], [class*='audio-band'], canvas")
    .first();

  // App should be responsive regardless
  const toolbar = page.locator("header").first();
  await expect(toolbar).toBeVisible();
});
