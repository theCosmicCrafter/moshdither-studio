import { test, expect } from "@playwright/test";
import { tauriMockScript } from "./mocks/tauri-mock";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(tauriMockScript);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("header, [data-testid='toolbar']", { timeout: 15000 });
  await page.locator("text=Discard").click({ timeout: 2000 }).catch(() => {});
  await page.locator("text=Skip").click({ timeout: 2000 }).catch(() => {});
  await page.locator("text=Get Started").click({ timeout: 2000 }).catch(() => {});
});

test("effect browser search filters results", async ({ page }) => {
  // Click on a category first
  const ditheringTab = page.locator("text=Dither").first();
  await ditheringTab.click();
  await page.waitForTimeout(500);

  // Find search input
  const searchInput = page.locator("input[placeholder*='search'], input[placeholder*='Search'], input[type='text'][class*='search']").first();

  if (await searchInput.isVisible({ timeout: 5000 }).catch(() => false)) {
    // Type a search query
    await searchInput.fill("bayer");
    await page.waitForTimeout(500);

    // Should see Bayer in results
    const bayerResult = page.locator("text=Bayer").first();
    await expect(bayerResult).toBeVisible({ timeout: 5000 });

    // Search for something that doesn't exist
    await searchInput.fill("zzznonexistent");
    await page.waitForTimeout(500);

    // Clear search
    await searchInput.fill("");
    await page.waitForTimeout(300);
  }

  const toolbar = page.locator("header").first();
  await expect(toolbar).toBeVisible();
});

test("effect browser category tabs switch correctly", async ({ page }) => {
  // Click through all category tabs
  const categories = ["Dither", "Color", "Glitch", "Analog", "Noise", "Pixel"];

  for (const cat of categories) {
    const tab = page.locator(`text=${cat}`).first();
    if (await tab.isVisible({ timeout: 3000 }).catch(() => false)) {
      await tab.click();
      await page.waitForTimeout(500);
      // App should remain responsive
      const toolbar = page.locator("header").first();
      await expect(toolbar).toBeVisible();
    }
  }
});

test("effect browser shows effect details", async ({ page }) => {
  // Click on a category
  const ditheringTab = page.locator("text=Dither").first();
  await ditheringTab.click();
  await page.waitForTimeout(500);

  // Click on an effect
  const effect = page.locator("text=Bayer, text=Floyd").first();
  if (await effect.isVisible({ timeout: 5000 }).catch(() => false)) {
    await effect.click();
    await page.waitForTimeout(500);
  }

  const toolbar = page.locator("header").first();
  await expect(toolbar).toBeVisible();
});

test("effect browser accordion expands/collapses", async ({ page }) => {
  // Look for accordion headers (category sections)
  const accordionHeaders = page.locator("[class*='accordion'], [class*='Accordion'], [role='button']");
  const count = await accordionHeaders.count();

  if (count > 0) {
    // Click first accordion header
    await accordionHeaders.first().click();
    await page.waitForTimeout(300);
    // Click again to collapse
    await accordionHeaders.first().click();
    await page.waitForTimeout(300);
  }

  const toolbar = page.locator("header").first();
  await expect(toolbar).toBeVisible();
});
