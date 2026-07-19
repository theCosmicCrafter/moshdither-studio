import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = resolve(__dirname, "..");

function detectTargetTriple() {
  try {
    return execSync("rustc --print host-tuple", { encoding: "utf8" }).trim();
  } catch {
    // Windows environments without rustc in PATH can fall back to a known triple.
    if (process.platform === "win32") return "x86_64-pc-windows-msvc";
    if (process.platform === "darwin") return "aarch64-apple-darwin";
    return "x86_64-unknown-linux-gnu";
  }
}

function fail(message) {
  console.error(`[verify-external-bins] ${message}`);
  process.exit(1);
}

function warn(message) {
  console.warn(`[verify-external-bins] ${message}`);
}

function ok(message) {
  console.log(`[verify-external-bins] ${message}`);
}

function fileSize(path) {
  try {
    const stats = statSync(path);
    return `${(stats.size / 1024 / 1024).toFixed(1)} MB`;
  } catch {
    return "unknown";
  }
}

import { statSync } from "node:fs";

function main() {
  const target = detectTargetTriple();
  ok(`Host target triple: ${target}`);

  const binDir = join(projectRoot, "src-tauri", "bin");
  const ext = process.platform === "win32" ? ".exe" : "";
  const externalBins = ["ffmpeg", "ffprobe", "ffgac", "ffedit"];

  for (const base of externalBins) {
    const name = `${base}-${target}${ext}`;
    const path = join(binDir, name);
    if (!existsSync(path)) {
      fail(`Missing external binary: ${path}`);
    }
    ok(`Found ${name} (${fileSize(path)})`);

    if (base === "ffmpeg" || base === "ffprobe") {
      try {
        const version = execSync(`"${path}" -version`, { encoding: "utf8" });
        const firstLine = version.split("\n")[0]?.trim();
        ok(`${base} version: ${firstLine}`);
      } catch (e) {
        warn(`${base} exists but -version failed: ${e.message}`);
      }
    }
  }

  // Tauri bundles ../packages/python-backend as resources; runtime resolves
  // a Python interpreter from a sam3_env venv adjacent to the executable.
  const pythonPaths = [
    join(projectRoot, "sam3_env", "Scripts", "python.exe"),
    join(projectRoot, "sam3_env", "bin", "python"),
  ];
  const python = pythonPaths.find((p) => existsSync(p));
  if (!python) {
    fail(
      `No SAM3 Python interpreter found. Expected one of:\n  ${pythonPaths.join("\n  ")}`
    );
  }
  ok(`Found SAM3 Python interpreter: ${python}`);

  try {
    const pyVersion = execSync(`"${python}" --version`, { encoding: "utf8" }).trim();
    ok(`Python version: ${pyVersion}`);
  } catch (e) {
    warn(`Python exists but --version failed: ${e.message}`);
  }

  const bridge = join(projectRoot, "src-tauri", "sam3_bridge.py");
  if (!existsSync(bridge)) {
    fail(`Missing SAM3 bridge script: ${bridge}`);
  }
  ok(`Found SAM3 bridge: ${bridge}`);

  const tauriConf = join(projectRoot, "src-tauri", "tauri.conf.json");
  if (!existsSync(tauriConf)) {
    fail(`Missing Tauri config: ${tauriConf}`);
  }
  try {
    const conf = JSON.parse(readFileSync(tauriConf, "utf8"));
    const externalBinConfig = conf.bundle?.externalBin ?? [];
    const expected = externalBins.map((b) => `bin/${b}`);
    const missing = expected.filter((e) => !externalBinConfig.includes(e));
    if (missing.length) {
      fail(`tauri.conf.json bundle.externalBin is missing: ${missing.join(", ")}`);
    }
    ok("tauri.conf.json externalBin configuration is present");
  } catch (e) {
    fail(`Failed to parse tauri.conf.json: ${e.message}`);
  }
}

main();
