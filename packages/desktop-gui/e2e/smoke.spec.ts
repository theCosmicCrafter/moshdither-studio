import { test, expect, _electron } from "@playwright/test";
import path from "node:path";

/**
 * E2E Smoke Test for MoshDither Studio
 *
 * Verifies the Electron app launches and the main window renders.
 *
 * Run with:
 *   npx playwright test e2e/smoke.spec.ts
 */

test.describe("MoshDither Studio Smoke Tests", () => {
  test("app launches and main window is visible", async () => {
    const electronApp = await _electron.launch({
      args: [path.join(__dirname, "..")],
    });

    const window = await electronApp.firstWindow();
    expect(window).toBeTruthy();

    // Wait for the app to render
    await expect(window.locator("body")).toBeVisible();

    // Verify some key UI elements exist
    await expect(
      window
        .locator("text=WARNING")
        .or(window.locator("[data-testid='studio-layout']")),
    ).toBeVisible();

    // Screenshot for CI artifacts
    await window.screenshot({ path: "e2e/screenshots/smoke-launch.png" });

    await electronApp.close();
  });
});
