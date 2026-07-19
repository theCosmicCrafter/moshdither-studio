import { expect, test } from "@playwright/test";
import { tauriMockWithMediaScript } from "./mocks/tauri-mock-with-media";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(tauriMockWithMediaScript);
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

test("export video flow produces a status message", async ({ page }) => {
  // Load a test media file through the File menu.
  await page.locator("header button:has-text('File')").click();
  await page.locator("text=Open File").click();

  // Wait for the media to be loaded and preview refreshed.
  await expect(
    page.locator('[data-testid="preview-viewport"] span', { hasText: /TEST_CLIP\.MP4/i }).first()
  ).toBeVisible({ timeout: 10000 });

  // Add an effect so the export button is enabled.
  await page.locator("text=Bayer Dither").first().click();

  // Switch to the Export panel.
  await page.locator('[data-testid="dock-tab-export"]').click();

  // Click the main export button and wait for the mocked backend to complete.
  await page.locator("button:has-text('Export Video')").click();

  await expect(
    page.locator('[data-testid="status-message"]', { hasText: /Exported:/i }).first()
  ).toBeVisible({ timeout: 15000 });
});
