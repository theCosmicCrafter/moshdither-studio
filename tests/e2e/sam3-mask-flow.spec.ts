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

test("SAM3 auto-mask flow returns mask candidates", async ({ page }) => {
  // Load a test media file through the File menu.
  await page.locator("header button:has-text('File')").click();
  await page.locator("text=Open File").click();

  await expect(
    page.locator('[data-testid="preview-viewport"] span', { hasText: /TEST_CLIP\.MP4/i }).first()
  ).toBeVisible({
    timeout: 10000,
  });

  // Switch to the Mask panel and run auto-mask. It isn't part of the default
  // dock layout, so it must be added via the panel rail before its tab
  // exists. flexlayout gives every docked tab a real role="tab" + accessible
  // name matching its label -- more robust than a custom testid, since
  // flexlayout also renders an aria-hidden "stamp" copy of each tab (for its
  // drag-preview system) that a testid selector would ambiguously match too.
  const maskTab = page.getByRole("tab", { name: "Mask" });
  if (!(await maskTab.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: /^Add Mask panel/ }).click();
  }
  await maskTab.click();
  await page.getByRole("button", { name: "SAM3" }).click();

  // Ensure auto mode is selected.
  const modeSelect = page.locator("select", {
    has: page.locator('option[value="auto"]'),
  });
  await expect(modeSelect).toBeVisible({ timeout: 5000 });
  await modeSelect.selectOption("auto");

  await page
    .locator("button:has-text('Start SAM3 & Auto Mask'), button:has-text('Auto Mask')")
    .first()
    .click();

  // The mock returns two mask candidates; verify the selector appears.
  await expect(page.locator("text=Mask Candidates (2)").first()).toBeVisible({ timeout: 15000 });
});
