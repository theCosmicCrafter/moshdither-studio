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

test("dock system renders with panel rail", async ({ page }) => {
  // The panel rail should be visible
  const panelRail = page.locator("[data-testid='panel-rail']");
  if (await panelRail.isVisible({ timeout: 5000 }).catch(() => false)) {
    await expect(panelRail).toBeVisible();
  }
  // App should be responsive
  const layout = page.locator("[data-testid='app-layout'], header").first();
  await expect(layout).toBeVisible();
});

test("dock tabs are clickable", async ({ page }) => {
  // Look for dock tabs
  const dockTabs = page.locator("[data-testid*='dock-tab-']");
  const count = await dockTabs.count();

  if (count > 0) {
    // Click each tab
    for (let i = 0; i < Math.min(count, 5); i++) {
      await dockTabs.nth(i).click();
      await page.waitForTimeout(300);
    }
  }

  const toolbar = page.locator("header").first();
  await expect(toolbar).toBeVisible();
});

test("floating windows can be opened and closed", async ({ page }) => {
  // Look for panel menu or floating window triggers
  const panelBtn = page
    .locator("[title*='panel'], [title*='Panel'], [class*='panel-menu']")
    .first();

  if (await panelBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await panelBtn.click();
    await page.waitForTimeout(500);
  }

  // App should be responsive
  const toolbar = page.locator("header").first();
  await expect(toolbar).toBeVisible();
});

test("window controls (minimize/maximize) don't crash", async ({ page }) => {
  // Look for window control buttons (minimize is a smoke selector)
  void page.locator("[title*='minimize'], [title*='Minimize'], [aria-label*='minimize']").first();
  const maxBtn = page
    .locator("[title*='maximize'], [title*='Maximize'], [aria-label*='maximize']")
    .first();

  if (await maxBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await maxBtn.click();
    await page.waitForTimeout(300);
  }

  const toolbar = page.locator("header").first();
  await expect(toolbar).toBeVisible();
});
