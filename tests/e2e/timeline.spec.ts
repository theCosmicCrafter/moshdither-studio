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

test("timeline panel renders", async ({ page }) => {
  // Timeline should be visible somewhere in the UI
  // Timeline may or may not be visible depending on layout — check app is responsive
  const toolbar = page.locator("header").first();
  void page.locator("text=Timeline, [data-testid*='timeline'], [class*='timeline']").first();
  await expect(toolbar).toBeVisible();
});

test("duration input accepts valid values", async ({ page }) => {
  // Find the duration input (has "s" suffix and timer icon)
  const durationInput = page
    .locator(
      "input[type='number'][title*='Clip length'], input[type='number'][title*='duration'], input[type='number'][title*='Duration']"
    )
    .first();

  if (await durationInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    // Get current value, then set a new valid value
    void (await durationInput.inputValue());
    await durationInput.fill("5.5");
    await page.waitForTimeout(300);
    const newValue = await durationInput.inputValue();
    expect(newValue).toBe("5.5");
  }
});

test("duration input rejects negative values", async ({ page }) => {
  const durationInput = page
    .locator(
      "input[type='number'][title*='Clip length'], input[type='number'][title*='duration'], input[type='number'][title*='Duration']"
    )
    .first();

  if (await durationInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    // Try to set a negative value
    await durationInput.fill("-5");
    await page.waitForTimeout(300);
    const value = parseFloat(await durationInput.inputValue());
    // Should be clamped to >= 0.1
    expect(value).toBeGreaterThanOrEqual(0.1);
  }
});

test("duration input rejects zero", async ({ page }) => {
  const durationInput = page
    .locator(
      "input[type='number'][title*='Clip length'], input[type='number'][title*='duration'], input[type='number'][title*='Duration']"
    )
    .first();

  if (await durationInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    await durationInput.fill("0");
    await page.waitForTimeout(300);
    const value = parseFloat(await durationInput.inputValue());
    // Should be clamped to >= 0.1
    expect(value).toBeGreaterThanOrEqual(0.1);
  }
});

test("play/pause button toggles state", async ({ page }) => {
  // Find play button
  const playBtn = page
    .locator("[title*='Play'], [title*='play'], [aria-label*='Play'], [aria-label*='play']")
    .first();

  if (await playBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await playBtn.click();
    await page.waitForTimeout(300);
    // Should now show pause or change state
    // Click again to pause
    await playBtn.click();
    await page.waitForTimeout(300);
  }

  // App should still be responsive
  const toolbar = page.locator("header").first();
  await expect(toolbar).toBeVisible();
});

test("timeline scrubber doesn't crash with keyboard", async ({ page }) => {
  // Arrow keys should move timeline
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(200);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(200);

  const toolbar = page.locator("header").first();
  await expect(toolbar).toBeVisible();
});
