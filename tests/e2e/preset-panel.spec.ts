import { expect, test } from "@playwright/test";
import { tauriMockScript } from "./mocks/tauri-mock";
import { openApp, openPresetPanel } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(tauriMockScript);
  await openApp(page);
});

// Presets is not in the default layout -- openPresetPanel (helpers.ts) adds
// it from the panel rail and asserts the name field rendered, so every test
// below operates on the real panel instead of hedging on <header>.

test("preset panel renders its save, import and export controls", async ({ page }) => {
  const panel = await openPresetPanel(page);

  await expect(panel.getByPlaceholder("Preset name...")).toBeVisible();
  await expect(panel.getByTitle("Save preset")).toBeVisible();
  await expect(panel.getByTitle("Export all presets")).toBeVisible();
  await expect(panel.getByTitle("Import presets")).toBeVisible();
});

test("preset save adds a loadable list entry", async ({ page }) => {
  const panel = await openPresetPanel(page);

  await panel.getByLabel("Preset name").fill("e2e-smoke");
  await panel.getByTitle("Save preset").click();

  // The saved preset must appear in the list -- the assertion the old test
  // could not make, having hedged on whether the button existed at all.
  await expect(panel.locator("[title='e2e-smoke']")).toBeVisible();
});

test("preset load applies the saved stack without crashing", async ({ page }) => {
  const panel = await openPresetPanel(page);

  await panel.getByLabel("Preset name").fill("e2e-smoke");
  await panel.getByTitle("Save preset").click();
  await expect(panel.locator("[title='e2e-smoke']")).toBeVisible();

  await panel.getByTitle("Load preset").first().click();

  // Loading must leave the panel usable, not torn down.
  await expect(panel.getByLabel("Preset name")).toBeVisible();
});
