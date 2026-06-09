/**
 * Compute SHA-256 hash of dist-electron/preload.js for Subresource Integrity.
 * Writes the hash to dist-electron/preload.hash so main.ts can verify at runtime.
 */
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distElectronDir = path.resolve(__dirname, "../dist-electron");
const preloadPath = path.join(distElectronDir, "preload.js");
const hashPath = path.join(distElectronDir, "preload.hash");

if (!fs.existsSync(preloadPath)) {
  console.error("[SRI] preload.js not found at", preloadPath);
  process.exit(1);
}

const hash = crypto
  .createHash("sha256")
  .update(fs.readFileSync(preloadPath))
  .digest("hex");

fs.writeFileSync(hashPath, hash, "utf-8");
console.log("[SRI] Preload hash written to", hashPath, "—", hash);
