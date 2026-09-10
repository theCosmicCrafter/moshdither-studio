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

test("audio panel renders its engine controls", async ({ page }) => {
  // Audio Reactive shares the right tabset with Mask (active on load), so the
  // panel is not mounted until its tab is clicked. The old version located an
  // audio selector, discarded it, and asserted <header> was visible.
  await page.getByRole("tab", { name: "Audio Reactive" }).click();

  const audio = page.locator(".flexlayout__tab").filter({ hasText: "Audio Engine" });
  // The file input is display:none and driven by a styled label, so it can
  // only be asserted as attached, not visible.
  await expect(audio.getByLabel("Select audio file")).toBeAttached();
  await expect(audio.getByRole("button", { name: "Use Microphone" })).toBeVisible();
  await expect(audio.getByRole("button", { name: "Analyze Beats" })).toBeVisible();
  await expect(audio.getByLabel("Volume")).toBeVisible();
});

test("audio enable toggle doesn't crash", async ({ page }) => {
  // Look for audio enable toggle
  const audioToggle = page.locator("[title*='audio'], [title*='Audio'], text=Audio").first();

  if (await audioToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
    await audioToggle.click();
    await page.waitForTimeout(300);
  }

  const toolbar = page.locator("header").first();
  await expect(toolbar).toBeVisible();
});

test("audio panel exposes its enable toggle and transport", async ({ page }) => {
  // Renamed from "audio frequency bands display when enabled": the bands only
  // render once a real audio source is analysed, which the Tauri mock cannot
  // provide, so the old name promised coverage that was never possible here.
  // What is assertable without audio is the panel's own controls.
  await page.getByRole("tab", { name: "Audio Reactive" }).click();

  const audio = page.locator(".flexlayout__tab").filter({ hasText: "Audio Engine" });
  await expect(audio.locator("input[type='checkbox']").first()).toBeVisible();
  for (const control of ["Play", "Pause", "Stop"]) {
    await expect(audio.getByRole("button", { name: control, exact: true })).toBeVisible();
  }
  const toolbar = page.locator("header").first();
  await expect(toolbar).toBeVisible();
});
