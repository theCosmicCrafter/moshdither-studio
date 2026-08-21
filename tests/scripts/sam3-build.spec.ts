import { execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { describe, expect, it, afterEach, beforeAll, afterAll } from "vitest";

const baseConf = join("src-tauri", "tauri.conf.json");
const releaseOverlay = join("src-tauri", "tauri.release.conf.json");
const checkpointManifest = join("packages", "python-backend", "sam3-checkpoint.json");
const binDir = join("src-tauri", "bin");

/**
 * The generator refuses to emit an overlay promising a sidecar that is not on
 * disk -- otherwise a release build fails deep inside Tauri's bundler, or
 * historically was never run at all and shipped an installer with no SAM3.
 * A checkout that has not run `npm run build:sam3-sidecar` (CI, a fresh clone)
 * has no binary, so stand in a stub for the duration of the suite.
 */
let stubSidecar: string | null = null;

beforeAll(() => {
  const hasSidecar =
    existsSync(binDir) && readdirSync(binDir).some((f) => f.startsWith("sam3-bridge-"));
  if (!hasSidecar) {
    mkdirSync(binDir, { recursive: true });
    stubSidecar = join(binDir, "sam3-bridge-test-stub.exe");
    writeFileSync(stubSidecar, "");
  }
});

afterAll(() => {
  if (stubSidecar) rmSync(stubSidecar, { force: true });
});

describe("SAM3 build infrastructure", () => {
  afterEach(() => {
    if (existsSync(releaseOverlay)) {
      rmSync(releaseOverlay);
    }
  });

  it("generates a release Tauri overlay with sidecar and model resources", () => {
    const result = execSync("node scripts/enable-sam3-sidecar.mjs --release", {
      encoding: "utf8",
    });
    expect(result).toContain("Wrote SAM3 release overlay");
    expect(existsSync(releaseOverlay)).toBe(true);

    const overlay = JSON.parse(readFileSync(releaseOverlay, "utf8"));
    expect(overlay.bundle.externalBin).toContain("bin/sam3-bridge");
    expect(overlay.bundle.resources["../models"]).toBe("models");
  });

  it("keeps every base externalBin and resource, because Tauri replaces rather than merges", () => {
    // A --config overlay REPLACES arrays and objects. An overlay naming only
    // the sidecar drops the four FFmpeg binaries; one naming only ../models
    // drops python-backend and the whole LUT library. Either produces an
    // installer that starts and then cannot process video or show a LUT.
    // The assertions above pass in both cases, which is why this exists.
    execSync("node scripts/enable-sam3-sidecar.mjs --release", { encoding: "utf8" });
    const base = JSON.parse(readFileSync(baseConf, "utf8"));
    const overlay = JSON.parse(readFileSync(releaseOverlay, "utf8"));

    for (const bin of base.bundle.externalBin) {
      expect(overlay.bundle.externalBin, `${bin} must survive the overlay`).toContain(bin);
    }
    for (const [src, dest] of Object.entries(base.bundle.resources)) {
      expect(overlay.bundle.resources[src], `${src} must survive the overlay`).toBe(dest);
    }
    expect(overlay.bundle.externalBin).toEqual(
      expect.arrayContaining(["bin/ffmpeg", "bin/ffprobe", "bin/ffgac", "bin/ffedit"])
    );
    expect(overlay.bundle.resources["../public/lut"]).toBe("lut");
  });

  it("does not list the sidecar twice when regenerated", () => {
    execSync("node scripts/enable-sam3-sidecar.mjs --release", { encoding: "utf8" });
    const overlay = JSON.parse(readFileSync(releaseOverlay, "utf8"));
    const count = overlay.bundle.externalBin.filter((b: string) => b === "bin/sam3-bridge").length;
    expect(count).toBe(1);
  });

  it("refuses to generate an overlay when no sidecar binary exists", () => {
    // Guards the failure mode that shipped every installer without SAM3: an
    // overlay generated in the absence of the binary it promises.
    const existing = readdirSync(binDir).filter((f) => f.startsWith("sam3-bridge-"));
    const parked = existing.map((f) => {
      const from = join(binDir, f);
      // Must not itself start with "sam3-bridge-", or the generator still
      // finds it and the test proves nothing.
      const to = join(binDir, `parked_${f}`);
      // rename, not read+write: a GPU sidecar is ~2.9 GB and readFileSync
      // throws "File size is greater than 2 GiB" on Node's buffer limit --
      // the same 2 GB class of limit that stops makensis and WiX packaging it.
      renameSync(from, to);
      return { from, to };
    });
    try {
      expect(() =>
        execSync("node scripts/enable-sam3-sidecar.mjs --release", { stdio: "pipe" })
      ).toThrow();
      expect(existsSync(releaseOverlay)).toBe(false);
    } finally {
      for (const { from, to } of parked) {
        renameSync(to, from);
      }
    }
  });

  it("checkpoint manifest contains required fields", () => {
    const manifest = JSON.parse(readFileSync(checkpointManifest, "utf8"));
    expect(manifest.repo_id).toBeTruthy();
    expect(manifest.filename).toBeTruthy();
    expect(manifest.local_name).toBeTruthy();
    expect(typeof manifest.repo_id).toBe("string");
    expect(typeof manifest.filename).toBe("string");
    expect(typeof manifest.local_name).toBe("string");
  });
});
