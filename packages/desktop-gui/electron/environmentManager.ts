/**
 * Environment Manager — Self-contained backend installation
 *
 * Handles two runtime modes:
 *   1. "local"   — bundled/isolated Python venv + downloaded binaries
 *   2. "system" — use whatever is on the user's PATH (legacy behaviour)
 *
 * On first launch the renderer shows a modal; the user picks a mode.
 * If "local" is chosen, this module drives the automated install:
 *   - Create Python venv in APP_DATA
 *   - pip-install requirements
 *   - Copy/download FFmpeg binaries
 *   - Copy FFglitch binaries (Windows only for now)
 *   - Verify each component and report progress
 *
 * macOS / Linux caveat:
 *   FFglitch does not provide official macOS or Linux builds.
 *   On those platforms the installer skips FFglitch and falls back
 *   to system FFmpeg.  Datamoshing effects that require FFglitch
 *   will show a user-facing warning until the user manually builds
 *   or installs FFglitch (see docs/FFGLITCH_MAC_LINUX.md).
 */

import path from "node:path";
import fs from "node:fs";
import { spawn, execFile } from "node:child_process";
import { app } from "electron";

export type EnvMode = "local" | "system" | "unconfigured";

export interface EnvStatus {
  mode: EnvMode;
  pythonOk: boolean;
  venvOk: boolean;
  pipOk: boolean;
  ffmpegOk: boolean;
  ffprobeOk: boolean;
  ffglitchOk: boolean;
  // Detailed paths when available
  pythonPath?: string;
  venvDir?: string;
  ffmpegPath?: string;
  ffprobePath?: string;
  ffgacPath?: string;
  ffeditPath?: string;
  moshCliPath?: string;
  ditherCliPath?: string;
}

export interface InstallProgress {
  step: string;
  percent: number; // 0-100
  detail?: string;
}

const ENV_CONFIG_FILE = "env-config.json";
const VENV_DIR_NAME = "python-env";
const ASSETS_BIN = "assets/bin";

/* ------------------------------------------------------------------ */
/*  Config persistence (simple JSON in userData)                      */
/* ------------------------------------------------------------------ */

function configPath(): string {
  return path.join(app.getPath("userData"), ENV_CONFIG_FILE);
}

export function loadEnvConfig(): { mode: EnvMode } {
  try {
    const raw = fs.readFileSync(configPath(), "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed.mode === "local" || parsed.mode === "system") {
      return parsed;
    }
  } catch {
    /* missing or corrupt config */
  }
  return { mode: "unconfigured" };
}

export function saveEnvConfig(mode: EnvMode): void {
  fs.writeFileSync(configPath(), JSON.stringify({ mode }, null, 2));
}

/* ------------------------------------------------------------------ */
/*  Path helpers                                                       */
/* ------------------------------------------------------------------ */

function userDataDir(): string {
  return app.getPath("userData");
}

function venvDir(): string {
  return path.join(userDataDir(), VENV_DIR_NAME);
}

function venvPython(): string {
  const dir = venvDir();
  return process.platform === "win32"
    ? path.join(dir, "Scripts", "python.exe")
    : path.join(dir, "bin", "python");
}

function venvPip(): string {
  const dir = venvDir();
  return process.platform === "win32"
    ? path.join(dir, "Scripts", "pip.exe")
    : path.join(dir, "bin", "pip");
}

function bundledAssetDir(sub: string): string {
  // In dev: repo/packages/desktop-gui/assets/bin/<sub>
  // In prod:  process.resourcesPath/assets/bin/<sub>
  const isDev = !app.isPackaged;
  if (isDev) {
    return path.join(__dirname, "../../", ASSETS_BIN, sub);
  }
  return path.join(process.resourcesPath, ASSETS_BIN, sub);
}

/* ------------------------------------------------------------------ */
/*  Checks                                                             */
/* ------------------------------------------------------------------ */

function fileExists(p: string): boolean {
  try {
    fs.accessSync(p, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function checkPython(): Promise<string | undefined> {
  const candidates =
    process.platform === "win32"
      ? ["python.exe", "python3.exe", "py.exe"]
      : ["python3", "python"];
  for (const bin of candidates) {
    const resolved = await which(bin);
    if (resolved) return resolved;
  }
  return undefined;
}

function which(bin: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const cmd = process.platform === "win32" ? "where" : "which";
    execFile(cmd, [bin], (err, stdout) => {
      if (err) {
        resolve(undefined);
        return;
      }
      const first = stdout.trim().split(/\r?\n/)[0];
      resolve(first || undefined);
    });
  });
}

/* ------------------------------------------------------------------ */
/*  Status gathering                                                   */
/* ------------------------------------------------------------------ */

export async function getEnvironmentStatus(): Promise<EnvStatus> {
  const cfg = loadEnvConfig();
  const status: EnvStatus = {
    mode: cfg.mode,
    pythonOk: false,
    venvOk: false,
    pipOk: false,
    ffmpegOk: false,
    ffprobeOk: false,
    ffglitchOk: false,
  };

  if (cfg.mode === "system") {
    // Just check PATH
    const py = await checkPython();
    status.pythonOk = !!py;
    status.pythonPath = py;
    status.ffmpegOk = !!(await which("ffmpeg"));
    status.ffprobeOk = !!(await which("ffprobe"));
    status.ffglitchOk = !!(await which("ffgac"));
    return status;
  }

  if (cfg.mode === "local") {
    // Check local venv
    const venvPy = venvPython();
    status.pythonPath = venvPy;
    status.pythonOk = fileExists(venvPy);
    status.venvDir = venvDir();
    status.venvOk = fs.existsSync(venvDir());

    const pip = venvPip();
    status.pipOk = fileExists(pip);

    // Check bundled binaries
    const ffmpeg = path.join(bundledAssetDir("ffmpeg"), `ffmpeg${exeSuffix()}`);
    const ffprobe = path.join(
      bundledAssetDir("ffmpeg"),
      `ffprobe${exeSuffix()}`,
    );
    status.ffmpegPath = ffmpeg;
    status.ffprobePath = ffprobe;
    status.ffmpegOk = fs.existsSync(ffmpeg);
    status.ffprobeOk = fs.existsSync(ffprobe);

    const ffgac = path.join(bundledAssetDir("ffglitch"), `ffgac${exeSuffix()}`);
    const ffedit = path.join(
      bundledAssetDir("ffglitch"),
      `ffedit${exeSuffix()}`,
    );
    status.ffgacPath = ffgac;
    status.ffeditPath = ffedit;
    status.ffglitchOk = fs.existsSync(ffgac) && fs.existsSync(ffedit);

    // Python CLIs live inside the repo / bundled resources
    status.moshCliPath = path.join(
      __dirname,
      "../../packages/python-backend/mosh_cli.py",
    );
    status.ditherCliPath = path.join(
      __dirname,
      "../../references/dither_pie/dither_cli.py",
    );
  }

  return status;
}

/* ------------------------------------------------------------------ */
/*  Installer — Local env                                             */
/* ------------------------------------------------------------------ */

export async function installLocalEnvironment(
  onProgress: (p: InstallProgress) => void,
): Promise<EnvStatus> {
  onProgress({ step: "Checking Python", percent: 0 });

  /* 1. Verify system Python exists (we need it to create the venv) */
  const systemPython = await checkPython();
  if (!systemPython) {
    throw new Error(
      "Python is required but was not found on your system.\n" +
        "Please install Python 3.9+ from https://python.org and try again.",
    );
  }

  /* 2. Create venv */
  onProgress({ step: "Creating Python virtual environment", percent: 10 });
  const venv = venvDir();
  if (!fs.existsSync(venv)) {
    await runCommand(systemPython, ["-m", "venv", venv]);
  }

  const py = venvPython();
  const pip = venvPip();
  if (!fileExists(py)) {
    throw new Error(
      `Virtual environment created but python not found at ${py}`,
    );
  }

  /* 3. Upgrade pip */
  onProgress({ step: "Upgrading pip", percent: 20 });
  await runCommand(py, ["-m", "pip", "install", "--upgrade", "pip"]);

  /* 4. Install requirements */
  onProgress({ step: "Installing Python packages", percent: 30 });
  const reqFile = path.join(
    __dirname,
    "../../packages/python-backend/requirements.txt",
  );
  if (fs.existsSync(reqFile)) {
    await runCommand(pip, ["install", "-r", reqFile]);
  }

  /* 5. Install additional deps for dither_pie */
  onProgress({ step: "Installing dither dependencies", percent: 50 });
  const ditherReqs = ["Pillow", "rich", "numpy", "torch", "torchvision"];
  await runCommand(pip, ["install", ...ditherReqs]);

  /* 6. Copy / download FFmpeg */
  onProgress({ step: "Installing FFmpeg", percent: 65 });
  await ensureFfmpegBundled();

  /* 7. Copy FFglitch (Windows only — macOS/Linux caveat) */
  onProgress({ step: "Installing FFglitch", percent: 80 });
  if (process.platform === "win32") {
    await ensureFfglitchBundled();
  } else {
    onProgress({
      step: "Skipping FFglitch",
      percent: 80,
      detail:
        "FFglitch is not available for your platform. Datamoshing effects will be limited.",
    });
  }

  /* 8. Verify */
  onProgress({ step: "Verifying installation", percent: 95 });
  saveEnvConfig("local");
  const status = await getEnvironmentStatus();

  if (!status.pythonOk || !status.ffmpegOk) {
    throw new Error(
      "Installation verification failed. Check the logs for details.",
    );
  }

  onProgress({ step: "Ready", percent: 100 });
  return status;
}

/* ------------------------------------------------------------------ */
/*  Helpers for bundled binaries                                      */
/* ------------------------------------------------------------------ */

async function ensureFfmpegBundled(): Promise<void> {
  const outDir = bundledAssetDir("ffmpeg");
  fs.mkdirSync(outDir, { recursive: true });

  const ffmpegOut = path.join(outDir, `ffmpeg${exeSuffix()}`);
  const ffprobeOut = path.join(outDir, `ffprobe${exeSuffix()}`);

  if (fs.existsSync(ffmpegOut) && fs.existsSync(ffprobeOut)) {
    return; // already present
  }

  // Try ffmpeg-static npm package first
  try {
    const ffmpegStatic = require.resolve("ffmpeg-static");
    const ffprobeStatic = findFfprobeStatic();
    if (
      ffmpegStatic &&
      fs.existsSync(ffmpegStatic) &&
      !fs.existsSync(ffmpegOut)
    ) {
      fs.copyFileSync(ffmpegStatic, ffmpegOut);
    }
    if (
      ffprobeStatic &&
      fs.existsSync(ffprobeStatic) &&
      !fs.existsSync(ffprobeOut)
    ) {
      fs.copyFileSync(ffprobeStatic, ffprobeOut);
    }
  } catch {
    // ffmpeg-static not installed; ignore — user can still use system ffmpeg
  }
}

function findFfprobeStatic(): string | undefined {
  try {
    const pkgRoot = path.dirname(
      require.resolve("ffprobe-static/package.json"),
    );
    const candidates = [
      path.join(pkgRoot, "bin", process.platform, `ffprobe${exeSuffix()}`),
      path.join(pkgRoot, `ffprobe${exeSuffix()}`),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
  } catch {
    // ignore
  }
  return undefined;
}

async function ensureFfglitchBundled(): Promise<void> {
  const outDir = bundledAssetDir("ffglitch");
  fs.mkdirSync(outDir, { recursive: true });

  const ffgacOut = path.join(outDir, `ffgac${exeSuffix()}`);
  const ffeditOut = path.join(outDir, `ffedit${exeSuffix()}`);

  if (fs.existsSync(ffgacOut) && fs.existsSync(ffeditOut)) {
    return;
  }

  // Look for existing bundled binaries in the legacy repo location
  const legacyDir = path.join(
    __dirname,
    "../../assets/bin/ffglitch-0.10.2-windows-x86_64",
  );
  if (fs.existsSync(legacyDir)) {
    const ffgacSrc = path.join(legacyDir, `ffgac${exeSuffix()}`);
    const ffeditSrc = path.join(legacyDir, `ffedit${exeSuffix()}`);
    if (fs.existsSync(ffgacSrc) && !fs.existsSync(ffgacOut)) {
      fs.copyFileSync(ffgacSrc, ffgacOut);
    }
    if (fs.existsSync(ffeditSrc) && !fs.existsSync(ffeditOut)) {
      fs.copyFileSync(ffeditSrc, ffeditOut);
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Low-level helpers                                                  */
/* ------------------------------------------------------------------ */

function exeSuffix(): string {
  return process.platform === "win32" ? ".exe" : "";
}

function runCommand(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: "inherit" });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `Command exited with code ${code}: ${cmd} ${args.join(" ")}`,
          ),
        );
    });
    proc.on("error", (err) => reject(err));
  });
}

/* ------------------------------------------------------------------ */
/*  Path resolution for the rest of the app                            */
/* ------------------------------------------------------------------ */

export interface ResolvedEnvPaths {
  python: string;
  moshCli: string;
  ditherCli: string;
  ffmpeg: string;
  ffprobe: string;
  ffedit: string;
  ffgac: string;
}

export async function resolveEnvPaths(): Promise<ResolvedEnvPaths> {
  const cfg = loadEnvConfig();

  if (cfg.mode === "system") {
    const py =
      (await checkPython()) ||
      (process.platform === "win32" ? "python" : "python3");
    const projectRoot = path.resolve(__dirname, "../../../");
    return {
      python: py,
      moshCli: path.join(projectRoot, "packages/python-backend/mosh_cli.py"),
      ditherCli: path.join(projectRoot, "references/dither_pie/dither_cli.py"),
      ffmpeg: "ffmpeg",
      ffprobe: "ffprobe",
      ffedit: "ffedit",
      ffgac: "ffgac",
    };
  }

  // local mode (or fallback when unconfigured but local exists)
  const ffmpegDir = bundledAssetDir("ffmpeg");
  const ffglitchDir = bundledAssetDir("ffglitch");

  return {
    python: venvPython(),
    moshCli: path.join(__dirname, "../../packages/python-backend/mosh_cli.py"),
    ditherCli: path.join(
      __dirname,
      "../../references/dither_pie/dither_cli.py",
    ),
    ffmpeg: path.join(ffmpegDir, `ffmpeg${exeSuffix()}`),
    ffprobe: path.join(ffmpegDir, `ffprobe${exeSuffix()}`),
    ffedit: path.join(ffglitchDir, `ffedit${exeSuffix()}`),
    ffgac: path.join(ffglitchDir, `ffgac${exeSuffix()}`),
  };
}

/**
 * Resolve the path to a bundled Python script or executable.
 *
 * This is used by the background-removal IPC handler which needs to
 * spawn a Python script directly (not via MosherAdapter / DitherAdapter).
 */
export function resolvePythonPath(): string {
  const root = path.resolve(__dirname, "../../../");
  const bundledPython = path.join(
    root,
    "assets",
    "bin",
    "python",
    `python${process.platform === "win32" ? ".exe" : ""}`,
  );

  if (fs.existsSync(bundledPython)) {
    return bundledPython;
  }

  if (!app.isPackaged) {
    return process.platform === "win32" ? "python" : "python3";
  }

  throw new Error(`Bundled Python not found at ${bundledPython}`);
}
