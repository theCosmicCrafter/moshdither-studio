import { expect, test } from "@playwright/test";
import { tauriMockScript } from "./mocks/tauri-mock";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(tauriMockScript);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  // Wait for app shell to render
  await page.waitForSelector("header", { timeout: 15000 });
  // Dismiss any lingering modal overlays
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

test("app launches and renders toolbar", async ({ page }) => {
  // Toolbar should be visible
  await expect(page.locator("header, [data-testid='toolbar']")).toBeVisible({ timeout: 10000 });
});

test("app renders effect browser panel", async ({ page }) => {
  // Effect browser should be in the left panel
  const effectBrowser = page.locator("text=Effects").first();
  await expect(effectBrowser).toBeVisible({ timeout: 10000 });
});

test("app renders preview viewport", async ({ page }) => {
  // Preview area should exist
  const preview = page
    .locator("[data-testid='preview-viewport'], .preview-viewport, [class*='preview']")
    .first();
  await expect(preview).toBeVisible({ timeout: 10000 });
});

test("no console errors on launch", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  // Filter out expected Tauri-related errors (mock not fully wired)
  const unexpected = errors.filter(
    (e) =>
      !e.includes("__TAURI") &&
      !e.includes("tauri") &&
      !e.includes("invoke") &&
      !e.includes("drag-drop") &&
      !e.includes("currentWindow")
  );
  expect(unexpected).toHaveLength(0);
});
