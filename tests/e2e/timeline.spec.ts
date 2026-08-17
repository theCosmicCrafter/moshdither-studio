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

// The Timeline is docked into the layout's bottom tabset, which defaultLayout
// locks open (enableClose/enableDrag false), so its transport is present on
// load without any navigation.
const DURATION_INPUT = "input[type='number'][title='Clip length (seconds)']";

test("timeline panel renders its transport controls", async ({ page }) => {
  // Assert the timeline's own controls, not merely that the app survived —
  // this test previously located a timeline selector, discarded it, and
  // asserted the header was visible, so it passed with no Timeline at all.
  await expect(page.getByTitle("Set in point (I)")).toBeVisible();
  await expect(page.getByTitle("Set out point (O)")).toBeVisible();
  await expect(page.getByTitle("Previous frame")).toBeVisible();
  await expect(page.getByTitle("Next frame")).toBeVisible();
  await expect(page.getByTitle("Playback speed")).toBeVisible();
  await expect(page.locator(DURATION_INPUT)).toBeVisible();
});

// These three cover Timeline/index.tsx's `Math.max(0.1, val)` clamp. They used
// to wrap every assertion in `if (await input.isVisible())`, so a missing or
// renamed input turned each of them into a silent pass.
test("duration input accepts valid values", async ({ page }) => {
  const durationInput = page.locator(DURATION_INPUT);
  await expect(durationInput).toBeVisible();

  await durationInput.fill("5.5");
  await durationInput.blur();
  await expect(durationInput).toHaveValue("5.5");
});

test("duration input clamps negative values to the 0.1 floor", async ({ page }) => {
  const durationInput = page.locator(DURATION_INPUT);
  await expect(durationInput).toBeVisible();

  await durationInput.fill("-5");
  await durationInput.blur();
  expect(parseFloat(await durationInput.inputValue())).toBeGreaterThanOrEqual(0.1);
});

test("duration input clamps zero to the 0.1 floor", async ({ page }) => {
  const durationInput = page.locator(DURATION_INPUT);
  await expect(durationInput).toBeVisible();

  await durationInput.fill("0");
  await durationInput.blur();
  expect(parseFloat(await durationInput.inputValue())).toBeGreaterThanOrEqual(0.1);
});

test("play/pause button toggles between Play and Pause", async ({ page }) => {
  // Scope to the Timeline's own panel: the Audio Reactive panel has its own
  // Play/Pause pair and flexlayout keeps opened tabs mounted, so an unscoped
  // getByTitle("Play") is ambiguous. The old version dodged this by matching
  // [title*='play'] loosely and asserting only that the header survived.
  const timeline = page
    .locator(".flexlayout__tab")
    .filter({ has: page.locator(DURATION_INPUT) });
  const transport = timeline.getByTitle(/^(Play|Pause)$/);
  await expect(transport).toBeVisible();

  await expect(transport).toHaveAttribute("title", "Play");
  await transport.click();
  await expect(timeline.getByTitle(/^(Play|Pause)$/)).toHaveAttribute("title", "Pause");
  await timeline.getByTitle(/^(Play|Pause)$/).click();
  await expect(timeline.getByTitle(/^(Play|Pause)$/)).toHaveAttribute("title", "Play");
});

test("timeline scrubber doesn't crash with keyboard", async ({ page }) => {
  // Arrow keys should move timeline
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(200);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(200);

  const toolbar = page.locator("header").first();
  await expect(toolbar).toBeVisible();
});
