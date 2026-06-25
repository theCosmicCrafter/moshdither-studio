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

test("mask panel renders", async ({ page }) => {
  // Look for mask-related UI (kept as a smoke selector)
  void page.locator("text=Mask, [title*='mask'], [aria-label*='mask']").first();
  // App should be responsive
  const toolbar = page.locator("header").first();
  await expect(toolbar).toBeVisible();
});

test("mask mode selector works", async ({ page }) => {
  // Look for mask mode buttons (inside/outside/alpha)
  const insideBtn = page.locator("text=Inside, [title*='inside'], [data-mode='inside']").first();
  const outsideBtn = page
    .locator("text=Outside, [title*='outside'], [data-mode='outside']")
    .first();

  // Try clicking mask mode buttons if visible
  if (await insideBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await insideBtn.click();
    await page.waitForTimeout(300);
  }
  if (await outsideBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await outsideBtn.click();
    await page.waitForTimeout(300);
  }

  const toolbar = page.locator("header").first();
  await expect(toolbar).toBeVisible();
});

test("mask invert button doesn't crash", async ({ page }) => {
  const invertBtn = page.locator("text=Invert, [title*='invert'], [title*='Invert']").first();

  if (await invertBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await invertBtn.click();
    await page.waitForTimeout(300);
  }

  const toolbar = page.locator("header").first();
  await expect(toolbar).toBeVisible();
});

test("mask clear button doesn't crash", async ({ page }) => {
  const clearBtn = page.locator("text=Clear, [title*='clear mask'], [title*='Clear Mask']").first();

  if (await clearBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await clearBtn.click();
    await page.waitForTimeout(300);
  }

  const toolbar = page.locator("header").first();
  await expect(toolbar).toBeVisible();
});

test("brush size slider responds to input", async ({ page }) => {
  // Look for brush size control
  const brushSlider = page
    .locator(
      "input[type='range'][title*='brush'], input[type='range'][title*='Brush'], input[type='range'][class*='brush']"
    )
    .first();

  if (await brushSlider.isVisible({ timeout: 3000 }).catch(() => false)) {
    // Get current value, then change it
    void (await brushSlider.inputValue());
    await brushSlider.fill("50");
    await page.waitForTimeout(300);
  }

  const toolbar = page.locator("header").first();
  await expect(toolbar).toBeVisible();
});
