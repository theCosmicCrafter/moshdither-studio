/**
 * Build script: Package Python backend + FFmpeg into self-contained binaries.
 *
 * Run this BEFORE `npm run build` / `electron-builder` so the bundled
 * binaries are included in the packaged app.
 *
 * What it does:
 *   1. Creates assets/bin/{ffmpeg,python-backend} directories
 *   2. Copies FFmpeg + FFprobe from ffmpeg-static npm package
 *   3. (Optional) Builds standalone executables from Python CLIs via PyInstaller
 *
 * Prerequisites for Python bundling:
 *   - Python 3.9+ installed
 *   - PyInstaller installed (`pip install pyinstaller`)
 *
 * Usage:
 *   npm run build:backend
 */

const fs = require("fs");
const path = require("path");
const { spawn, execSync } = require("child_process");

const PKG_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(PKG_ROOT, "../..");
const ASSETS_BIN = path.join(PKG_ROOT, "assets", "bin");
const FFMPEG_OUT = path.join(ASSETS_BIN, "ffmpeg");
const PY_BACKEND_OUT = path.join(ASSETS_BIN, "python-backend");

const isWindows = process.platform === "win32";
const exe = isWindows ? ".exe" : "";

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`[build:backend] Created directory: ${dir}`);
  }
}

function copyFile(src, dst) {
  if (!fs.existsSync(src)) {
    console.warn(`[build:backend] Source not found, skipping: ${src}`);
    return false;
  }
  fs.copyFileSync(src, dst);
  console.log(`[build:backend] Copied: ${src} -> ${dst}`);
  return true;
}

// =============================================================================
// 1. FFmpeg / FFprobe (from ffmpeg-static npm package)
// =============================================================================
function bundleFfmpeg() {
  console.log("\n[build:backend] --- Bundling FFmpeg ---");
  ensureDir(FFMPEG_OUT);

  let ffmpegStaticPath;
  let ffprobeStaticPath;

  try {
    ffmpegStaticPath = require.resolve("ffmpeg-static");
    // ffmpeg-static package structure: the binary is the module export
    // or adjacent to the package root
    const ffmpegStaticDir = path.dirname(ffmpegStaticPath);

    // The binary itself might be the resolved file, or in the same dir
    const ffmpegBin = ffmpegStaticPath.endsWith(exe)
      ? ffmpegStaticPath
      : path.join(ffmpegStaticDir, `ffmpeg${exe}`);

    copyFile(ffmpegBin, path.join(FFMPEG_OUT, `ffmpeg${exe}`));
  } catch (err) {
    console.warn(
      "[build:backend] ffmpeg-static not found. Run `npm install` first.\n" +
        "  Or manually place ffmpeg binary in:",
      FFMPEG_OUT,
    );
  }

  try {
    ffprobeStaticPath = require.resolve("ffprobe-static/bin/${process.platform}/ffprobe${exe}");
    // ffprobe-static structure varies by platform
    // Try common paths
    const ffprobePaths = [
      path.join(path.dirname(require.resolve("ffprobe-static/package.json")), "bin", process.platform, `ffprobe${exe}`),
      path.join(path.dirname(require.resolve("ffprobe-static/package.json")), `ffprobe${exe}`),
    ];
    for (const p of ffprobePaths) {
      if (fs.existsSync(p)) {
        copyFile(p, path.join(FFMPEG_OUT, `ffprobe${exe}`));
        break;
      }
    }
  } catch (err) {
    // ffprobe-static is optional; ffmpeg-static often includes ffprobe
    // Check if ffmpeg-static package also has ffprobe
    try {
      const ffmpegPkg = path.dirname(require.resolve("ffmpeg-static/package.json"));
      const ffprobeCandidates = [
        path.join(ffmpegPkg, `ffprobe${exe}`),
        path.join(ffmpegPkg, "..", "ffprobe-static", `ffprobe${exe}`),
        path.join(ffmpegPkg, "bin", process.platform, `ffprobe${exe}`),
      ];
      for (const p of ffprobeCandidates) {
        if (fs.existsSync(p)) {
          copyFile(p, path.join(FFMPEG_OUT, `ffprobe${exe}`));
          break;
        }
      }
    } catch {
      console.warn(
        "[build:backend] ffprobe not found. Place manually in:",
        FFMPEG_OUT,
      );
    }
  }

  console.log("[build:backend] FFmpeg bundle complete.");
}

// =============================================================================
// 2. Python backend (PyInstaller standalone executables)
// =============================================================================
function bundlePythonBackend() {
  console.log("\n[build:backend] --- Bundling Python backend ---");
  ensureDir(PY_BACKEND_OUT);

  // Check if PyInstaller is available
  let pyinstallerAvailable = false;
  try {
    execSync("pyinstaller --version", { stdio: "ignore" });
    pyinstallerAvailable = true;
  } catch {
    console.warn(
      "[build:backend] PyInstaller not found. Skipping Python executable build.\n" +
        "  To build standalone executables, install PyInstaller:\n" +
        "    pip install pyinstaller\n" +
        "  Then re-run: npm run build:backend",
    );
    return;
  }

  const pyBackendDir = path.join(REPO_ROOT, "packages", "python-backend");
  const ditherDir = path.join(REPO_ROOT, "references", "dither_pie");

  // --- Build mosh_cli.py ---
  const moshSrc = path.join(pyBackendDir, "mosh_cli.py");
  const moshSpec = [
    "pyinstaller",
    "--onefile",
    "--name", `mosh-cli${exe}`,
    "--paths", pyBackendDir,
    "--hidden-import", "DatamoshLib.Tomato.tomato",
    "--hidden-import", "DatamoshLib.Original.classic",
    "--hidden-import", "DatamoshLib.Original.repeat",
    "--hidden-import", "DatamoshLib.Original.pymodes",
    "--hidden-import", "DatamoshLib.Original.classic_new",
    "--hidden-import", "DatamoshLib.FFG_effects.basic_modes",
    "--hidden-import", "DatamoshLib.FFG_effects.external_script",
    "--distpath", PY_BACKEND_OUT,
    "--workpath", path.join(PY_BACKEND_OUT, "__build__"),
    "--noconfirm",
    moshSrc,
  ];

  console.log(`[build:backend] Building mosh-cli...`);
  console.log(`[build:backend] Command: ${moshSpec.join(" ")}`);
  try {
    execSync(moshSpec.join(" "), { stdio: "inherit", cwd: pyBackendDir });
  } catch (err) {
    console.error("[build:backend] mosh-cli build failed:", err.message);
  }

  // --- Build dither_cli.py ---
  const ditherSrc = path.join(ditherDir, "dither_cli.py");
  const ditherSpec = [
    "pyinstaller",
    "--onefile",
    "--name", `dither-cli${exe}`,
    "--paths", ditherDir,
    "--hidden-import", "dithering_lib",
    "--hidden-import", "video_processor",
    "--hidden-import", "utils",
    "--hidden-import", "config_manager",
    "--hidden-import", "PIL.Image",
    "--distpath", PY_BACKEND_OUT,
    "--workpath", path.join(PY_BACKEND_OUT, "__build__"),
    "--noconfirm",
    ditherSrc,
  ];

  console.log(`[build:backend] Building dither-cli...`);
  console.log(`[build:backend] Command: ${ditherSpec.join(" ")}`);
  try {
    execSync(ditherSpec.join(" "), { stdio: "inherit", cwd: ditherDir });
  } catch (err) {
    console.error("[build:backend] dither-cli build failed:", err.message);
  }

  console.log("[build:backend] Python backend bundle complete.");
}

// =============================================================================
// 3. FFglitch (manual — platform-specific binaries)
// =============================================================================
function bundleFfglitch() {
  console.log("\n[build:backend] --- Bundling FFglitch ---");
  const ffglitchOut = path.join(ASSETS_BIN, "ffglitch");
  ensureDir(ffglitchOut);

  // Check if binaries already exist in the legacy location
  const legacyDir = path.join(
    PKG_ROOT,
    "assets",
    "bin",
    "ffglitch-0.10.2-windows-x86_64",
  );

  if (fs.existsSync(legacyDir)) {
    const ffgacSrc = path.join(legacyDir, `ffgac${exe}`);
    const ffeditSrc = path.join(legacyDir, `ffedit${exe}`);
    copyFile(ffgacSrc, path.join(ffglitchOut, `ffgac${exe}`));
    copyFile(ffeditSrc, path.join(ffglitchOut, `ffedit${exe}`));
  } else {
    console.warn(
      "[build:backend] FFglitch binaries not found.\n" +
        "  Download from https://ffglitch.org/ and place in:\n" +
        `    ${ffglitchOut}/ffgac${exe}\n` +
        `    ${ffglitchOut}/ffedit${exe}`,
    );
  }
}

// =============================================================================
// Main
// =============================================================================
console.log("[build:backend] ============================================");
console.log("[build:backend] Packaging backend binaries for distribution");
console.log("[build:backend] ============================================");

bundleFfmpeg();
bundleFfglitch();
bundlePythonBackend();

console.log("\n[build:backend] ============================================");
console.log("[build:backend] Done. Bundled binaries location:");
console.log(`[build:backend]   ${ASSETS_BIN}`);
console.log("[build:backend] ============================================");
console.log("\nNext steps:");
console.log("  1. npm run build          # Build Electron app");
console.log("  2. npm run dist           # Package with electron-builder");
