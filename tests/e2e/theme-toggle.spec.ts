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

test("theme toggle button exists in toolbar", async ({ page }) => {
  // Find the theme toggle by its title attribute
  const themeBtn = page.locator('[title*="theme"], [title*="Theme"]').first();
  await expect(themeBtn).toBeVisible({ timeout: 10000 });
});

test("clicking theme toggle switches data-theme attribute", async ({ page }) => {
  const html = page.locator("html");

  // Default should be dark
  await expect(html).toHaveAttribute("data-theme", "dark", { timeout: 5000 });

  // Find and click the theme toggle
  const themeBtn = page.locator('[title*="Switch to light theme"]').first();
  await themeBtn.click();

  // Should now be light
  await expect(html).toHaveAttribute("data-theme", "light", { timeout: 5000 });

  // Click again to go back to dark
  const themeBtn2 = page.locator('[title*="Switch to dark theme"]').first();
  await themeBtn2.click();
  await expect(html).toHaveAttribute("data-theme", "dark", { timeout: 5000 });
});

test("T keyboard shortcut toggles theme", async ({ page }) => {
  const html = page.locator("html");

  // Default should be dark
  await expect(html).toHaveAttribute("data-theme", "dark", { timeout: 5000 });

  // Press T to toggle
  await page.keyboard.press("t");

  // Should now be light
  await expect(html).toHaveAttribute("data-theme", "light", { timeout: 5000 });

  // Press T again to go back
  await page.keyboard.press("t");
  await expect(html).toHaveAttribute("data-theme", "dark", { timeout: 5000 });
});
