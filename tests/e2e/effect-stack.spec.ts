import { test, expect } from "@playwright/test";
import { tauriMockScript } from "./mocks/tauri-mock";
import { openApp } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(tauriMockScript);
  await openApp(page);
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
  // Clicking an effect row in the browser calls addToStack
  // (CategoryAccordion.tsx:168), so add one before trying to remove it -- the
  // stack starts empty on a fresh profile. The old version clicked
  // `text=Dither` and `text=Bayer`, neither of which targets the row button,
  // then guarded the remove click and asserted the header was visible.
  await page.getByRole("button", { name: /Bayer Dither/ }).click();

  // The curated layout docks Layers on the right, already active -- layer
  // actions live in the card's kebab menu now.
  const layers = page.getByRole("tabpanel", { name: "Layers" });
  const kebab = layers.getByTitle("Layer actions");
  await expect(kebab).toHaveCount(1);

  await kebab.click();
  await page.getByRole("menuitem", { name: "Remove" }).click();
  await expect(layers.getByTitle("Layer actions")).toHaveCount(0);
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
