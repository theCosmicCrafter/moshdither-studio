import { expect, test } from "@playwright/test";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { tauriMockWithMediaScript } from "./mocks/tauri-mock-with-media";

// @ts-expect-error - import.meta.dirname may not be defined in all TS configs
const currentDir = import.meta.dirname || __dirname;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(tauriMockWithMediaScript);
  // The shared mock's file dialog always resolves to a .mp4. This test needs
  // a still IMAGE specifically: for video, isPlaying/isVideo keeps the
  // render loop's `isPlaying` OR-condition satisfied regardless of the bug
  // under test, masking it entirely. Patching the dialog response after the
  // shared script has already run overrides just that one command.
  await page.addInitScript(() => {
    const original = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = (command, args) => {
      if (command === "plugin:dialog|open") {
        return Promise.resolve("C:/tmp/moshdither/test_image.png");
      }
      return original(command, args);
    };
  });
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

// Regression test for a bug introduced by an earlier performance fix: the
// WebGL live-preview render loop's re-render trigger (stackSignature) only
// tracked effect id/enabled, not params, so it looked like changing a static
// effect's parameters (the overwhelming majority of the effect library --
// dithering, color, pixel geometry) did nothing at all in LIVE PREVIEW mode.
// This asserts on the actual rendered canvas pixels via the same RMSD
// comparison run-parity.spec.ts already uses -- exact byte equality proved
// unreliable here (two screenshots of genuinely unchanged content are not
// byte-identical, confirmed empirically before writing this assertion), so
// a meaningful-difference threshold is the only real way to prove the fix.
test("changing a static effect's parameter updates the WebGL live preview canvas", async ({ page }) => {
  test.setTimeout(30000);

  // Load a still image through the File menu (see beforeEach for why this
  // must be an image, not the shared mock's default video).
  await page.locator("header button:has-text('File')").click();
  await page.locator("text=Open File").click();
  await expect(
    page.locator('[data-testid="preview-viewport"] span', { hasText: /test_image\.png/i }).first()
  ).toBeVisible({ timeout: 10000 });

  // The render loop must not be running for its own reasons, or it would mask
  // the bug under test: a parameter change has to be what redraws the canvas.
  //
  // isPlaying now defaults to FALSE, so the app already starts stopped and the
  // Timeline button reads "Play". It used to default to true, which is why this
  // step existed at all. Clicking whichever button is present keeps the test
  // honest either way rather than encoding today's default.
  const pause = page.getByTitle("Pause");
  if (await pause.count()) {
    await pause.click();
  }
  await expect(page.getByTitle("Play").first()).toBeVisible();

  // Add Bayer Dither -- a static effect (no animated shader), previewed via
  // an accurate WebGL shader (not routed to the CPU backend), exactly the
  // class of effect the regression silently broke live feedback for.
  await page.locator("text=Dither").first().click();
  const bayerEffect = page.locator("text=Bayer Dither").first();
  await expect(bayerEffect).toBeVisible({ timeout: 10000 });
  await bayerEffect.click();

  // Effects and Stack share a tabset (see defaultLayout.ts) -- adding an
  // effect from the browser doesn't switch tabs, so Stack's ParameterPanel
  // (where the Matrix Size control lives) isn't visible until selected.
  await page.getByRole("tab", { name: "Stack" }).click();

  const canvas = page.locator("canvas.preview-canvas").first();
  await expect(canvas).toBeVisible({ timeout: 10000 });
  // Let the initial render (triggered by adding the effect, a genuine
  // stackSignature change) settle before capturing the baseline.
  await page.waitForTimeout(500);

  const outDir = path.join(currentDir, "output");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const beforePath = path.join(outDir, "param-update-before.png");
  const afterPath = path.join(outDir, "param-update-after.png");

  await canvas.screenshot({ path: beforePath });

  // Change the Bayer matrix size -- a discrete, purely visual parameter with
  // no effect on id/enabled, so it only reaches the canvas if params-aware
  // re-rendering actually works.
  const matrixSizeSelect = page.getByRole("combobox", { name: "Matrix Size" });
  await expect(matrixSizeSelect).toBeVisible({ timeout: 10000 });
  await matrixSizeSelect.selectOption("16");
  await page.waitForTimeout(500);

  await canvas.screenshot({ path: afterPath });

  const pythonScript = path.resolve(currentDir, "../../tools/render_parity_auditor.py");
  // Threshold 2.0 is the same value run-parity.spec.ts already uses to mean
  // "these are the same image" -- reused here for the opposite assertion
  // (RMSD must exceed it, proving a real, non-noise pixel change).
  let result = "";
  let auditorExitCode = 0;
  try {
    result = execSync(`python "${pythonScript}" --webgl "${beforePath}" --cpu "${afterPath}" --threshold 2.0`, {
      encoding: "utf-8",
    });
  } catch (e) {
    // The auditor exits 1 (throwing here) precisely when RMSD > threshold,
    // i.e. the images are meaningfully different -- the outcome this test
    // wants. Its stdout/stderr still contains the printed RMSD for logging.
    auditorExitCode = 1;
    result = (e.stdout || "") + (e.stderr || "");
  }
  console.log(result);

  expect(auditorExitCode, "expected a meaningful (non-noise) pixel difference after the parameter change").toBe(1);
  expect(result).toContain("FAIL");
});
