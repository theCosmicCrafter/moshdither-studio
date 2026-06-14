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
  // Installation resumability
  installInProgress?: boolean;
  installCheckpoint?: InstallCheckpoint;
}

export interface InstallProgress {
  step: string;
  percent: number; // 0-100
  detail?: string;
}

const ENV_CONFIG_FILE = "env-config.json";
const CHECKPOINT_FILE = "install-checkpoint.json";
const VENV_DIR_NAME = "python-env";
const ASSETS_BIN = "assets/bin";

/* ------------------------------------------------------------------ */
/*  Checkpoint persistence (survives main-process restarts in dev)    */
/* ------------------------------------------------------------------ */

export interface InstallCheckpoint {
  startedAt: string;
  completedSteps: string[];
  lastStep: string;
  percent: number;
}

function checkpointPath(): string {
  return path.join(app.getPath("userData"), CHECKPOINT_FILE);
}

export function readCheckpoint(): InstallCheckpoint | null {
  try {
    const raw = fs.readFileSync(checkpointPath(), "utf-8");
    return JSON.parse(raw) as InstallCheckpoint;
  } catch {
    return null;
  }
}

function writeCheckpoint(cp: InstallCheckpoint): void {
  try {
    fs.writeFileSync(checkpointPath(), JSON.stringify(cp, null, 2));
  } catch {
    // ignore checkpoint write failures — install can still proceed
  }
}

export function clearCheckpoint(): void {
  try {
    if (fs.existsSync(checkpointPath())) {
      fs.unlinkSync(checkpointPath());
    }
  } catch {
    // ignore
  }
}

/* ------------------------------------------------------------------ */
/*  Config persistence (simple JSON in userData)                      */
/* ------------------------------------------------------------------ */

function configPath(): string {
  return path.join(app.getPath("userData"), ENV_CONFIG_FILE);
}

export interface EnvConfig {
  mode: EnvMode;
  installState?: "in-progress" | "complete";
}

export function loadEnvConfig(): EnvConfig {
  try {
    const raw = fs.readFileSync(configPath(), "utf-8");
    const parsed = JSON.parse(raw) as EnvConfig;
    if (parsed.mode === "local" || parsed.mode === "system") {
      return parsed;
    }
  } catch {
    /* missing or corrupt config */
  }
  return { mode: "unconfigured" };
}

export function saveEnvConfig(
  mode: EnvMode,
  installState?: "in-progress" | "complete",
): void {
  const payload: EnvConfig = { mode };
  if (installState) payload.installState = installState;
  fs.writeFileSync(configPath(), JSON.stringify(payload, null, 2));
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
  // In dev: repo root assets/bin/<sub>  (../../../ from dist-electron/ or electron/)
  // In prod:  process.resourcesPath/assets/bin/<sub>
  const isDev = !app.isPackaged;
  if (isDev) {
    return path.resolve(__dirname, "../../../", ASSETS_BIN, sub);
  }
  return path.join(process.resourcesPath, ASSETS_BIN, sub);
}

/* ------------------------------------------------------------------ */
/*  Checks                                                             */
/* ------------------------------------------------------------------ */

function fileExists(p: string): boolean {
  try {
    fs.accessSync(p, fs.constants.F_OK);
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
  const checkpoint = readCheckpoint();
  const status: EnvStatus = {
    mode: cfg.mode,
    pythonOk: false,
    venvOk: false,
    pipOk: false,
    ffmpegOk: false,
    ffprobeOk: false,
    ffglitchOk: false,
    installInProgress:
      cfg.mode === "local" && cfg.installState === "in-progress",
    installCheckpoint: checkpoint ?? undefined,
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

    // Check bundled binaries (copied location first, then original bundle)
    const copiedFfmpegDir = bundledAssetDir("ffmpeg");
    const copiedFfglitchDir = bundledAssetDir("ffglitch");

    let ffmpeg = path.join(copiedFfmpegDir, `ffmpeg${exeSuffix()}`);
    let ffprobe = path.join(copiedFfmpegDir, `ffprobe${exeSuffix()}`);
    if (!fs.existsSync(ffmpeg)) {
      const repoRoot = findProjectRoot();
      ffmpeg = path.join(
        repoRoot,
        "assets",
        "bin",
        "ffmpeg-master-latest-win64-gpl",
        "bin",
        `ffmpeg${exeSuffix()}`,
      );
      ffprobe = path.join(
        repoRoot,
        "assets",
        "bin",
        "ffmpeg-master-latest-win64-gpl",
        "bin",
        `ffprobe${exeSuffix()}`,
      );
    }
    status.ffmpegPath = ffmpeg;
    status.ffprobePath = ffprobe;
    status.ffmpegOk = fs.existsSync(ffmpeg);
    status.ffprobeOk = fs.existsSync(ffprobe);

    let ffgac = path.join(copiedFfglitchDir, `ffgac${exeSuffix()}`);
    let ffedit = path.join(copiedFfglitchDir, `ffedit${exeSuffix()}`);
    if (!fs.existsSync(ffgac)) {
      const repoRoot = findProjectRoot();
      ffgac = path.join(
        repoRoot,
        "assets",
        "bin",
        "ffglitch-0.10.2-windows-x86_64",
        `ffgac${exeSuffix()}`,
      );
      ffedit = path.join(
        repoRoot,
        "assets",
        "bin",
        "ffglitch-0.10.2-windows-x86_64",
        `ffedit${exeSuffix()}`,
      );
    }
    status.ffgacPath = ffgac;
    status.ffeditPath = ffedit;
    status.ffglitchOk = fs.existsSync(ffgac) && fs.existsSync(ffedit);

    // Python CLIs live inside the repo / bundled resources
    const repoRoot = findProjectRoot();
    status.moshCliPath = path.join(
      repoRoot,
      "packages/python-backend/mosh_cli.py",
    );
    status.ditherCliPath = path.join(
      repoRoot,
      "references/dither_pie/dither_cli.py",
    );

    // If install was marked complete, clear any stale checkpoint
    if (cfg.installState === "complete") {
      status.installInProgress = false;
      clearCheckpoint();
    }

    // Auto-repair: if binaries are missing after a "complete" install, reset so
    // the modal prompts the user to re-run the installer on next launch.
    if (
      cfg.installState === "complete" &&
      (!status.ffmpegOk || !status.ffprobeOk || !status.ffglitchOk)
    ) {
      saveEnvConfig("local", "in-progress");
      status.installInProgress = true;
      clearCheckpoint();
    }
  }

  return status;
}

/* ------------------------------------------------------------------ */
/*  Installer — Local env                                             */
/* ------------------------------------------------------------------ */

const INSTALL_STEPS = [
  { id: "check-python", label: "Checking Python", percent: 0 },
  {
    id: "create-venv",
    label: "Creating Python virtual environment",
    percent: 10,
  },
  { id: "upgrade-pip", label: "Upgrading pip", percent: 20 },
  { id: "install-reqs", label: "Installing Python packages", percent: 30 },
  {
    id: "install-dither",
    label: "Installing dither dependencies",
    percent: 50,
  },
  { id: "install-ffmpeg", label: "Installing FFmpeg", percent: 65 },
  { id: "install-ffglitch", label: "Installing FFglitch", percent: 80 },
  { id: "verify", label: "Verifying installation", percent: 95 },
  { id: "ready", label: "Ready", percent: 100 },
] as const;

export async function installLocalEnvironment(
  onProgress: (p: InstallProgress) => void,
): Promise<EnvStatus> {
  // Mark mode as local immediately so the app knows local was chosen
  // even if the process is restarted mid-install.
  saveEnvConfig("local", "in-progress");

  const checkpoint = readCheckpoint();
  const completed = new Set(checkpoint?.completedSteps ?? []);

  function report(stepId: string, detail?: string) {
    const step = INSTALL_STEPS.find((s) => s.id === stepId);
    if (step) {
      onProgress({ step: step.label, percent: step.percent, detail });
    }
  }

  function markDone(stepId: string) {
    completed.add(stepId);
    const step = INSTALL_STEPS.find((s) => s.id === stepId);
    writeCheckpoint({
      startedAt: checkpoint?.startedAt ?? new Date().toISOString(),
      completedSteps: Array.from(completed),
      lastStep: stepId,
      percent: step?.percent ?? 0,
    });
  }

  // -----------------------------------------------------------------
  // 1. Verify system Python exists (we need it to create the venv)
  // -----------------------------------------------------------------
  report("check-python");
  const systemPython = await checkPython();
  if (!systemPython) {
    clearCheckpoint();
    throw new Error(
      "Python is required but was not found on your system.\n" +
        "Please install Python 3.9+ from https://python.org and try again.",
    );
  }
  markDone("check-python");

  // -----------------------------------------------------------------
  // 2. Create venv (idempotent — skip if already exists)
  // -----------------------------------------------------------------
  if (!completed.has("create-venv")) {
    report("create-venv");
    const venv = venvDir();
    if (!fs.existsSync(venv)) {
      await runCommand(systemPython, ["-m", "venv", venv]);
    }
    const py = venvPython();
    if (!fileExists(py)) {
      clearCheckpoint();
      throw new Error(
        `Virtual environment created but python not found at ${py}`,
      );
    }
    markDone("create-venv");
  }

  const py = venvPython();
  const pip = venvPip();

  // -----------------------------------------------------------------
  // 3. Upgrade pip (idempotent — safe to re-run)
  // -----------------------------------------------------------------
  if (!completed.has("upgrade-pip")) {
    report("upgrade-pip");
    await runCommand(py, ["-m", "pip", "install", "--upgrade", "pip"]);
    markDone("upgrade-pip");
  }

  // -----------------------------------------------------------------
  // 4. Install requirements (idempotent — pip handles re-installs)
  // -----------------------------------------------------------------
  if (!completed.has("install-reqs")) {
    report("install-reqs");
    const reqFile = path.join(
      __dirname,
      "../../packages/python-backend/requirements.txt",
    );
    if (fs.existsSync(reqFile)) {
      await runCommand(pip, ["install", "-r", reqFile]);
    }
    markDone("install-reqs");
  }

  // -----------------------------------------------------------------
  // 5. Install additional deps for dither_pie
  // -----------------------------------------------------------------
  if (!completed.has("install-dither")) {
    report("install-dither");
    // torch/torchvision already installed via requirements.txt (avoid double-install)
    const ditherReqs = ["Pillow", "rich", "numpy"];
    await runCommand(pip, ["install", ...ditherReqs]);
    markDone("install-dither");
  }

  // -----------------------------------------------------------------
  // 6. Copy / download FFmpeg (idempotent — checks existence first)
  // -----------------------------------------------------------------
  if (!completed.has("install-ffmpeg")) {
    report("install-ffmpeg");
    await ensureFfmpegBundled();
    markDone("install-ffmpeg");
  }

  // -----------------------------------------------------------------
  // 7. Copy FFglitch (idempotent — checks existence first)
  // -----------------------------------------------------------------
  if (!completed.has("install-ffglitch")) {
    if (process.platform === "win32") {
      report("install-ffglitch");
      await ensureFfglitchBundled();
    } else {
      report(
        "install-ffglitch",
        "FFglitch is not available for your platform. Datamoshing effects will be limited.",
      );
    }
    markDone("install-ffglitch");
  }

  // -----------------------------------------------------------------
  // 8. Verify
  // -----------------------------------------------------------------
  report("verify");
  saveEnvConfig("local", "complete");
  clearCheckpoint();
  const status = await getEnvironmentStatus();

  if (!status.pythonOk || !status.ffmpegOk) {
    throw new Error(
      "Installation verification failed. Check the logs for details.",
    );
  }

  report("ready");
  return status;
}

/* ------------------------------------------------------------------ */
/*  Helpers for bundled binaries                                      */
/* ------------------------------------------------------------------ */

function findProjectRoot(): string {
  const candidates = [
    path.resolve(__dirname, "../../../"),
    path.resolve(__dirname, "../../"),
    path.resolve(__dirname, "../../../../"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "assets", "bin"))) {
      return c;
    }
  }
  return candidates[0];
}

async function ensureFfmpegBundled(): Promise<void> {
  const outDir = bundledAssetDir("ffmpeg");
  fs.mkdirSync(outDir, { recursive: true });

  const ffmpegOut = path.join(outDir, `ffmpeg${exeSuffix()}`);
  const ffprobeOut = path.join(outDir, `ffprobe${exeSuffix()}`);

  if (fs.existsSync(ffmpegOut) && fs.existsSync(ffprobeOut)) {
    return; // already present
  }

  // 1. Try repo-bundled binaries first (the actual assets in the repo)
  const repoRoot = findProjectRoot();
  const repoFfmpegDir = path.join(
    repoRoot,
    "assets",
    "bin",
    "ffmpeg-master-latest-win64-gpl",
    "bin",
  );
  const repoFfmpeg = path.join(repoFfmpegDir, `ffmpeg${exeSuffix()}`);
  const repoFfprobe = path.join(repoFfmpegDir, `ffprobe${exeSuffix()}`);

  if (fs.existsSync(repoFfmpeg) && fs.existsSync(repoFfprobe)) {
    if (!fs.existsSync(ffmpegOut)) fs.copyFileSync(repoFfmpeg, ffmpegOut);
    if (!fs.existsSync(ffprobeOut)) fs.copyFileSync(repoFfprobe, ffprobeOut);
    return;
  }

  // 2. Try ffmpeg-static npm package as fallback
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
    if (fs.existsSync(ffmpegOut) && fs.existsSync(ffprobeOut)) return;
  } catch {
    // ffmpeg-static not installed
  }

  throw new Error(
    `FFmpeg binaries not found. Searched:\n` +
      `  - ${repoFfmpeg}\n` +
      `  - ffmpeg-static npm package\n` +
      `Please ensure FFmpeg is bundled in assets/bin/ffmpeg-master-latest-win64-gpl/bin/ or install ffmpeg-static.`,
  );
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

  // 1. Try repo-bundled binaries at the actual project root
  const repoRoot = findProjectRoot();
  const repoFfglitchDir = path.join(
    repoRoot,
    "assets",
    "bin",
    "ffglitch-0.10.2-windows-x86_64",
  );
  if (fs.existsSync(repoFfglitchDir)) {
    const ffgacSrc = path.join(repoFfglitchDir, `ffgac${exeSuffix()}`);
    const ffeditSrc = path.join(repoFfglitchDir, `ffedit${exeSuffix()}`);
    if (fs.existsSync(ffgacSrc) && !fs.existsSync(ffgacOut)) {
      fs.copyFileSync(ffgacSrc, ffgacOut);
    }
    if (fs.existsSync(ffeditSrc) && !fs.existsSync(ffeditOut)) {
      fs.copyFileSync(ffeditSrc, ffeditOut);
    }
    if (fs.existsSync(ffgacOut) && fs.existsSync(ffeditOut)) return;
  }

  // 2. Legacy fallback (old incorrect relative path)
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
    if (fs.existsSync(ffgacOut) && fs.existsSync(ffeditOut)) return;
  }

  throw new Error(
    `FFglitch binaries not found. Searched:\n` +
      `  - ${repoFfglitchDir}\n` +
      `Please ensure FFglitch is bundled in assets/bin/ffglitch-0.10.2-windows-x86_64/.`,
  );
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
  const repoRoot = findProjectRoot();
  const copiedFfmpegDir = bundledAssetDir("ffmpeg");
  const copiedFfglitchDir = bundledAssetDir("ffglitch");

  let ffmpeg = path.join(copiedFfmpegDir, `ffmpeg${exeSuffix()}`);
  let ffprobe = path.join(copiedFfmpegDir, `ffprobe${exeSuffix()}`);
  if (!fs.existsSync(ffmpeg)) {
    ffmpeg = path.join(
      repoRoot,
      "assets",
      "bin",
      "ffmpeg-master-latest-win64-gpl",
      "bin",
      `ffmpeg${exeSuffix()}`,
    );
    ffprobe = path.join(
      repoRoot,
      "assets",
      "bin",
      "ffmpeg-master-latest-win64-gpl",
      "bin",
      `ffprobe${exeSuffix()}`,
    );
  }

  let ffgac = path.join(copiedFfglitchDir, `ffgac${exeSuffix()}`);
  let ffedit = path.join(copiedFfglitchDir, `ffedit${exeSuffix()}`);
  if (!fs.existsSync(ffgac)) {
    ffgac = path.join(
      repoRoot,
      "assets",
      "bin",
      "ffglitch-0.10.2-windows-x86_64",
      `ffgac${exeSuffix()}`,
    );
    ffedit = path.join(
      repoRoot,
      "assets",
      "bin",
      "ffglitch-0.10.2-windows-x86_64",
      `ffedit${exeSuffix()}`,
    );
  }

  return {
    python: venvPython(),
    moshCli: path.join(repoRoot, "packages/python-backend/mosh_cli.py"),
    ditherCli: path.join(repoRoot, "references/dither_pie/dither_cli.py"),
    ffmpeg,
    ffprobe,
    ffedit,
    ffgac,
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
