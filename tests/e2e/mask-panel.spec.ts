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
