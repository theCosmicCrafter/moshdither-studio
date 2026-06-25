import { expect, test } from "@playwright/test";

test.describe("UI Stress Testing", () => {
  test("blast UI with state changes to test robustness", async ({ page }) => {
    test.setTimeout(60000);

    await page.goto("/");

    await page
      .waitForSelector(".app-container", { state: "attached", timeout: 10000 })
      .catch(() => {});

    const iterations = 50;

    for (let i = 0; i < iterations; i++) {
      const buttons = await page.$$("button");
      if (buttons.length > 0) {
        const randomBtn = buttons[Math.floor(Math.random() * buttons.length)];
        try {
          await randomBtn.click({ timeout: 100 });
        } catch {
          /* ignore click failures */
        }
      }

      await page.keyboard.press("Control+K");
      await page.keyboard.press("Escape");

      const inputs = await page.$$('input[type="range"]');
      if (inputs.length > 0) {
        const randomInput = inputs[Math.floor(Math.random() * inputs.length)];
        try {
          await randomInput.fill((Math.random() * 100).toString(), { timeout: 100 });
        } catch {
          /* ignore fill failures */
        }
      }

      await page.waitForTimeout(50);
    }

    const bodyText = await page.locator("body").innerText();
    expect(bodyText.length).toBeGreaterThan(0);

    const errorOverlays = await page.locator("text=/unexpected error|app crashed/i").count();
    expect(errorOverlays).toBe(0);
  });

  test("rapid preset loading does not flash original image", async ({ page }) => {
    test.setTimeout(30000);

    await page.goto("/");
    await page
      .waitForSelector(".app-container", { state: "attached", timeout: 10000 })
      .catch(() => {});

    // Find preset buttons/cards in the preset panel
    const presetButtons = await page.$$(
      '[data-testid="preset-card"], .preset-card, button:has-text("Preset")'
    );

    if (presetButtons.length < 2) {
      // If no presets visible, try opening the preset panel
      const presetTab = page
        .locator('button:has-text("Preset"), [data-panel-id="presets"]')
        .first();
      if (await presetTab.isVisible().catch(() => false)) {
        await presetTab.click();
        await page.waitForTimeout(500);
      }
    }

    const presets = await page.$$(
      '[data-testid="preset-card"], .preset-card, button:has-text("Preset")'
    );
    const presetCount = Math.min(presets.length, 10);

    if (presetCount < 2) {
      console.log("Not enough presets found for stress test — skipping");
      return;
    }

    // Rapidly load different presets
    for (let i = 0; i < 20; i++) {
      const idx = i % presetCount;
      try {
        await presets[idx].click({ timeout: 500 });
      } catch {
        /* ignore preset click failures */
      }
      // Very short delay to simulate rapid clicking
      await page.waitForTimeout(100);
    }

    // After rapid loading, verify the app is still responsive
    const bodyText = await page.locator("body").innerText();
    expect(bodyText.length).toBeGreaterThan(0);

    // Verify no crash screen
    const errorOverlays = await page.locator("text=/unexpected error|app crashed/i").count();
    expect(errorOverlays).toBe(0);

    // Verify the preview image is still showing (not blank/original flash)
    const previewImg = page.locator('img[alt="Preview"]').first();
    const previewCanvas = page.locator("canvas").first();
    const hasPreview =
      (await previewImg.isVisible().catch(() => false)) ||
      (await previewCanvas.isVisible().catch(() => false));
    expect(hasPreview).toBe(true);
  });

  test("rapid slider scrubbing does not freeze UI", async ({ page }) => {
    test.setTimeout(30000);

    await page.goto("/");
    await page
      .waitForSelector(".app-container", { state: "attached", timeout: 10000 })
      .catch(() => {});

    // Find all range sliders
    const sliders = await page.$$('input[type="range"]');

    if (sliders.length === 0) {
      console.log("No sliders found — skipping slider scrubbing test");
      return;
    }

    // Rapidly scrub each slider
    for (let s = 0; s < Math.min(sliders.length, 5); s++) {
      const slider = sliders[s];
      for (let i = 0; i < 30; i++) {
        try {
          await slider.fill(String(Math.random() * 100), { timeout: 50 });
        } catch {
          /* ignore slider fill failures */
        }
      }
      // Small pause between sliders
      await page.waitForTimeout(100);
    }

    // After scrubbing, wait for debounce to settle
    await page.waitForTimeout(500);

    // Verify app is still responsive
    const bodyText = await page.locator("body").innerText();
    expect(bodyText.length).toBeGreaterThan(0);

    const errorOverlays = await page.locator("text=/unexpected error|app crashed/i").count();
    expect(errorOverlays).toBe(0);
  });

  test("mask toggling and effect stack operations are stable", async ({ page }) => {
    test.setTimeout(30000);

    await page.goto("/");
    await page
      .waitForSelector(".app-container", { state: "attached", timeout: 10000 })
      .catch(() => {});

    // Find mask-related controls
    const maskSelects = await page.$$("select");
    const maskButtons = await page.$$(
      '[data-testid="mask-toggle"], button:has-text("mask"), button:has-text("Mask")'
    );

    // Rapidly toggle mask selectors
    for (let i = 0; i < 20; i++) {
      if (maskSelects.length > 0) {
        const select = maskSelects[i % maskSelects.length];
        try {
          // Toggle between "no mask" and "active mask" options
          await select.selectOption({ index: i % 2 === 0 ? 0 : 1 }).catch(() => {
            /* ignore */
          });
        } catch {
          /* ignore select errors */
        }
      }

      if (maskButtons.length > 0) {
        const btn = maskButtons[i % maskButtons.length];
        try {
          await btn.click({ timeout: 100 });
        } catch {
          /* ignore mask toggle failures */
        }
      }

      await page.waitForTimeout(50);
    }

    // Verify stability
    const bodyText = await page.locator("body").innerText();
    expect(bodyText.length).toBeGreaterThan(0);

    const errorOverlays = await page.locator("text=/unexpected error|app crashed/i").count();
    expect(errorOverlays).toBe(0);
  });

  test("combined rapid preset + slider + mask stress", async ({ page }) => {
    test.setTimeout(60000);

    await page.goto("/");
    await page
      .waitForSelector(".app-container", { state: "attached", timeout: 10000 })
      .catch(() => {});

    // Combined stress: alternate between preset loads, slider scrubbing, and mask toggling
    for (let i = 0; i < 30; i++) {
      // Every 3rd iteration: try loading a preset
      if (i % 3 === 0) {
        const presets = await page.$$(
          '[data-testid="preset-card"], .preset-card, button:has-text("Preset")'
        );
        if (presets.length > 0) {
          await presets[i % presets.length].click({ timeout: 200 }).catch(() => {
            /* ignore */
          });
        }
      }

      // Every 3rd + 1: scrub a slider
      if (i % 3 === 1) {
        const sliders = await page.$$('input[type="range"]');
        if (sliders.length > 0) {
          await sliders[0].fill(String(Math.random() * 100), { timeout: 100 }).catch(() => {});
        }
      }

      // Every 3rd + 2: toggle a mask select
      if (i % 3 === 2) {
        const selects = await page.$$("select");
        if (selects.length > 0) {
          await selects[0].selectOption({ index: 0 }).catch(() => {});
        }
      }

      await page.waitForTimeout(50);
    }

    // Let debounce settle
    await page.waitForTimeout(600);

    // Final stability check
    const bodyText = await page.locator("body").innerText();
    expect(bodyText.length).toBeGreaterThan(0);

    const errorOverlays = await page.locator("text=/unexpected error|app crashed/i").count();
    expect(errorOverlays).toBe(0);
  });
});
