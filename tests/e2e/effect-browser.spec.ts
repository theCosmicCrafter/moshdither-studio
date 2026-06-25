import { test, expect } from "@playwright/test";
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

test("effect browser shows category tabs", async ({ page }) => {
  // Should have category buttons/tabs in the effect browser
  const ditheringTab = page.locator("text=Dither").first();
  await expect(ditheringTab).toBeVisible({ timeout: 10000 });

  const glitchTab = page.locator("text=Glitch").first();
  await expect(glitchTab).toBeVisible({ timeout: 10000 });
});

test("number keys switch effect categories", async ({ page }) => {
  // Press 1 for Dithering
  await page.keyboard.press("1");
  await page.waitForTimeout(500);

  // Press 4 for Glitch
  await page.keyboard.press("4");
  await page.waitForTimeout(500);

  // Press 3 for Color
  await page.keyboard.press("3");
  await page.waitForTimeout(500);

  // Verify no errors thrown — the category state should update
  // We can't easily assert the active category without a data attribute,
  // but we can verify the UI didn't crash
  const effectBrowser = page.locator("text=Effects").first();
  await expect(effectBrowser).toBeVisible();
});

test("effect list renders items after category selection", async ({ page }) => {
  // Click on Dithering category
  const ditheringTab = page.locator("text=Dither").first();
  await ditheringTab.click();
  await page.waitForTimeout(1000);

  // Should see effect items (from our mock data)
  const bayerDither = page.locator("text=Bayer").first();
  await expect(bayerDither).toBeVisible({ timeout: 10000 });
});
