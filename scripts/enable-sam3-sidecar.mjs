#!/usr/bin/env node
// Generate a Tauri release config overlay that bundles the SAM3 sidecar and model
// resources. The committed tauri.conf.json intentionally omits the sidecar so dev
// builds can fall back to a local sam3_env; this overlay is merged only during
// release builds via `tauri build --config tauri.release.conf.json`.

import { existsSync, writeFileSync } from "node:fs";
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
