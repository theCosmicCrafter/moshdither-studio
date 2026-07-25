import { execSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, afterEach } from "vitest";

const releaseOverlay = join("src-tauri", "tauri.release.conf.json");
const checkpointManifest = join("packages", "python-backend", "sam3-checkpoint.json");

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
