import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
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

/**
 * Known-good sidecar manifest, or null when it cannot be read.
 *
 * Recorded because the binaries are gitignored and were never committed: losing
 * src-tauri/bin/ made the project unbuildable with nothing in the repository
 * saying which version to go and get.
 */
function loadManifest(binDir) {
  const path = join(binDir, "SIDECARS.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    warn(`SIDECARS.json is unreadable (${e.message}); checksum checks skipped.`);
    return null;
  }
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/** What to tell someone whose binary is missing, so the message is actionable. */
function recoveryHint(base, entry) {
  if (!entry) {
    return `No manifest entry for ${base}. See docs/deployment.md section 3.`;
  }
  return (
    `Run:  npm run fetch:external

` +
    `  It downloads ${base} ${entry.version} from ${entry.source},
` +
    `  verifies SHA-256 ${entry.sha256},
` +
    `  and installs it at src-tauri/bin/${entry.file}.` +
    (entry.note ? `
  ${entry.note}` : "")
  );
}

function main() {
  const target = detectTargetTriple();
  ok(`Host target triple: ${target}`);

  const binDir = join(projectRoot, "src-tauri", "bin");
  const ext = process.platform === "win32" ? ".exe" : "";
  const requiredExternalBins = ["ffmpeg", "ffprobe", "ffgac", "ffedit"];
  const manifest = loadManifest(binDir);

  for (const base of requiredExternalBins) {
    const name = `${base}-${target}${ext}`;
    const path = join(binDir, name);
    if (!existsSync(path)) {
      // Name the version and the source. This used to print only the path,
      // which told someone their build was broken without telling them what
      // would fix it -- and nothing else in the repository knew either.
      fail(
        `Missing external binary: ${path}

` +
          recoveryHint(base, manifest?.binaries?.[base])
      );
    }
    ok(`Found ${name} (${fileSize(path)})`);

    // Checksum against the known-good build. A mismatch WARNS rather than
    // fails: upgrading FFmpeg is legitimate. What is not legitimate is an
    // unnoticed change, so it has to be a deliberate one -- update the hash in
    // SIDECARS.json when you mean it.
    const expected = manifest?.binaries?.[base]?.sha256;
    if (expected) {
      const actual = sha256(path);
      if (actual === expected) {
        ok(`${base} matches the pinned build (${manifest.binaries[base].version})`);
      } else {
        warn(
          `${base} differs from the pinned build.
` +
            `  expected ${expected}  (${manifest.binaries[base].version})
` +
            `  actual   ${actual}
` +
            `  If this upgrade is intended, update src-tauri/bin/SIDECARS.json.`
        );
      }
    }

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

  // SAM3 can be supplied either as a packaged sidecar (production) or as a
  // local sam3_env venv (development). The sidecar takes precedence in CI.
  const sam3BridgeName = `sam3-bridge-${target}${ext}`;
  const sam3BridgePath = join(binDir, sam3BridgeName);
  const sam3BridgeReady = existsSync(sam3BridgePath);

  const pythonPaths = [
    join(projectRoot, "sam3_env", "Scripts", "python.exe"),
    join(projectRoot, "sam3_env", "bin", "python"),
  ];
  const python = pythonPaths.find((p) => existsSync(p));

  if (sam3BridgeReady) {
    ok(`Found SAM3 sidecar: ${sam3BridgeName} (${fileSize(sam3BridgePath)})`);
  } else if (python) {
    ok(`SAM3 sidecar not built; using dev Python interpreter: ${python}`);
    try {
      const pyVersion = execSync(`"${python}" --version`, { encoding: "utf8" }).trim();
      ok(`Python version: ${pyVersion}`);
    } catch (e) {
      warn(`Python exists but --version failed: ${e.message}`);
    }
  } else if (process.env.CI || process.env.REQUIRE_SAM3_SIDECAR) {
    fail(
      `No SAM3 runtime found. Either build the sidecar (\`npm run build:sam3-sidecar\`) or create a sam3_env.`
    );
  } else {
    warn(`No SAM3 sidecar or sam3_env found. SAM3 features will not work until one is provided.`);
  }

  const bridge = join(projectRoot, "src-tauri", "sam3_bridge.py");
  if (existsSync(bridge)) {
    ok(`Found SAM3 bridge script: ${bridge}`);
  } else {
    warn(`SAM3 bridge script not found at ${bridge} (only needed for dev venv mode)`);
  }

  const tauriConf = join(projectRoot, "src-tauri", "tauri.conf.json");
  if (!existsSync(tauriConf)) {
    fail(`Missing Tauri config: ${tauriConf}`);
  }
  try {
    const conf = JSON.parse(readFileSync(tauriConf, "utf8"));
    const externalBinConfig = conf.bundle?.externalBin ?? [];
    // FFmpeg/FFglitch binaries are always required in the config.
    const requiredBins = ["bin/ffmpeg", "bin/ffprobe", "bin/ffgac", "bin/ffedit"];
    const missingRequired = requiredBins.filter((e) => !externalBinConfig.includes(e));
    if (missingRequired.length) {
      fail(`tauri.conf.json bundle.externalBin is missing: ${missingRequired.join(", ")}`);
    }
    ok("tauri.conf.json FFmpeg/FFglitch externalBin configuration is present");

    // SAM3 sidecar is optional in dev; if it is listed in the config, the
    // corresponding binary must exist.
    if (externalBinConfig.includes("bin/sam3-bridge")) {
      const sidecarName = `sam3-bridge-${target}${ext}`;
      const sidecarPath = join(binDir, sidecarName);
      if (!existsSync(sidecarPath)) {
        fail(`tauri.conf.json lists bin/sam3-bridge but the binary is missing: ${sidecarPath}`);
      }
      ok(`Found configured SAM3 sidecar: ${sidecarName} (${fileSize(sidecarPath)})`);
    } else {
      ok("tauri.conf.json does not list bin/sam3-bridge (dev fallback to sam3_env)");
    }
  } catch (e) {
    fail(`Failed to parse tauri.conf.json: ${e.message}`);
  }
}

main();
