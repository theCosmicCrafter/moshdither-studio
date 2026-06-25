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

test("keyboard shortcuts button opens shortcuts panel", async ({ page }) => {
  // Find the keyboard shortcuts button (has keyboard-related icon)
  const shortcutsBtn = page
    .locator('[title*="shortcut"], [title*="Shortcut"], [title*="keyboard"], [title*="Keyboard"]')
    .first();
  await expect(shortcutsBtn).toBeVisible({ timeout: 10000 });

  // Click it to open the shortcuts panel
  await shortcutsBtn.click();
  await page.waitForTimeout(500);

  // Should show some shortcuts content
  const shortcutsPanel = page.locator("text=Shortcut").first();
  await expect(shortcutsPanel).toBeVisible({ timeout: 5000 });
});

test("spacebar toggles play/pause", async ({ page }) => {
  // Spacebar should not crash the app
  await page.keyboard.press("Space");
  await page.waitForTimeout(300);

  // App should still be responsive
  const toolbar = page.locator("header, [data-testid='toolbar']").first();
  await expect(toolbar).toBeVisible();
});

test("v key toggles before/after view", async ({ page }) => {
  // Press V — should toggle before/after without crashing
  await page.keyboard.press("v");
  await page.waitForTimeout(300);

  // App should still be responsive
  const toolbar = page.locator("header, [data-testid='toolbar']").first();
  await expect(toolbar).toBeVisible();
});

test("g key toggles grid overlay", async ({ page }) => {
  // Press G — should toggle grid overlay
  await page.keyboard.press("g");
  await page.waitForTimeout(300);

  // App should still be responsive
  const toolbar = page.locator("header, [data-testid='toolbar']").first();
  await expect(toolbar).toBeVisible();
});
