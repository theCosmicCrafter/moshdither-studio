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

const GATE = "Load media to use SAM3 segmentation.";

/** Drive the real open flow. The mock returns a path from plugin:dialog|open
 *  only when a test sets __MOSH_E2E_MEDIA_PATH__, so every other spec keeps its
 *  no-media start state (export's "Load media before exporting" depends on it). */
async function loadMedia(page: import("@playwright/test").Page) {
  await page.getByText("click to browse").click();
  await expect(page.getByText(GATE)).toHaveCount(0);
}

test("mask panel requires media and says so", async ({ page }) => {
  await page.getByRole("tab", { name: "Mask" }).click();
  await expect(page.getByText(GATE)).toBeVisible();
});

test("mask panel replaces its prerequisite notice once media loads", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__MOSH_E2E_MEDIA_PATH__ = "C:/fake/clip.png";
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("header", { timeout: 15000 });
  await page
    .locator("text=Discard")
    .click({ timeout: 2000 })
    .catch(() => {});

  await page.getByRole("tab", { name: "Mask" }).click();
  await expect(page.getByText(GATE)).toBeVisible();

  await loadMedia(page);
});

/** Load media and return the Mask panel, which only renders its controls once
 *  media exists. */
async function openMaskPanelWithMedia(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__MOSH_E2E_MEDIA_PATH__ = "C:/fake/clip.png";
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("header", { timeout: 15000 });
  await page
    .locator("text=Discard")
    .click({ timeout: 2000 })
    .catch(() => {});
  await page.getByRole("tab", { name: "Mask" }).click();
  await loadMedia(page);
  const panel = page.locator(".flexlayout__tab").filter({ hasText: "SAM3" }).last();
  await expect(panel).toBeVisible();
  return panel;
}

test("mask panel offers SAM3 and Manual modes once media is loaded", async ({ page }) => {
  const panel = await openMaskPanelWithMedia(page);

  await expect(panel.getByRole("button", { name: "SAM3", exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Manual", exact: true })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Go", exact: true })).toBeVisible();
});

test("mask prompt-mode selector switches between Text, Point, Box and Auto", async ({ page }) => {
  // This is the control the old "mask mode selector works" test named but never
  // reached -- it lives behind the media gate, so that test only ever asserted
  // the header was visible.
  const panel = await openMaskPanelWithMedia(page);
  const selector = panel.locator("select").first();
  await expect(selector).toBeVisible();

  for (const mode of ["point", "box", "auto", "text"]) {
    await selector.selectOption(mode);
    await expect(selector).toHaveValue(mode);
  }
});

test("switching to Manual mode changes the panel's controls", async ({ page }) => {
  const panel = await openMaskPanelWithMedia(page);
  await expect(panel.locator("select")).toHaveCount(1);

  await panel.getByRole("button", { name: "Manual", exact: true }).click();
  // Manual painting has no prompt selector; asserting its disappearance proves
  // the toggle actually swapped the UI rather than just restyling a button.
  await expect(panel.locator("select")).toHaveCount(0);

  await panel.getByRole("button", { name: "SAM3", exact: true }).click();
  await expect(panel.locator("select")).toHaveCount(1);
});

// The remaining mask controls -- mode selector, invert, clear, brush size --
// only render once a SAM3 mask exists, which requires the Python sidecar. This
// harness cannot produce one, so those controls are unreachable here and the
// tests below are honest smoke checks rather than assertions about behaviour
// they cannot observe. They were previously named "mask mode selector works"
// and "brush size slider responds to input", which claimed otherwise.
test("mask keyboard shortcuts don't crash without a mask", async ({ page }) => {
  await page.getByRole("tab", { name: "Mask" }).click();
  await page.keyboard.press("KeyI");
  await page.keyboard.press("KeyC");
  await expect(page.getByText(GATE)).toBeVisible();
});
