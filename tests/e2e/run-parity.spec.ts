import { expect, test } from "@playwright/test";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

// @ts-expect-error - import.meta.dirname may not be defined in all TS configs
const currentDir = import.meta.dirname || __dirname;

test.describe("Render Parity Auditor", () => {
  test("WebGL and CPU renders should match", async ({ page }) => {
    test.setTimeout(30000);

    // 1. Navigate to the app
    await page.goto("/");

    // Ensure the viewport loaded
    await page.waitForSelector('[data-testid="preview-viewport"]', {
      state: "attached",
      timeout: 10000,
    });

    // Create output dir
    const outDir = path.join(currentDir, "output");
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const webglPath = path.join(outDir, "webgl.png");
    const cpuPath = path.join(outDir, "cpu.png");

    const canvas = page.locator("canvas").first();
    const cpuImg = page.locator('img[alt="Preview"]').first();

    // Comparing placeholder images would always "pass", so require real
    // render targets and let every failure fail the test.
    const haveRenders = (await canvas.isVisible()) && (await cpuImg.isVisible());
    test.skip(
      !haveRenders,
      "WebGL canvas and CPU preview are not both rendered in this environment"
    );

    await canvas.screenshot({ path: webglPath });
    await cpuImg.screenshot({ path: cpuPath });

    const pythonScript = path.resolve(currentDir, "../../tools/render_parity_auditor.py");
    const result = execSync(
      `python "${pythonScript}" --webgl "${webglPath}" --cpu "${cpuPath}" --threshold 2.0`,
      { encoding: "utf-8" }
    );
    expect(result).toContain("PASS");
  });
});
