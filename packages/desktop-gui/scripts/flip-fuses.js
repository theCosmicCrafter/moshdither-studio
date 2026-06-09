#!/usr/bin/env node
/**
 * Flip Electron fuses for production security hardening.
 * Run this script AFTER electron-builder packages the app and BEFORE code signing.
 *
 * Usage:
 *   node scripts/flip-fuses.js <path-to-electron-binary>
 *
 * Example (Windows):
 *   node scripts/flip-fuses.js "dist/Moshdither Studio-win32-x64/Moshdither Studio.exe"
 */
import { flipFuses, FuseVersion, FuseV1Options } from "@electron/fuses";
import path from "node:path";

const target = process.argv[2];
if (!target) {
  console.error("Usage: node scripts/flip-fuses.js <path-to-electron-binary>");
  process.exit(1);
}

const absoluteTarget = path.resolve(target);

flipFuses(absoluteTarget, {
  version: FuseVersion.V1,
  // Disable ELECTRON_RUN_AS_NODE to prevent RCE via env var
  [FuseV1Options.RunAsNode]: false,
  // Disable NODE_OPTIONS env var tampering
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  // Disable --inspect debugger injection
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  // Validate app.asar integrity at load time
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  // Only load app from app.asar (prevents unpacked app/ hijacking)
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
  // Encrypt cookie store with OS-level keys
  [FuseV1Options.EnableCookieEncryption]: true,
  // Disable extra file:// privileges (app uses custom media:// protocol)
  [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
});

console.log(`Flipped security fuses on: ${absoluteTarget}`);
