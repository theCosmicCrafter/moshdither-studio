/**
 * Real-backend E2E tests against the built Rust binary.
 *
 * Unlike the mocked Playwright suite (which injects a Tauri stub into the
 * browser), these tests exercise the actual Rust backend by invoking the
 * `mosh-verify` CLI — a standalone binary built from the same crate as the
 * Tauri app that exposes the real effect registry, FFmpeg pipeline, and
 * image/video I/O without requiring a WebView or WebDriver.
 *
 * Why mosh-verify instead of tauri-driver?
 *   - tauri-driver on Windows requires WebView2 + msedgedriver wiring that is
 *     flaky in CI and headless contexts.
 *   - The Tauri `#[tauri::command]` functions all delegate to the same
 *     `EffectRegistry`, `ffmpeg`, and `image_io` modules that `mosh-verify`
 *     calls directly. If `mosh-verify render-all` succeeds, the IPC commands
 *     `load_media`, `apply_effect_stack`, `export_video`, etc. will also
 *     succeed against the same code paths.
 *   - This gives us a deterministic, fast, real-backend smoke test that CI
 *     can run on every platform without a display server.
 *
 * Prerequisites:
 *   - Build the binary:  `cargo build --release --bin mosh-verify`
 *     (or `npm run tauri build`, which builds all binaries)
 *   - Set env vars (all optional — sensible defaults are used):
 *     - MOSHDITHER_VERIFY_BIN=<path to mosh-verify>
 *       (default: src-tauri/target/release/mosh-verify[.exe])
 *     - MOSHDITHER_TEST_IMAGE=<path to a real test image>
 *     - MOSHDITHER_TEST_VIDEO=<path to a real test video>
 *
 * If the binary is not found, the suite is skipped so CI does not fail on
 * platforms that haven't built it yet.
 */

import { expect, test } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";

const BIN =
  process.env.MOSHDITHER_VERIFY_BIN ??
  join(process.cwd(), "src-tauri", "target", "release", "mosh-verify") +
    (process.platform === "win32" ? ".exe" : "");

// Small committed fixtures (139 KB total) so these tests actually run. They
// previously defaulted to "", which made every media-dependent case skip
// silently -- indistinguishable from passing. Override to point at heavier
// media when exercising the pipeline at real resolutions.
const TEST_IMAGE =
  process.env.MOSHDITHER_TEST_IMAGE ?? join(process.cwd(), "tests", "fixtures", "test-image.png");
const TEST_VIDEO =
  process.env.MOSHDITHER_TEST_VIDEO ?? join(process.cwd(), "tests", "fixtures", "test-video.mp4");

const canRun = BIN.length > 0 && existsSync(BIN);

test.skip(!canRun, "mosh-verify binary not found — run `cargo build --release --bin mosh-verify`");

/**
 * Newest mtime across the Rust sources the binary is built from.
 *
 * A running mosh-verify holds a lock on its own exe, so `cargo build` fails
 * with "Access is denied (os error 5)". If that failure is piped or ignored,
 * the suite happily runs the previous binary and reports green for code that
 * was never compiled — which happened during this suite's own development and
 * produced a completely false pass. A present-but-stale binary must be an
 * error, not a silent substitution.
 */
function newestRustSourceMtime(dir: string): number {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      newest = Math.max(newest, newestRustSourceMtime(full));
    } else if (entry.name.endsWith(".rs")) {
      newest = Math.max(newest, statSync(full).mtimeMs);
    }
  }
  return newest;
}

if (canRun && !process.env.MOSHDITHER_VERIFY_BIN) {
  const srcDir = join(process.cwd(), "src-tauri", "src");
  const binAge = statSync(BIN).mtimeMs;
  const srcAge = existsSync(srcDir) ? newestRustSourceMtime(srcDir) : 0;
  if (srcAge > binAge) {
    const behind = Math.round((srcAge - binAge) / 1000);
    throw new Error(
      `mosh-verify is ${behind}s older than the newest Rust source — these tests ` +
        `would validate stale code. Rebuild with ` +
        `\`cargo build --release --bin mosh-verify --manifest-path src-tauri/Cargo.toml\`. ` +
        `If the build reports "Access is denied (os error 5)", a mosh-verify ` +
        `process is still running and holding the exe.`
    );
  }
}

test.use({
  timeout: 600_000, // 10 min — render-all on 4K video across 98 effects is slow
});

/**
 * Run mosh-verify with the given args and return { stdout, stderr, status }.
 * mosh-verify writes progress and summaries to stderr, and JSON payloads to
 * stdout — so tests need both streams. Does not throw on non-zero exit; the
 * caller asserts on status.
 */
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

test("real backend: binary boots and reports effect registry", () => {
  // Smoke test: `status` command runs the real EffectRegistry::new() and
  // prints a summary. If this fails, the binary itself is broken.
  const res = runVerify(["status"]);
  expect(res.status, `status exit code: ${res.stderr}`).toBe(0);
  const out = res.stdout;
  expect(out, "status output should mention effects").toContain("Effects registered");
  // The registry has 98 effects as of writing; we just assert > 50 so the
  // test doesn't break every time someone adds an effect.
  const m = out.match(/Effects registered:\s+(\d+)/);
  expect(m, `could not parse effect count from: ${out}`).not.toBeNull();
  const count = parseInt(m![1], 10);
  expect(count, "should have a healthy effect registry").toBeGreaterThan(50);
});

test("real backend: verify-all passes for every effect", () => {
  // Runs the full verification suite (no_crash, non_empty, animates, mask)
  // against every registered effect on synthetic test frames. This is the
  // same code path as the `verify_effects` IPC command.
  const res = runVerify(["verify-all", "--format", "json"]);
  expect(res.status, `verify-all exit code: ${res.stderr}`).toBe(0);
  expect(res.stdout, "verify-all should produce JSON").toContain("summary");
  expect(res.stdout, "all effects should pass verification").toMatch(
    /"summary":\s*"\d+\/\d+ effects passed verification \(0 failed\)"/
  );
  // Parse and assert no failures.
  const parsed = JSON.parse(res.stdout);
  expect(parsed.failed ?? parsed.failures ?? 0).toBe(0);
});

test("real backend: list-effects returns the full registry with metadata", () => {
  // Mirrors the `list_effects` IPC command. The CLI prints a text table
  // (id, category, name) — we parse the rows and assert every effect has
  // all three fields. The frontend relies on these fields.
  const res = runVerify(["list-effects"]);
  expect(res.status, `list-effects exit code: ${res.stderr}`).toBe(0);
  const lines = res.stdout.split("\n").filter((l) => l.trim());
  // First two lines are header + separator; last line is "Total: N effects".
  expect(lines.length, "should have header + separator + effects + total").toBeGreaterThan(3);
  const totalMatch = res.stdout.match(/Total:\s+(\d+)\s+effects/);
  expect(totalMatch, `total count not found in: ${res.stdout}`).not.toBeNull();
  const total = parseInt(totalMatch![1], 10);
  expect(total, "registry should be non-empty").toBeGreaterThan(50);
  // Effect rows start at index 2 and end before the total line.
  const effectRows = lines.slice(2, lines.length - 1);
  expect(effectRows.length, "effect row count should match total").toBe(total);
  for (const row of effectRows) {
    const trimmed = row.trim();
    expect(trimmed.length, "effect row should have content").toBeGreaterThan(0);
    // Each row has id, category, name separated by whitespace. The id is
    // the first token and must be non-empty (some ids like "mask_isolate"
    // don't have a category prefix, which is valid).
    const idMatch = trimmed.match(/^(\S+)/);
    expect(idMatch, `row should start with an id: ${trimmed}`).not.toBeNull();
    const id = idMatch![1];
    expect(id.length, `effect id should be non-trivial: ${id}`).toBeGreaterThan(2);
  }
});

test("real backend: render-all on real image and video produces output files", () => {
  // This is the real end-to-end pipeline test. It loads a real image and
  // video, runs every effect through the Rust process_frame / process_video
  // trait, encodes the result with FFmpeg, and writes PNG/MP4 files to disk.
  //
  // If MOSHDITHER_TEST_IMAGE / MOSHDITHER_TEST_VIDEO are not set, we skip —
  // CI may not have test media available, but a developer running locally
  // can wire in real files to exercise the full pipeline.
  test.skip(
    !TEST_IMAGE || !existsSync(TEST_IMAGE),
    "MOSHDITHER_TEST_IMAGE not set or missing — skipping render-all image+video test"
  );
  test.skip(
    !TEST_VIDEO || !existsSync(TEST_VIDEO),
    "MOSHDITHER_TEST_VIDEO not set or missing — skipping render-all image+video test"
  );

  const outDir = mkdtempSync(join(tmpdir(), "mosh-render-"));
  try {
    const res = runVerify(
      [
        "render-all",
        "--image",
        TEST_IMAGE,
        "--video",
        TEST_VIDEO,
        "--output",
        outDir,
        "--duration",
        "1",
      ],
      540_000 // 9 min — 4K video render of 98 effects is slow
    );
    expect(res.status, `render-all exit code: ${res.stderr}`).toBe(0);

    // Summary is written to stderr. Combine both streams for matching.
    const combined = res.stderr + "\n" + res.stdout;
    const imgMatch = combined.match(/Image outputs:\s+(\d+)/);
    const vidMatch = combined.match(/Video outputs:\s+(\d+)/);
    const errMatch = combined.match(/Errors:\s+(\d+)/);
    expect(imgMatch, `image count not found in: ${combined}`).not.toBeNull();
    expect(vidMatch, `video count not found in: ${combined}`).not.toBeNull();
    expect(errMatch, `error count not found in: ${combined}`).not.toBeNull();

    const imgCount = parseInt(imgMatch![1], 10);
    const vidCount = parseInt(vidMatch![1], 10);
    const errCount = parseInt(errMatch![1], 10);

    expect(errCount, "no render errors allowed").toBe(0);
    expect(imgCount, "should render at least 50 images").toBeGreaterThan(50);
    expect(vidCount, "should render at least 30 videos").toBeGreaterThan(30);

    // Verify files actually exist on disk and are non-trivial in size.
    const images = readdirSync(join(outDir, "images")).filter((f) => extname(f) === ".png");
    const videos = readdirSync(join(outDir, "videos")).filter((f) => extname(f) === ".mp4");
    expect(images.length, "PNG file count should match summary").toBe(imgCount);
    expect(videos.length, "MP4 file count should match summary").toBe(vidCount);

    // Spot-check a few files are non-empty.
    for (const f of images.slice(0, 3)) {
      const sz = statSync(join(outDir, "images", f)).size;
      expect(sz, `${f} should be non-empty`).toBeGreaterThan(1000);
    }
    for (const f of videos.slice(0, 3)) {
      const sz = statSync(join(outDir, "videos", f)).size;
      expect(sz, `${f} should be non-empty`).toBeGreaterThan(5000);
    }

    // CSV report should exist and have one row per render.
    const csv = readFileSync(join(outDir, "render-report.csv"), "utf8");
    const rows = csv.trim().split("\n").length;
    expect(rows - 1, "CSV row count should match total renders").toBe(imgCount + vidCount);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("real backend: get_media_metadata extracts real file metadata", () => {
  // Mirrors the `get_media_metadata` IPC command. We use the test image if
  // available, otherwise skip — this test is opportunistic.
  test.skip(
    !TEST_IMAGE || !existsSync(TEST_IMAGE),
    "MOSHDITHER_TEST_IMAGE not set — skipping metadata test"
  );

  // mosh-verify doesn't have a direct metadata subcommand, but loading the
  // image via render-all with a single-effect filter exercises the same
  // image_io::load_image path. We just assert the image loads by running
  // a single render and checking the output exists.
  const outDir = mkdtempSync(join(tmpdir(), "mosh-meta-"));
  try {
    const res = runVerify([
      "render-all",
      "--image",
      TEST_IMAGE,
      "--output",
      outDir,
      "--filter",
      "color.invert",
    ]);
    expect(res.status, `single-effect render exit code: ${res.stderr}`).toBe(0);
    expect(res.stderr + res.stdout, "single-effect render should succeed").toContain("OK");
    const images = readdirSync(join(outDir, "images")).filter((f) => f.endsWith(".png"));
    expect(images.length, "should produce one PNG").toBeGreaterThan(0);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

// Helper exported for CI orchestration scripts.
export function realBackendBinaryPath(): string {
  return BIN;
}
