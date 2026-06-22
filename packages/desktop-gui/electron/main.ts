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
  shell,
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
import {
  getCachedFrame,
  setCachedFrame,
  clearFrameCache,
  getCacheStats,
} from "./frameCacheMain";
import {
  buildWatermarkArgs,
  type WatermarkSettings,
} from "../src/utils/watermark";
import getSystemFonts from "get-system-fonts";

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
  const isMac = process.platform === "darwin";
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    icon: path.join(process.env.VITE_PUBLIC || "", "electron-vite.svg"),
    // macOS: frameless with hidden title bar for traffic-light buttons
    // Windows/Linux: keep native frame so the menu bar renders correctly
    frame: !isMac,
    titleBarStyle: isMac ? "hidden" : undefined,
    trafficLightPosition: isMac ? { x: 16, y: 14 } : undefined,
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

// ---------------------------------------------------------------------------
// Window control IPC handlers (for frameless custom title bar)
// ---------------------------------------------------------------------------
ipcMain.handle("window:minimize", () => {
  win?.minimize();
});
ipcMain.handle("window:maximize", () => {
  if (win?.isMaximized()) {
    win.unmaximize();
  } else {
    win?.maximize();
  }
});
ipcMain.handle("window:close", () => {
  win?.close();
});
ipcMain.handle("window:isMaximized", () => {
  return win?.isMaximized() ?? false;
});

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
  // SECURITY: Instead of returning the raw secret, we return a short-lived
  // JWT signed with RPC_TOKEN as the HMAC secret. This limits exposure
  // if a compromised renderer exfiltrates the credential.
  function createRpcSessionToken(): string {
    const header = Buffer.from(
      JSON.stringify({ alg: "HS256", typ: "JWT" }),
    ).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(
      JSON.stringify({ iat: now, exp: now + 300, sub: "rpc-session" }),
    ).toString("base64url");
    const signature = nodeCrypto
      .createHmac("sha256", RPC_TOKEN)
      .update(`${header}.${payload}`)
      .digest("base64url");
    return `${header}.${payload}.${signature}`;
  }

  ipcMain.handle("get-rpc-token", (event) => {
    validateIpcSender(event);
    return createRpcSessionToken();
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

  // Cloud sync handlers
  ipcMain.handle("dialog:selectSyncFolder", async (event) => {
    validateIpcSender(event);
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
    });
    if (!canceled && filePaths.length > 0) {
      return filePaths[0].replace(/\\/g, "/");
    }
    return null;
  });

  ipcMain.handle(
    "sync:write-project",
    async (event, folderPath: string, projectId: string, json: string) => {
      validateIpcSender(event);
      try {
        const filePath = path.join(folderPath, `${projectId}.moshdither`);
        fs.writeFileSync(filePath, json, "utf-8");
        return true;
      } catch {
        return false;
      }
    },
  );

  ipcMain.handle("sync:list-projects", async (event, folderPath: string) => {
    validateIpcSender(event);
    try {
      const entries = fs.readdirSync(folderPath);
      return entries
        .filter((f) => f.endsWith(".moshdither"))
        .map((f) => {
          const filePath = path.join(folderPath, f);
          const stats = fs.statSync(filePath);
          const content = fs.readFileSync(filePath, "utf-8");
          let name = f.replace(".moshdither", "");
          try {
            const bundle = JSON.parse(content);
            name = bundle.project?.name || name;
          } catch {
            /* ignore parse errors for malformed bundles */
          }
          return {
            id: f.replace(".moshdither", ""),
            name,
            syncedAt: stats.mtime.toISOString(),
          };
        });
    } catch {
      return [];
    }
  });

  // Git LFS helpers
  ipcMain.handle("git:lfs-status", async (event) => {
    validateIpcSender(event);
    try {
      const { execSync } = await import("node:child_process");
      execSync("git lfs version", { stdio: "ignore" });
      const tracked = execSync("git lfs track", {
        encoding: "utf-8",
        cwd: projectRoot,
      }).split("\n");
      return {
        installed: true,
        initialized: true,
        trackedPatterns: tracked.filter(Boolean),
      };
    } catch {
      return { installed: false, initialized: false, trackedPatterns: [] };
    }
  });

  ipcMain.handle("git:init-lfs", async (event, projectPath: string) => {
    validateIpcSender(event);
    try {
      const { execSync } = await import("node:child_process");
      execSync("git init", { cwd: projectPath, stdio: "ignore" });
      execSync("git lfs install", { cwd: projectPath, stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle(
    "git:write-attributes",
    async (event, projectPath: string, content: string) => {
      validateIpcSender(event);
      try {
        const attributesPath = path.join(projectPath, ".gitattributes");
        fs.writeFileSync(attributesPath, content, "utf-8");
        return true;
      } catch {
        return false;
      }
    },
  );

  // ---------------------------------------------------------------------------
  // SAM 3 / AI Masking Model — runs in main process (Node.js has fs access)
  // ---------------------------------------------------------------------------
  // Minimal structural types for the dynamically imported transformers.js
  // objects (the library's own types are too loose to use directly here).
  interface SamTensor {
    dims: number[];
    data: Float32Array | Uint8Array;
    [index: number]: SamTensor;
  }
  interface SamProcessorLike {
    (
      image: unknown,
      options: { input_points: number[][][][]; input_labels: number[][][] },
    ): Promise<{
      original_sizes: unknown;
      reshaped_input_sizes: unknown;
    }>;
    post_process_masks(
      predMasks: unknown,
      originalSizes: unknown,
      reshapedSizes: unknown,
    ): Promise<SamTensor[]>;
  }
  type SamModelLike = (inputs: unknown) => Promise<{
    pred_masks: unknown;
    iou_scores: SamTensor;
  }>;

  let samModel: unknown | null = null;
  let samProcessor: unknown | null = null;
  let samLoadPromise: Promise<void> | null = null;

  const SAM_CACHE_DIR = path.join(app.getPath("userData"), "sam3-cache");
  if (!fs.existsSync(SAM_CACHE_DIR)) {
    fs.mkdirSync(SAM_CACHE_DIR, { recursive: true });
  }

  async function loadSAM3Model(sender?: Electron.WebContents): Promise<void> {
    if (samModel && samProcessor) return;
    if (samLoadPromise) {
      await samLoadPromise;
      return;
    }

    samLoadPromise = (async () => {
      try {
        // Dynamic import to avoid loading Transformers.js until needed
        const transformers = await import("@huggingface/transformers");
        const { Sam3TrackerModel, AutoProcessor, env } = transformers;

        // Use filesystem cache only (main process has Node.js fs)
        env.useBrowserCache = false;
        env.useFSCache = true;
        env.cacheDir = SAM_CACHE_DIR;

        const MODEL_ID = "onnx-community/sam3-tracker-ONNX";

        // Forward real download/load progress to the renderer
        const progress_callback = (info: {
          status: string;
          file?: string;
          progress?: number;
        }) => {
          if (sender && !sender.isDestroyed()) {
            sender.send("sam3:progress", {
              status: info.status,
              file: info.file,
              progress: info.progress,
            });
          }
        };

        console.log("[Main] Loading SAM 3 processor...");
        samProcessor = await AutoProcessor.from_pretrained(MODEL_ID, {
          cache_dir: SAM_CACHE_DIR,
          progress_callback,
        });
        console.log("[Main] SAM 3 processor loaded");

        console.log("[Main] Loading SAM 3 model...");
        samModel = await Sam3TrackerModel.from_pretrained(MODEL_ID, {
          cache_dir: SAM_CACHE_DIR,
          dtype: "fp16",
          progress_callback,
        });
        console.log("[Main] SAM 3 model loaded");
      } catch (err) {
        samLoadPromise = null;
        console.error("[Main] SAM 3 load failed:", err);
        throw err;
      }
    })();

    await samLoadPromise;
  }

  ipcMain.handle("sam3:load-model", async (event) => {
    validateIpcSender(event);
    try {
      await loadSAM3Model(event.sender);
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  });

  ipcMain.handle("sam3:segment", async (event, payload) => {
    validateIpcSender(event);
    const { imagePath, point } = payload as {
      imagePath: string;
      point: { x: number; y: number };
    };

    try {
      await loadSAM3Model(event.sender);
      if (!samModel || !samProcessor) {
        throw new Error("Model not loaded");
      }

      // Resolve media:// URL to a validated real file path
      const filePath = imagePath.startsWith("media://")
        ? getPathFromMediaUrl(imagePath)
        : imagePath;
      if (!filePath || !fs.existsSync(filePath)) {
        throw new Error(`Image file not found: ${imagePath}`);
      }

      // Load image directly from disk using Transformers.js RawImage
      const { RawImage } = await import("@huggingface/transformers");
      const rawImage = await RawImage.read(filePath);

      // Run inference
      const processor = samProcessor as SamProcessorLike;
      const model = samModel as SamModelLike;

      // Click point arrives normalized (0..1); scale to native image pixels
      const px = Math.round(point.x * rawImage.width);
      const py = Math.round(point.y * rawImage.height);
      const input_points = [[[[px, py]]]];
      const input_labels = [[[1]]]; // 1 = foreground

      const inputs = await processor(rawImage, {
        input_points,
        input_labels,
      });

      const outputs = await model(inputs);

      const masks = await processor.post_process_masks(
        outputs.pred_masks,
        inputs.original_sizes,
        inputs.reshaped_input_sizes,
      );

      // masks[0][0] has dims [3, H, W] — three candidate masks.
      // Pick the one with the highest IoU score.
      const candidates = masks[0][0]; // [3, H, W]
      const scores = outputs.iou_scores.data as Float32Array; // [3]
      let bestIdx = 0;
      for (let i = 1; i < scores.length; i++) {
        if (scores[i] > scores[bestIdx]) bestIdx = i;
      }
      const maskTensor = candidates[bestIdx]; // [H, W]
      const [h, w] = maskTensor.dims;
      const data = maskTensor.data as Uint8Array;

      // Return raw mask bytes (0 or 255) as base64
      const maskBytes = new Uint8Array(h * w);
      for (let i = 0; i < h * w; i++) {
        maskBytes[i] = data[i] ? 255 : 0;
      }
      const maskBase64 = Buffer.from(maskBytes).toString("base64");

      return {
        ok: true,
        maskBase64,
        width: w,
        height: h,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[Main] SAM 3 segmentation failed:", msg);
      return { ok: false, error: msg };
    }
  });

  // System font discovery for watermark text rendering
  ipcMain.handle("fonts:list", async (event) => {
    validateIpcSender(event);
    try {
      const fonts = await getSystemFonts({
        extensions: ["ttf", "otf", "ttc"],
      });
      // Return deduplicated, sorted list of font paths
      const unique = Array.from(new Set(fonts)).sort();
      return unique;
    } catch (err) {
      console.error("Font discovery error:", err);
      return [];
    }
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

  ipcMain.handle("dialog:openLut", async (event) => {
    validateIpcSender(event);
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [
        {
          name: "LUT Files",
          extensions: ["cube", "3dl"],
        },
      ],
    });
    if (!canceled && filePaths.length > 0) {
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
      proc.stderr.on("data", () => {
        /* stderr logging for ffmpeg proxy generation */
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

  // Frame cache IPC handlers (moved from renderer to main process)
  ipcMain.handle("cache:get-frame", async (event, key: string) => {
    validateIpcSender(event);
    return getCachedFrame(key);
  });

  ipcMain.handle(
    "cache:set-frame",
    async (event, key: string, data: Uint8Array) => {
      validateIpcSender(event);
      setCachedFrame(key, Buffer.from(data));
      return true;
    },
  );

  ipcMain.handle("cache:clear", async (event) => {
    validateIpcSender(event);
    clearFrameCache();
    return true;
  });

  ipcMain.handle("cache:stats", async (event) => {
    validateIpcSender(event);
    return getCacheStats();
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
      watermarkSettings?: WatermarkSettings,
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
          "lut",
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
              angle: fx.params.angle,
              dotGain: fx.params.dotGain,
              minDotSize: fx.params.minDotSize,
              maxDotSize: fx.params.maxDotSize,
              shape: fx.params.shape,
              sharpness: fx.params.sharpness,
              wavelet: fx.params.wavelet,
              subbandQuant: fx.params.subbandQuant,
              varThreshold: fx.params.varThreshold,
              windowRadius: fx.params.windowRadius,
              lumFactor: fx.params.lumFactor,
              colFactor: fx.params.colFactor,
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
              angle: fx.params.angleK || 45.0,
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
            const { args: watermarkedArgs } = buildWatermarkArgs(
              args,
              watermarkSettings || {
                enabled: false,
                type: "text",
                text: "",
                imagePath: null,
                position: "bottom-right",
                fontSize: 24,
                fontPath: null,
                color: "white",
                opacity: 0.7,
                scale: 20,
                rotation: 0,
              },
            );
            await runFfmpeg(watermarkedArgs);
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

  // ---------------------------------------------------------------------------
  // Native application menu (all platforms)
  // ---------------------------------------------------------------------------
  const isMac = process.platform === "darwin";
  const template: Electron.MenuItemConstructorOptions[] = [
    // macOS App menu
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ] as Electron.MenuItemConstructorOptions[]
      : []),
    {
      label: "File",
      submenu: [
        {
          label: "Open Media...",
          accelerator: "CmdOrCtrl+O",
          click: () => win?.webContents.send("menu:import"),
        },
        {
          label: "Open Recent",
          submenu: [{ label: "Clear Recent", enabled: false }],
        },
        { type: "separator" },
        {
          label: "Export...",
          accelerator: "CmdOrCtrl+Shift+E",
          click: () => win?.webContents.send("menu:export"),
        },
        { type: "separator" },
        {
          label: "Download AI Masking Model",
          accelerator: "CmdOrCtrl+Shift+M",
          click: () => win?.webContents.send("menu:preload-model"),
        },
        { type: "separator" },
        ...(isMac
          ? []
          : ([{ role: "quit" }] as Electron.MenuItemConstructorOptions[])),
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        ...(isMac
          ? [
              { role: "pasteAndMatchStyle" },
              { role: "delete" },
              { role: "selectAll" },
              { type: "separator" },
              {
                label: "Speech",
                submenu: [{ role: "startSpeaking" }, { role: "stopSpeaking" }],
              },
            ]
          : [
              { role: "delete" },
              { type: "separator" },
              { role: "selectAll" },
            ]) as Electron.MenuItemConstructorOptions[],
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
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    // Window menu
    ...(isMac
      ? [
          {
            label: "Window",
            submenu: [
              { role: "minimize" },
              { role: "zoom" },
              { type: "separator" },
              { role: "front" },
              { type: "separator" },
              { role: "window" },
            ],
          },
        ]
      : [
          {
            label: "Window",
            submenu: [{ role: "minimize" }, { role: "close" }],
          },
        ]) as Electron.MenuItemConstructorOptions[],
    {
      label: "Help",
      submenu: [
        {
          label: "Keyboard Shortcuts",
          accelerator: "CmdOrCtrl+K",
          click: () => win?.webContents.send("menu:shortcuts"),
        },
        {
          label: "Documentation",
          click: () =>
            shell.openExternal("https://github.com/richk/MoshDither-Studio"),
        },
        { type: "separator" },
        {
          label: "Toggle Developer Tools",
          accelerator: "F12",
          click: () => win?.webContents.toggleDevTools(),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

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
