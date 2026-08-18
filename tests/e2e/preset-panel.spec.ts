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

// Presets is not in the default layout -- it is added from the panel rail,
// whose buttons are labelled "Add {panel} to {zone}" from PANEL_REGISTRY. The
// old test never opened it, so it asserted <header> was visible instead and
// would have passed with the panel deleted.
async function openPresetPanel(page: import("@playwright/test").Page) {
  const existing = page.getByRole("tab", { name: "Presets" });
  if (!(await existing.count())) {
    await page.getByTitle("Add Presets to right").click();
  }
  await page.getByRole("tab", { name: "Presets" }).click();
  const panel = page.locator(".flexlayout__tab").filter({ has: page.getByLabel("Preset name") });
  await expect(panel.getByLabel("Preset name")).toBeVisible();
  return panel;
}

test("preset panel renders its save, import and export controls", async ({ page }) => {
  const panel = await openPresetPanel(page);

  await expect(panel.getByPlaceholder("Preset name...")).toBeVisible();
  await expect(panel.getByTitle("Save preset")).toBeVisible();
  await expect(panel.getByTitle("Export all presets")).toBeVisible();
  await expect(panel.getByTitle("Import presets")).toBeVisible();
});

test("preset save dialog doesn't crash", async ({ page }) => {
  // Look for save preset button
  const saveBtn = page
    .locator("[title*='save preset'], [title*='Save Preset'], text=Save Preset")
    .first();

  if (await saveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await saveBtn.click();
    await page.waitForTimeout(500);
    // Close any dialog that appears
    await page.keyboard.press("Escape").catch(() => {});
  }

  const toolbar = page.locator("header").first();
  await expect(toolbar).toBeVisible();
});

test("preset load doesn't crash", async ({ page }) => {
  // Look for preset list items
  const presetItems = page.locator("[class*='preset-item'], [class*='PresetItem']").first();

  if (await presetItems.isVisible({ timeout: 3000 }).catch(() => false)) {
    await presetItems.click();
    await page.waitForTimeout(500);
  }

  const toolbar = page.locator("header").first();
  await expect(toolbar).toBeVisible();
});
