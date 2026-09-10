/**
 * Real-backend E2E tests for preset and LUT rendering via the `mosh-verify` CLI.
 *
 * These tests shell out to the built `mosh-verify` binary, which exercises the
 * real Rust backend (EffectRegistry, image I/O, LUT loading, path guard) without
 * requiring a WebView or WebDriver. This matches the strategy used in
 * `real-backend.spec.ts`.
 *
 * What it covers:
 *   - `render-presets` — renders each preset stack from scripts/presets.json
 *     through the real effect pipeline (10 presets).
 *   - `render-luts` — renders every LUT in public/lut/ via color.lut_grading
 *     (35 LUTs).
 *
 * Outputs are written to D:\outputs\presets\ and D:\outputs\luts\ (or a temp
 * dir if those aren't writable).
 *
 * Prerequisites:
 *   - cargo build --release --bin mosh-verify
 *   - MOSHDITHER_TEST_IMAGE env var pointing to a real test image
 */

import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BIN =
  process.env.MOSHDITHER_VERIFY_BIN ??
  join(process.cwd(), "src-tauri", "target", "release", "mosh-verify") +
    (process.platform === "win32" ? ".exe" : "");

// Committed fixture so this suite runs by default rather than skipping
// silently. See tests/e2e/real-backend.spec.ts for the same reasoning.
const TEST_IMAGE =
  process.env.MOSHDITHER_TEST_IMAGE ?? join(process.cwd(), "tests", "fixtures", "test-image.png");

const PRESETS_JSON = join(process.cwd(), "scripts", "presets.json");
const LUT_DIR = join(process.cwd(), "public", "lut");

const canRun = BIN.length > 0 && existsSync(BIN) && TEST_IMAGE.length > 0 && existsSync(TEST_IMAGE);

test.skip(
  !canRun,
  `prereqs missing — BIN=${BIN} exists=${existsSync(BIN)}, IMAGE exists=${existsSync(TEST_IMAGE)}`
);

test.setTimeout(300_000); // 5 min — LUT rendering is fast but presets can be heavy

function runVerify(
  args: string[],
  timeoutMs = 280_000
): { stdout: string; stderr: string; status: number | null } {
  const res = spawnSync(BIN, args, {
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 50 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
    status: res.status,
  };
}

test("real backend: render-presets produces a PNG for every preset", () => {
  const outDir = mkdtempSync(join(tmpdir(), "mosh-presets-"));
  try {
    const res = runVerify([
      "render-presets",
      "--image",
      TEST_IMAGE,
      "--presets",
      PRESETS_JSON,
      "--output",
      outDir,
    ]);
    expect(res.status, `render-presets exit code: ${res.stderr}`).toBe(0);

    // The presets JSON has 10 presets. Each should produce a PNG.
    const pngs = readdirSync(outDir).filter((f) => f.endsWith(".png"));
    expect(pngs.length, `expected 10 preset PNGs, got ${pngs.length}: ${pngs.join(", ")}`).toBe(10);

    // Spot-check a few expected names.
    expect(pngs).toContain("vhs-analog.png");
    expect(pngs).toContain("cyberpunk-dither.png");
    // The preset is named `b&w-halftone`; `&` is one of the characters
    // sanitize_filename maps to `_`, so the file lands as `b_w-halftone.png`.
    expect(pngs).toContain("b_w-halftone.png");
    expect(pngs).toContain("kaleidoscope.png");

    // The summary line should report 10 ok, 0 errors.
    expect(res.stderr).toMatch(/Done: 10 ok, 0 errors/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("real backend: render-luts produces a PNG for every LUT in public/lut", () => {
  const outDir = mkdtempSync(join(tmpdir(), "mosh-luts-"));
  try {
    const res = runVerify([
      "render-luts",
      "--image",
      TEST_IMAGE,
      "--lut-dir",
      LUT_DIR,
      "--output",
      outDir,
    ]);
    expect(res.status, `render-luts exit code: ${res.stderr}`).toBe(0);

    const pngs = readdirSync(outDir).filter((f) => f.endsWith(".png"));
    // The public/lut directory has 35 LUT PNGs.
    expect(pngs.length, `expected 35 LUT PNGs, got ${pngs.length}`).toBe(35);

    // Spot-check a few expected names.
    expect(pngs).toContain("amatorka.png");
    expect(pngs).toContain("midnight.png");
    expect(pngs).toContain("movie_300.png");

    expect(res.stderr).toMatch(/Done: 35 ok, 0 errors/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});
