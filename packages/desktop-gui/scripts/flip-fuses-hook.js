#!/usr/bin/env node
/**
 * After-pack hook for electron-builder.
 * Automatically flips security fuses on the packaged Electron binary.
 * This runs AFTER packaging but BEFORE code signing.
 *
 * See: https://www.electron.build/configuration/configuration#afterpack
 */
import { flipFuses, FuseVersion, FuseV1Options } from "@electron/fuses";
import path from "node:path";

/**
 * @param {import("electron-builder").AfterPackContext} context
 */
export default async function afterPack(context) {
  const { electronPlatformName, appOutDir } = context;

  // Determine the Electron binary path based on platform
  let electronBinary;
  if (electronPlatformName === "darwin") {
    electronBinary = path.join(
      appOutDir,
      `${context.packager.appInfo.productFilename}.app`,
      "Contents",
      "MacOS",
      context.packager.appInfo.productFilename
    );
  } else if (electronPlatformName === "win32") {
    electronBinary = path.join(
      appOutDir,
      `${context.packager.appInfo.productFilename}.exe`
    );
  } else {
    // Linux — fuses are not supported; skip
    console.log("[flip-fuses] Skipping fuse flip on Linux (not supported)");
    return;
  }

  console.log(`[flip-fuses] Flipping security fuses on: ${electronBinary}`);

  await flipFuses(electronBinary, {
    version: FuseVersion.V1,
    // Disable ELECTRON_RUN_AS_NODE to prevent RCE via env var
    [FuseV1Options.RunAsNode]: false,
    // Disable NODE_OPTIONS env var tampering
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    // Disable --inspect debugger injection
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    // Validate app.asar integrity at load time (tamper detection)
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    // Only load app from app.asar (prevents unpacked app/ hijacking)
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    // Encrypt cookie store with OS-level keys
    [FuseV1Options.EnableCookieEncryption]: true,
    // Disable extra file:// privileges (app uses custom media:// protocol)
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
  });

  console.log("[flip-fuses] Security fuses flipped successfully.");
}
