import { expect, test } from "@playwright/test";
import { tauriMockScript } from "./mocks/tauri-mock";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(tauriMockScript);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-testid='app-layout'], .app-layout", { timeout: 15000 });
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

test("proxy media panel is visible", async ({ page }) => {
  const proxyPanel = page.locator("text=Proxy Media").first();
  await expect(proxyPanel).toBeVisible({ timeout: 10000 });
});

// flexlayout gives every docked tab a real role="tab" + accessible name
// matching its label -- more robust than a custom testid, since flexlayout
// also renders an aria-hidden "stamp" copy of each tab (for its drag-preview
// system) that a testid selector would ambiguously match too.
async function openPanelTab(page: import("@playwright/test").Page, tabLabel: string) {
  const tab = page.getByRole("tab", { name: tabLabel }).first();
  // Not every panel is part of the default dock layout (e.g. Proxy Media) --
  // those need adding via the panel rail before their tab exists.
  if (!(await tab.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: new RegExp(`^Add ${tabLabel} panel`) }).click();
  }
  await tab.click();
  await page.waitForTimeout(300);
}

test("proxy panel has generate button", async ({ page }) => {
  await openPanelTab(page, "Proxy Media");
  const generateBtn = page.locator("text=Generate Proxy").first();
  await expect(generateBtn).toBeVisible({ timeout: 10000 });
});

test("proxy panel has quality slider", async ({ page }) => {
  await openPanelTab(page, "Proxy Media");
  // Matched without a trailing colon: this slider was migrated to
  // LabeledSlider, which renders the bare label, so the old
  // /Quality \(CRF\):/ pattern no longer matched anything. Assert on the
  // control rather than only its text, so a label that renders while its
  // slider is missing cannot pass.
  await expect(page.getByText(/Quality \(CRF\)/).first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole("slider", { name: /Quality \(CRF\)/ }).first()).toBeVisible({
    timeout: 10000,
  });
});
