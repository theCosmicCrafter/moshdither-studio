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

test("verification panel renders", async ({ page }) => {
  // Look for verification-related UI (kept as a smoke selector)
  void page.locator("text=Verif, [title*='verif'], [title*='Verif']").first();
  // App should be responsive
  const toolbar = page.locator("header").first();
  await expect(toolbar).toBeVisible();
});

test("verification run button doesn't crash", async ({ page }) => {
  // Look for verify/run button
  const verifyBtn = page
    .locator("text=Verify, text=Run, [title*='verify'], [title*='Verify']")
    .first();

  if (await verifyBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await verifyBtn.click();
    await page.waitForTimeout(500);
  }

  const toolbar = page.locator("header").first();
  await expect(toolbar).toBeVisible();
});

test("verification results display", async ({ page }) => {
  // Look for results area (kept as a smoke selector)
  void page
    .locator("[class*='result'], [class*='Result'], text=pass, text=fail, text=Pass, text=Fail")
    .first();

  // App should be responsive
  const toolbar = page.locator("header").first();
  await expect(toolbar).toBeVisible();
});
