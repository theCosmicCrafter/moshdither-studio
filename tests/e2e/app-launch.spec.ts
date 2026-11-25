import { expect, test } from "@playwright/test";
import { tauriMockScript } from "./mocks/tauri-mock";
import { openApp } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(tauriMockScript);
  await openApp(page, "header");
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
