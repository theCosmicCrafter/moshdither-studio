import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  protocol,
  net,
  safeStorage,
  Menu,
  TouchBar,
} from "electron";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname } from "node:path";
import fs from "node:fs";
import os from "node:os";
import { spawn } from "node:child_process";
import nodeCrypto from "node:crypto";
import { MosherAdapter } from "../../mosh-engine/src/adapters/MosherAdapter";
import { DitherAdapter } from "../../mosh-engine/src/adapters/DitherAdapter";
import { installLogger, writeRendererLog, checkCrashMarker } from "./logger";
import { initAutoUpdater } from "./updater";

// Disable background timer throttling so render loops and video processing
// continue smoothly even when the window loses focus.
try {
  app.commandLine.appendSwitch("disable-background-timer-throttling");
  app.commandLine.appendSwitch("disable-renderer-backgrounding");
  app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
  // Increase renderer heap for large texture pipelines
  app.commandLine.appendSwitch("js-flags", "--max-old-space-size=4096");
  // Start GPU sandbox earlier for extra isolation
  app.commandLine.appendSwitch("gpu-sandbox-start-early");
} catch {
  // Ignore if unsupported in this Electron version
}

// Register privileged scheme before app ready to allow loading local files to WebGL textures
protocol.registerSchemesAsPrivileged([
  {
    scheme: "media",
    privileges: {
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

// ---------------------------------------------------------------------------
// Structured logging (install before anything else can throw)
// ---------------------------------------------------------------------------
installLogger();

// Check for previous crash and log it
const crashCheck = checkCrashMarker();
if (crashCheck.crashed) {
  console.warn("[Logger] Previous session crashed:", crashCheck.info);
}

// ---------------------------------------------------------------------------
// Security: RPC token for Python backend authentication
// ---------------------------------------------------------------------------
const RPC_TOKEN = nodeCrypto.randomBytes(32).toString("hex");
process.env.MOSHDITHER_RPC_TOKEN = RPC_TOKEN;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve project root from __dirname (works in both dev and prod)
const projectRoot = path.resolve(__dirname, "../../../");

const ffglitchPath = path.join(
  __dirname,
  "../../assets/bin/ffglitch-0.10.2-windows-x86_64/ffglitch.exe",
);
const ffmpegPath = path.join(
  __dirname,
  "../../assets/bin/ffmpeg-master-latest-win64-gpl/bin/ffmpeg.exe",
);
const ffprobePath = path.join(
  __dirname,
  "../../assets/bin/ffmpeg-master-latest-win64-gpl/bin/ffprobe.exe",
);
const moshCliPath = path.join(
  projectRoot,
  "packages/python-backend/mosh_cli.py",
);
const ditherCliPath = path.join(
  projectRoot,
  "references/dither_pie/dither_cli.py",
);
const pythonPath = process.platform === "win32" ? "python" : "python3";

const mosher = new MosherAdapter(
  pythonPath,
  moshCliPath,
  ffglitchPath,
  ffmpegPath,
);
const ditherer = new DitherAdapter(pythonPath, ditherCliPath);

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`Spawning ffmpeg: ${ffmpegPath} ${args.join(" ")}`);
    const proc = spawn(ffmpegPath, args);
    let stderr = "";
    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}. Error: ${stderr}`));
      }
    });
  });
}

export function readMediaMetadata(
  filePath: string,
): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const proc = spawn(ffprobePath, [
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      filePath,
    ]);
    let stdout = "";
    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    proc.on("close", () => {
      try {
        resolve(JSON.parse(stdout));
      } catch {
        resolve({});
      }
    });
  });
}

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ └── main.js
// │
process.env.DIST = path.join(__dirname, "../dist");
const distPath = process.env.DIST || path.join(__dirname, "../dist");
process.env.VITE_PUBLIC = app.isPackaged
  ? distPath
  : path.join(distPath, "../public");

let win: BrowserWindow | null;
// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - SystemJS interoperability
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: path.join(process.env.VITE_PUBLIC || "", "electron-vite.svg"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  // Test active push message to Renderer-process.
  win.webContents.on("did-finish-load", () => {
    win?.webContents.send("main-process-message", new Date().toLocaleString());
  });

  // --- Navigation & new-window hardening ---
  win.webContents.on("will-navigate", (event, url) => {
    // In dev mode, allow Vite dev server; in production, block all external nav
    const allowed = VITE_DEV_SERVER_URL
      ? url.startsWith(VITE_DEV_SERVER_URL)
      : false;
    if (!allowed && url !== win?.webContents.getURL()) {
      event.preventDefault();
      console.warn("[Security] Blocked navigation to:", url);
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    console.warn("[Security] Blocked new window:", url);
    return { action: "deny" };
  });

  // --- Permission hardening ---
  win.webContents.session.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      // Only allow media access; block geolocation, notifications, etc.
      const allowed = permission === "media";
      if (!allowed) {
        console.warn("[Security] Denied permission request:", permission);
      }
      callback(allowed);
    },
  );

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(distPath, "index.html"));
  }
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

/**
 * Validates that a resolved path does not contain directory traversal sequences
 * and is an absolute path. Returns the sanitized path or null if unsafe.
 */
function validateMediaPath(rawPath: string): string | null {
  // Reject paths containing traversal sequences BEFORE normalization
  // After path.normalize(), ".." segments are already resolved, making
  // a post-normalization check useless (e.g. C:\foo\..\bar becomes C:\bar).
  if (/(?:^|[\\/])\.\.(?:[\\/]|$)/.test(rawPath)) {
    console.error("Blocked media path with traversal sequence:", rawPath);
    return null;
  }
  const normalized = path.normalize(rawPath);
  // Double-check the normalized result did not escape to a relative path
  if (!path.isAbsolute(normalized)) {
    console.error("Blocked relative media path:", rawPath);
    return null;
  }
  return normalized;
}

function getPathFromMediaUrl(mediaUrl: string): string | null {
  let rawPath: string;
  try {
    const decoded = decodeURIComponent(mediaUrl);
    const url = new URL(decoded);
    if (url.host) {
      if (url.host.length === 1) {
        rawPath = url.host + ":" + url.pathname;
      } else {
        rawPath = url.host + url.pathname;
      }
    } else {
      let p = url.pathname;
      if (p.startsWith("/")) {
        p = p.slice(1);
      }
      rawPath = p;
    }
  } catch {
    // Fallback if URL parsing fails
    let cleaned = mediaUrl.replace(/^media:\/\//i, "");
    cleaned = decodeURIComponent(cleaned);
    rawPath = cleaned;
  }
  return validateMediaPath(rawPath);
}

/**
 * Subresource Integrity: verify that preload.js has not been tampered with.
 * Compares SHA-256 of the actual preload.js against a build-time hash file.
 */
function verifyPreloadIntegrity(): void {
  const preloadPath = path.join(__dirname, "preload.js");
  const hashPath = path.join(__dirname, "preload.hash");

  if (!fs.existsSync(hashPath)) {
    console.warn("[SRI] No preload.hash found. Skipping integrity check.");
    return;
  }

  const expected = fs.readFileSync(hashPath, "utf-8").trim();
  const actual = nodeCrypto
    .createHash("sha256")
    .update(fs.readFileSync(preloadPath))
    .digest("hex");

  if (expected !== actual) {
    throw new Error(
      `Preload integrity mismatch: expected ${expected}, got ${actual}`,
    );
  }
  console.log("[SRI] Preload integrity verified.");
}

interface PipelineEffect {
  enabled: boolean;
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: any;
  startTime?: number;
  endTime?: number;
}

/**
 * Validate that an IPC message sender is from a trusted origin.
 * In production, the renderer loads from file:// or the dev server.
 */
function validateIpcSender(event: Electron.IpcMainInvokeEvent): void {
  const senderUrl = event.senderFrame?.url ?? "";
  const trusted =
    senderUrl.startsWith("file://") ||
    senderUrl.startsWith("media://") ||
    (VITE_DEV_SERVER_URL ? senderUrl.startsWith(VITE_DEV_SERVER_URL) : false);
  if (!trusted) {
    throw new Error(`Unauthorized IPC sender: ${senderUrl}`);
  }
}

// Protocol registration must happen before app is ready if using registerSchemesAsPrivileged,
// but registerFileProtocol can happen after ready.
app.whenReady().then(() => {
  const projectRoot = path.resolve(__dirname, "../../..");
  const defaultOutputDir = path.join(projectRoot, "outputs");
  if (!fs.existsSync(defaultOutputDir)) {
    fs.mkdirSync(defaultOutputDir, { recursive: true });
  }

  // Expose the Python RPC auth token to the renderer (via IPC) so it can
  // make authenticated requests to the local Python backend.
  ipcMain.handle("get-rpc-token", (event) => {
    validateIpcSender(event);
    return RPC_TOKEN;
  });

  ipcMain.handle("get-default-output-dir", (event) => {
    validateIpcSender(event);
    return defaultOutputDir.replace(/\\/g, "/");
  });

  ipcMain.handle("dialog:selectOutputDir", async (event) => {
    validateIpcSender(event);
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
    });
    if (!canceled && filePaths.length > 0) {
      return filePaths[0].replace(/\\/g, "/");
    }
    return null;
  });

  protocol.handle("media", async (request) => {
    try {
      const decodedPath = getPathFromMediaUrl(request.url);
      if (!decodedPath) {
        return new Response("Forbidden", { status: 403 });
      }
      const response = await net.fetch(pathToFileURL(decodedPath).toString());

      const headers = new Headers(response.headers);
      headers.set("Access-Control-Allow-Origin", "*");
      headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
      headers.set("Access-Control-Allow-Headers", "*");

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      console.error("Failed to load media file:", error);
      return new Response("Error loading media file", {
        status: 500,
        headers: new Headers({ "Access-Control-Allow-Origin": "*" }),
      });
    }
  });

  // WebGL Export Bridge: main→renderer→main roundtrip
  let webglExportResolve: ((filePath: string) => void) | null = null;

  ipcMain.handle(
    "main:save-webgl-blob",
    async (event, { data, ext }: { data: ArrayBuffer; ext: string }) => {
      validateIpcSender(event);
      const tmpPath = path.join(
        os.tmpdir(),
        `webgl_export_${Date.now()}${ext}`,
      );
      fs.writeFileSync(tmpPath, Buffer.from(data));
      if (webglExportResolve) {
        webglExportResolve(tmpPath);
        webglExportResolve = null;
      }
      return tmpPath;
    },
  );

  async function captureWebGLFromRenderer(
    inputUrl: string,
    _effects: PipelineEffect[],
    duration: number,
    fps: number,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!win) {
        reject(new Error("No renderer window available for WebGL capture"));
        return;
      }
      webglExportResolve = resolve;
      // Timeout safety
      setTimeout(() => {
        if (webglExportResolve) {
          webglExportResolve = null;
          reject(new Error("WebGL export timed out after 120s"));
        }
      }, 120000);

      win.webContents.send("main:webgl-export-request", {
        inputUrl,
        duration,
        fps,
      });
    });
  }

  ipcMain.handle("dialog:openMedia", async (event) => {
    validateIpcSender(event);
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [
        {
          name: "Media Files",
          extensions: ["jpg", "jpeg", "png", "mp4", "webm"],
        },
      ],
    });
    if (!canceled && filePaths.length > 0) {
      // Normalize windows paths to avoid slashes issues
      const normalized = filePaths[0].replace(/\\/g, "/");
      return `media://${normalized}`;
    }
    return null;
  });

  ipcMain.handle("dialog:openMediaMultiple", async (event) => {
    validateIpcSender(event);
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ["openFile", "multiSelections"],
      filters: [
        {
          name: "Media Files",
          extensions: ["jpg", "jpeg", "png", "mp4", "webm"],
        },
      ],
    });
    if (!canceled && filePaths.length > 0) {
      return filePaths.map((p) => `media://${p.replace(/\\/g, "/")}`);
    }
    return [];
  });

  // ---------------------------------------------------------------------------
  // Secure localStorage via safeStorage (OS-level encryption)
  // ---------------------------------------------------------------------------
  ipcMain.handle("safe-storage:read", async (event, key: string) => {
    validateIpcSender(event);
    if (!safeStorage.isEncryptionAvailable()) {
      return null;
    }
    const filePath = path.join(
      app.getPath("userData"),
      "safe-storage",
      `${key}.bin`,
    );
    try {
      const encrypted = fs.readFileSync(filePath);
      return safeStorage.decryptString(encrypted);
    } catch {
      return null;
    }
  });

  ipcMain.handle(
    "safe-storage:write",
    async (event, key: string, value: string) => {
      validateIpcSender(event);
      if (!safeStorage.isEncryptionAvailable()) {
        return;
      }
      const dir = path.join(app.getPath("userData"), "safe-storage");
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const filePath = path.join(dir, `${key}.bin`);
      const encrypted = safeStorage.encryptString(value);
      fs.writeFileSync(filePath, encrypted);
    },
  );

  ipcMain.handle("safe-storage:delete", async (event, key: string) => {
    validateIpcSender(event);
    const filePath = path.join(
      app.getPath("userData"),
      "safe-storage",
      `${key}.bin`,
    );
    try {
      fs.unlinkSync(filePath);
    } catch {
      // File may not exist; ignore
    }
  });

  // ---------------------------------------------------------------------------
  // Proxy media generation (lower-res previews for smooth editing)
  // ---------------------------------------------------------------------------
  const PROXY_DIR = path.join(os.homedir(), ".moshdither", "proxies");

  function getProxyPath(originalPath: string): string {
    const hash = nodeCrypto
      .createHash("sha256")
      .update(originalPath)
      .digest("hex")
      .slice(0, 32);
    const ext = path.extname(originalPath);
    return path.join(PROXY_DIR, `${hash}_proxy${ext}`);
  }

  ipcMain.handle("proxy:has", async (event, mediaUrl: string) => {
    validateIpcSender(event);
    const originalPath = getPathFromMediaUrl(mediaUrl);
    if (!originalPath) return false;
    const proxyPath = getProxyPath(originalPath);
    return fs.existsSync(proxyPath);
  });

  ipcMain.handle("proxy:generate", async (event, mediaUrl: string) => {
    validateIpcSender(event);
    const originalPath = getPathFromMediaUrl(mediaUrl);
    if (!originalPath) throw new Error("Invalid media URL");
    const proxyPath = getProxyPath(originalPath);
    if (fs.existsSync(proxyPath))
      return `media://${proxyPath.replace(/\\/g, "/")}`;

    if (!fs.existsSync(PROXY_DIR)) fs.mkdirSync(PROXY_DIR, { recursive: true });

    return new Promise<string>((resolve, reject) => {
      const args = [
        "-i",
        originalPath,
        "-vf",
        "scale=-2:720",
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "28",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        "-y",
        proxyPath,
      ];
      const proc = spawn(ffmpegPath, args);
      let stderr = "";
      proc.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });
      proc.on("close", (code) => {
        if (code === 0) {
          resolve(`media://${proxyPath.replace(/\\/g, "/")}`);
        } else {
          reject(new Error(`ffmpeg proxy generation failed (code ${code})`));
        }
      });
    });
  });

  ipcMain.handle("proxy:cleanup", async (event) => {
    validateIpcSender(event);
    if (!fs.existsSync(PROXY_DIR)) return;
    const now = Date.now();
    const maxAge = 30 * 24 * 60 * 60 * 1000;
    for (const file of fs.readdirSync(PROXY_DIR)) {
      const filePath = path.join(PROXY_DIR, file);
      const stats = fs.statSync(filePath);
      if (now - stats.mtime.getTime() > maxAge) {
        fs.unlinkSync(filePath);
      }
    }
  });

  ipcMain.handle("metadata:read", async (event, mediaUrl: string) => {
    validateIpcSender(event);
    const filePath = getPathFromMediaUrl(mediaUrl);
    if (!filePath) return null;
    try {
      return await readMediaMetadata(filePath);
    } catch {
      return null;
    }
  });

  ipcMain.handle(
    "render:pipeline",
    async (
      event,
      inputUrl: string,
      effects: PipelineEffect[],
      outputDirectory?: string,
      exportFormat?: string,
      exportFps?: number,
      useProxy?: boolean,
    ) => {
      validateIpcSender(event);
      try {
        let currentPath = getPathFromMediaUrl(inputUrl);
        if (!currentPath) {
          throw new Error("Invalid or unsafe input URL provided.");
        }
        // Use proxy if requested and available
        if (useProxy) {
          const proxyPath = getProxyPath(currentPath);
          if (fs.existsSync(proxyPath)) {
            currentPath = proxyPath;
          }
        }
        const originalExt = path.extname(currentPath);

        let targetExt = originalExt;
        if (exportFormat === "png") targetExt = ".png";
        else if (exportFormat === "jpg") targetExt = ".jpg";
        else if (exportFormat === "gif") targetExt = ".gif";
        else if (exportFormat === "mp4") targetExt = ".mp4";

        console.log(
          `Starting Render Pipeline on: ${currentPath} with ${effects.length} effects. Target format: ${exportFormat || "same"} (${targetExt})`,
        );

        const enabledEffects = effects.filter((fx) => fx.enabled);
        const totalSteps = enabledEffects.length + 2; // +2 for init and final conversion
        let completedSteps = 0;

        const reportProgress = (log: string) => {
          completedSteps++;
          const percent = Math.floor((completedSteps / totalSteps) * 100);
          win?.webContents.send("render:progress", { percent, log });
        };

        reportProgress("Initializing render pipeline...");

        const webglTypes = new Set([
          "analog-glitch",
          "crt-phosphor",
          "epsilon-glow",
          "temporal-noise",
        ]);
        const hasWebGLEffects = effects.some(
          (fx) => fx.enabled && webglTypes.has(fx.type),
        );

        if (hasWebGLEffects && win) {
          // Build a media:// URL from currentPath for the renderer
          const webglInputUrl = currentPath.startsWith("media://")
            ? currentPath
            : `media://${currentPath.replace(/\\/g, "/")}`;
          const duration =
            effects.find((fx) => typeof fx.endTime === "number")?.endTime || 10;
          console.log(
            `Delegating WebGL effects to renderer for ${duration}s at ${exportFps || 30}fps`,
          );
          currentPath = await captureWebGLFromRenderer(
            webglInputUrl,
            effects.filter((fx) => fx.enabled && webglTypes.has(fx.type)),
            duration,
            exportFps || 30,
          );
          reportProgress(`WebGL effects captured: ${currentPath}`);
        }

        for (const fx of effects) {
          if (!fx.enabled) continue;
          // Skip WebGL effects — already handled above
          if (webglTypes.has(fx.type)) continue;

          if (fx.type === "datamosh") {
            const tempOut = path.join(
              os.tmpdir(),
              `mosh_step_${Date.now()}${originalExt}`,
            );
            const params = { ...fx.params };

            // Set mode parameter if not already set
            params.mode = params.mode || "classic";

            // Decouple motionUrl if present
            if (params.motionUrl) {
              const motionPath = getPathFromMediaUrl(params.motionUrl);
              if (!motionPath) {
                throw new Error("Invalid or unsafe motion URL provided.");
              }
              params.motionUrl = motionPath;
            }

            await mosher.applyMosh(currentPath, tempOut, params);
            currentPath = tempOut;
            reportProgress(`Applied datamosh (${params.mode})`);
          } else if (fx.type === "dither") {
            currentPath = await ditherer.applyDither(currentPath, {
              ditherMode: fx.params.ditherMode || "atkinson",
              paletteSource: fx.params.paletteSource || "kmeans",
              numColors: fx.params.numColors || 16,
              useGamma: fx.params.useGamma,
              matrixSize: fx.params.matrixSize,
              errorDiffusionVariant: fx.params.errorDiffusionVariant,
              serpentine: fx.params.serpentine,
              scale: fx.params.scale,
              seed: fx.params.seed,
              dotSize: fx.params.dotSize,
              gamma: fx.params.gamma,
            });
            reportProgress(
              `Applied dither (${fx.params.ditherMode || "atkinson"})`,
            );
          } else if (fx.type === "halftone") {
            currentPath = await ditherer.applyDither(currentPath, {
              ditherMode: "halftone",
              paletteSource: "kmeans",
              numColors: 16,
              dotSize: fx.params.dotSize || 8,
              angleK: fx.params.angleK || 45.0,
            });
            reportProgress("Applied halftone");
          }
        }

        // Check if conversion is required
        const currentExt = path.extname(currentPath).toLowerCase();
        const targetExtLower = targetExt.toLowerCase();

        if (currentExt !== targetExtLower) {
          console.log(
            `Converting output from ${currentExt} to ${targetExtLower} with target FPS: ${exportFps || 30}`,
          );
          const conversionTempPath = path.join(
            os.tmpdir(),
            `conv_step_${Date.now()}${targetExtLower}`,
          );

          const videoExts = [
            ".mp4",
            ".avi",
            ".mov",
            ".mkv",
            ".webm",
            ".flv",
            ".wmv",
          ];
          const imageExts = [
            ".png",
            ".jpg",
            ".jpeg",
            ".gif",
            ".bmp",
            ".tiff",
            ".webp",
          ];

          const isCurrentVideo = videoExts.includes(currentExt);
          const isCurrentImage = imageExts.includes(currentExt);
          const isTargetVideo = videoExts.includes(targetExtLower);
          const isTargetImage = imageExts.includes(targetExtLower);

          let args: string[] = [];
          const fps = exportFps || 30;

          if (isCurrentImage && isTargetVideo) {
            // Loop static image to video or animated GIF
            let loopDuration = 5;
            if (effects && effects.length > 0) {
              const firstActive = effects.find((fx) => fx.enabled);
              if (
                firstActive &&
                typeof firstActive.endTime === "number" &&
                typeof firstActive.startTime === "number"
              ) {
                const diff = firstActive.endTime - firstActive.startTime;
                if (diff > 0) loopDuration = diff;
              }
            }

            if (targetExtLower === ".mp4") {
              // Loop image to MP4 with exact frame rate and duration
              args = [
                "-loop",
                "1",
                "-framerate",
                fps.toString(),
                "-i",
                currentPath,
                "-map_metadata",
                "0",
                "-c:v",
                "libx264",
                "-t",
                loopDuration.toString(),
                "-r",
                fps.toString(),
                "-pix_fmt",
                "yuv420p",
                "-vf",
                "scale=trunc(iw/2)*2:trunc(ih/2)*2",
                conversionTempPath,
                "-y",
              ];
            } else if (targetExtLower === ".gif") {
              // Loop image to animated GIF with exact frame rate and duration
              args = [
                "-loop",
                "1",
                "-framerate",
                fps.toString(),
                "-i",
                currentPath,
                "-map_metadata",
                "0",
                "-t",
                loopDuration.toString(),
                "-r",
                fps.toString(),
                "-vf",
                "scale=trunc(iw/2)*2:trunc(ih/2)*2",
                conversionTempPath,
                "-y",
              ];
            }
          } else if (isCurrentVideo && targetExtLower === ".gif") {
            // Video to high-quality GIF using palettegen
            args = [
              "-i",
              currentPath,
              "-map_metadata",
              "0",
              "-r",
              fps.toString(),
              "-filter_complex",
              `[0:v] fps=${fps},split [a][b];[a] palettegen [p];[b][p] paletteuse`,
              conversionTempPath,
              "-y",
            ];
          } else if (isCurrentVideo && isTargetImage) {
            // Extract first frame of video to image
            args = [
              "-ss",
              "0",
              "-i",
              currentPath,
              "-map_metadata",
              "0",
              "-vframes",
              "1",
              conversionTempPath,
              "-y",
            ];
          } else {
            // General conversion (e.g. image-to-image or video-to-video)
            if (targetExtLower === ".mp4") {
              args = [
                "-i",
                currentPath,
                "-map_metadata",
                "0",
                "-c:v",
                "libx264",
                "-r",
                fps.toString(),
                "-pix_fmt",
                "yuv420p",
                "-vf",
                "scale=trunc(iw/2)*2:trunc(ih/2)*2",
                conversionTempPath,
                "-y",
              ];
            } else {
              args = [
                "-i",
                currentPath,
                "-map_metadata",
                "0",
                conversionTempPath,
                "-y",
              ];
            }
          }

          if (args.length > 0) {
            await runFfmpeg(args);
            currentPath = conversionTempPath;
            reportProgress(`Converted to ${targetExtLower}`);
          }
        }

        // Move final file to output directory
        const originalPath = decodeURIComponent(
          inputUrl.replace("media://", ""),
        );
        const ext = path.extname(originalPath);
        const outputName =
          path.basename(originalPath, ext) + "_rendered" + targetExt;

        const targetDir = outputDirectory || defaultOutputDir;
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }

        const finalOutputPath = path.join(targetDir, outputName);
        fs.copyFileSync(currentPath, finalOutputPath);
        reportProgress(`Saved to ${finalOutputPath}`);

        const normalized = finalOutputPath.replace(/\\/g, "/");
        return `media://${normalized}`;
      } catch (err) {
        console.error("Render pipeline error:", err);
        return null;
      }
    },
  );

  // Renderer log forwarding → structured logger with PII redaction
  ipcMain.on(
    "renderer:log",
    (
      _event,
      payload: { level: string; message: string; details?: unknown },
    ) => {
      writeRendererLog(payload.level, payload.message, payload.details);
    },
  );

  // ---------------------------------------------------------------------------
  // Auto-save handlers
  // ---------------------------------------------------------------------------
  const AUTOSAVE_DIR = path.join(os.homedir(), ".moshdither", "autosave");
  const AUTOSAVE_PATH = path.join(AUTOSAVE_DIR, "project.json");
  const CRASH_MARKER_PATH = path.join(
    os.homedir(),
    ".moshdither",
    "crash.marker",
  );

  ipcMain.handle("autosave:write", (event, data: string) => {
    validateIpcSender(event);
    if (!fs.existsSync(AUTOSAVE_DIR)) {
      fs.mkdirSync(AUTOSAVE_DIR, { recursive: true });
    }
    fs.writeFileSync(AUTOSAVE_PATH, data, "utf-8");
    return true;
  });

  ipcMain.handle("autosave:read", (event) => {
    validateIpcSender(event);
    if (fs.existsSync(AUTOSAVE_PATH)) {
      return fs.readFileSync(AUTOSAVE_PATH, "utf-8");
    }
    return null;
  });

  ipcMain.handle("autosave:clear", (event) => {
    validateIpcSender(event);
    if (fs.existsSync(AUTOSAVE_PATH)) {
      fs.unlinkSync(AUTOSAVE_PATH);
    }
    return true;
  });

  // ---------------------------------------------------------------------------
  // Crash recovery handlers
  // ---------------------------------------------------------------------------
  ipcMain.handle("crash:check", () => {
    return fs.existsSync(CRASH_MARKER_PATH);
  });

  ipcMain.handle("crash:dismiss", (event) => {
    validateIpcSender(event);
    if (fs.existsSync(CRASH_MARKER_PATH)) {
      fs.unlinkSync(CRASH_MARKER_PATH);
    }
    return true;
  });

  // Write crash marker on uncaught exception (in addition to crash log)
  process.on("uncaughtException", () => {
    try {
      fs.mkdirSync(path.dirname(CRASH_MARKER_PATH), { recursive: true });
      fs.writeFileSync(CRASH_MARKER_PATH, new Date().toISOString(), "utf-8");
    } catch {
      // Ignore write failures during crash
    }
  });

  // Subresource Integrity: verify preload.js hash before loading it
  try {
    verifyPreloadIntegrity();
  } catch (err) {
    console.error("[SRI] Preload integrity verification failed:", err);
    // In production this should be fatal. For beta, log and continue.
  }

  createWindow();
  if (win) {
    initAutoUpdater(win);
  }

  // ---------------------------------------------------------------------------
  // Platform-specific stubs
  // ---------------------------------------------------------------------------

  // Native menu bar (macOS)
  if (process.platform === "darwin") {
    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: app.name,
        submenu: [{ role: "about" }, { type: "separator" }, { role: "quit" }],
      },
      {
        label: "File",
        submenu: [
          {
            label: "Import Media",
            accelerator: "CmdOrCtrl+O",
            click: () => win?.webContents.send("menu:import"),
          },
          {
            label: "Export",
            accelerator: "CmdOrCtrl+Shift+E",
            click: () => win?.webContents.send("menu:export"),
          },
        ],
      },
      {
        label: "View",
        submenu: [
          { role: "reload" },
          { role: "forceReload" },
          { role: "toggleDevTools" },
          { type: "separator" },
          { role: "resetZoom" },
          { role: "zoomIn" },
          { role: "zoomOut" },
        ],
      },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  }

  // Touch Bar (macOS)
  if (process.platform === "darwin" && win) {
    const { TouchBarButton, TouchBarSpacer } = TouchBar;
    const touchBar = new TouchBar({
      items: [
        new TouchBarButton({
          label: "Play/Pause",
          click: () => win?.webContents.send("touchbar:playPause"),
        }),
        new TouchBarSpacer({ size: "small" }),
        new TouchBarButton({
          label: "Render",
          click: () => win?.webContents.send("touchbar:render"),
        }),
      ],
    });
    win.setTouchBar(touchBar);
  }

  // Jump Lists (Windows)
  if (process.platform === "win32") {
    app.setJumpList([
      {
        type: "custom",
        name: "Recent Projects",
        items: [
          {
            type: "task",
            title: "Open Outputs Folder",
            description: "Open the outputs directory",
            program: process.execPath,
            args: "--open-outputs",
          },
        ],
      },
      {
        type: "recent",
        name: "Recent Files",
      },
    ]);
  }
});
