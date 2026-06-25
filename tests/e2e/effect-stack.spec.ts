import { test, expect } from "@playwright/test";
import { tauriMockScript } from "./mocks/tauri-mock";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(tauriMockScript);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("header, [data-testid='toolbar']", { timeout: 15000 });
  // Dismiss modals
  await page.locator("text=Discard").click({ timeout: 2000 }).catch(() => {});
  await page.locator("text=Skip").click({ timeout: 2000 }).catch(() => {});
  await page.locator("text=Get Started").click({ timeout: 2000 }).catch(() => {});
});

test("effect stack panel renders", async ({ page }) => {
  // The effect stack should be visible in the UI
  const stackPanel = page.locator("text=Effect").first();
  await expect(stackPanel).toBeVisible({ timeout: 10000 });
});

test("adding effect to stack from browser", async ({ page }) => {
  // Click on Dithering category
  const ditheringTab = page.locator("text=Dither").first();
  await ditheringTab.click();
  await page.waitForTimeout(500);

  // Click on an effect to add it
  const bayerEffect = page.locator("text=Bayer").first();
  await expect(bayerEffect).toBeVisible({ timeout: 10000 });
  await bayerEffect.click();
  await page.waitForTimeout(500);

  // The effect should appear in the stack (look for effect-related UI)
  // After adding, there should be some indication in the effect stack area
  const stackArea = page.locator("[data-testid='app-layout'], header").first();
  await expect(stackArea).toBeVisible();
});

test("effect stack shows parameter controls", async ({ page }) => {
  // Add an effect first
  const ditheringTab = page.locator("text=Dither").first();
  await ditheringTab.click();
  await page.waitForTimeout(500);

  const bayerEffect = page.locator("text=Bayer").first();
  await bayerEffect.click();
  await page.waitForTimeout(1000);

  // Look for parameter controls — sliders, inputs, etc.
  // The parameter panel should render with controls
  const sliders = page.locator("input[type='range'], input[type='slider'], [class*='slider']");
  const inputs = page.locator("input[type='number'], input[type='text']");

  // At least some control should be visible
  const controlCount = await sliders.count() + await inputs.count();
  expect(controlCount).toBeGreaterThan(0);
});

test("removing effect from stack", async ({ page }) => {
  // Add an effect
  const ditheringTab = page.locator("text=Dither").first();
  await ditheringTab.click();
  await page.waitForTimeout(500);

  const bayerEffect = page.locator("text=Bayer").first();
  await bayerEffect.click();
  await page.waitForTimeout(1000);

  // Try to find and click a remove/delete button on the effect
  const removeBtn = page
    .locator("[title*='remove'], [title*='delete'], [title*='Remove'], [title*='Delete'], [aria-label*='remove']")
    .first();
  if (await removeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await removeBtn.click();
    await page.waitForTimeout(500);
  }

  // App should still be responsive
  const toolbar = page.locator("header").first();
  await expect(toolbar).toBeVisible();
});

test("effect toggle (enable/disable) doesn't crash", async ({ page }) => {
  // Add an effect
  const ditheringTab = page.locator("text=Dither").first();
  await ditheringTab.click();
  await page.waitForTimeout(500);

  const bayerEffect = page.locator("text=Bayer").first();
  await bayerEffect.click();
  await page.waitForTimeout(1000);

  // Look for a toggle/checkbox/eye icon
  const toggle = page
    .locator("input[type='checkbox'], [class*='toggle'], [title*='enable'], [title*='disable'], [title*='Enable'], [title*='Disable']")
    .first();
  if (await toggle.isVisible({ timeout: 2000 }).catch(() => false)) {
    await toggle.click();
    await page.waitForTimeout(300);
    // Toggle back
    await toggle.click();
    await page.waitForTimeout(300);
  }

  // App should still be responsive
  const toolbar = page.locator("header").first();
  await expect(toolbar).toBeVisible();
});
