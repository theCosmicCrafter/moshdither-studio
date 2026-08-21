#!/usr/bin/env node
// Generate a Tauri release config overlay that bundles the SAM3 sidecar and model
// resources. The committed tauri.conf.json intentionally omits the sidecar so dev
// builds can fall back to a local sam3_env; this overlay is merged only during
// release builds via `tauri build --config tauri.release.conf.json`.

import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const baseConfPath = join(projectRoot, "src-tauri", "tauri.conf.json");
const releaseConfPath = join(projectRoot, "src-tauri", "tauri.release.conf.json");

if (!existsSync(baseConfPath)) {
  console.error(`tauri.conf.json not found at ${baseConfPath}`);
  process.exit(1);
}

// Refuse to generate an overlay that promises a sidecar which is not on disk.
// Without this the release build either fails deep inside Tauri with a bundling
// error, or -- worse historically -- was simply never run at all, so every
// installer shipped without SAM3 and the app fell back to hunting a developer
// venv that does not exist on a user's machine. That is the "SAM3 unavailable"
// warning users hit.
const binDir = join(projectRoot, "src-tauri", "bin");
const sidecars = existsSync(binDir)
  ? readdirSync(binDir).filter((f) => f.startsWith("sam3-bridge-"))
  : [];
if (sidecars.length === 0) {
  console.error("");
  console.error("  SAM3 sidecar binary not found in src-tauri/bin/");
  console.error("");
  console.error("  A release build must ship the sidecar, or SAM3 segmentation is");
  console.error("  dead on arrival for every user. Build it first:");
  console.error("");
  console.error("      npm run setup:sam3-env      # once: venv + sam3_repo");
  console.error("      npm run build:sam3-sidecar  # produces bin/sam3-bridge-<target>");
  console.error("");
  console.error("  To build the app deliberately WITHOUT SAM3, run tauri build directly:");
  console.error("      npx tauri build");
  console.error("");
  process.exit(1);
}
console.log(`Found SAM3 sidecar: ${sidecars.join(", ")}`);

const overlay = {
  bundle: {
    externalBin: ["bin/sam3-bridge"],
    resources: {
      "../models": "models",
    },
  },
};

if (process.argv.includes("--disable-updater") || !process.env.TAURI_SIGNING_PRIVATE_KEY) {
  overlay.bundle.createUpdaterArtifacts = false;
  console.log("Release overlay will disable updater artifacts (TAURI_SIGNING_PRIVATE_KEY not set)");
}

writeFileSync(releaseConfPath, JSON.stringify(overlay, null, 2) + "\n", "utf8");
console.log(`Wrote SAM3 release overlay to ${releaseConfPath}`);
