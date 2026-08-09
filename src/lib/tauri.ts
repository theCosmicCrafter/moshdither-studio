import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { EffectMeta } from "../store";
import type { WatermarkSettings } from "../utils/watermark";
import { getFallbackEffects, isTauriAvailable } from "./browserFallback";

export { convertFileSrc };

// ── SAM3 Segmentation ────────────────────────────────────────

export async function sam3Init(): Promise<string> {
  if (!isTauriAvailable()) return "browser-fallback";
  return invoke("sam3_init");
}

export async function sam3LoadImage(imageB64: string): Promise<{ width: number; height: number }> {
  if (!isTauriAvailable()) return { width: 0, height: 0 };
  return invoke("sam3_load_image", { imageB64 });
}

export async function sam3TextPrompt(
  prompt: string
): Promise<{ count: number; masks: string[]; scores: number[] }> {
  if (!isTauriAvailable()) return { count: 0, masks: [], scores: [] };
  return invoke("sam3_text_prompt", { prompt });
}

export async function sam3PointPrompt(
  points: [number, number][],
  labels?: number[]
): Promise<{ count: number; masks: string[]; scores: number[] }> {
  if (!isTauriAvailable()) return { count: 0, masks: [], scores: [] };
  return invoke("sam3_point_prompt", { points, labels });
}

export async function sam3BoxPrompt(
  boxes: [number, number, number, number][]
): Promise<{ count: number; masks: string[]; scores: number[] }> {
  if (!isTauriAvailable()) return { count: 0, masks: [], scores: [] };
  return invoke("sam3_box_prompt", { boxes });
}

export async function sam3AutoMask(
  gridSize: number = 16,
  iouThreshold: number = 0.7,
  minMaskRegionArea: number = 100
): Promise<{ count: number; masks: string[]; scores: number[] }> {
  if (!isTauriAvailable()) return { count: 0, masks: [], scores: [] };
  return invoke("sam3_auto_mask", {
    gridSize,
    iouThreshold,
    minMaskRegionArea,
  });
}

export async function sam3RefineMask(
  maskB64: string,
  points: [number, number][],
  labels?: number[]
): Promise<{
  status: string;
  count: number;
  masks: string[];
  scores: number[];
}> {
  if (!isTauriAvailable()) return { status: "browser-fallback", count: 0, masks: [], scores: [] };
  return invoke("sam3_refine_mask", { maskB64, points, labels });
}

export async function sam3PostprocessMask(
  maskB64: string,
  grow: number = 0,
  shrink: number = 0,
  feather: number = 0,
  fillHoles: boolean = false
): Promise<string> {
  if (!isTauriAvailable()) return maskB64;
  return invoke("sam3_postprocess_mask", {
    maskB64,
    grow,
    shrink,
    feather,
    fillHoles,
  });
}

export async function sam3Clear(): Promise<string> {
  if (!isTauriAvailable()) return "ok";
  return invoke("sam3_clear");
}

export async function sam3VideoPredictor(
  frames: string[],
  prompt?: string
): Promise<{
  status: string;
  frame_masks: string[][];
  frame_scores: number[][];
}> {
  if (!isTauriAvailable()) return { status: "browser-fallback", frame_masks: [], frame_scores: [] };
  return invoke("sam3_video_predictor", { frames, prompt });
}

export async function sam3Shutdown(): Promise<string> {
  if (!isTauriAvailable()) return "ok";
  return invoke("sam3_shutdown");
}

// ── Media / Effects ──────────────────────────────────────────

export async function loadMediaFile(): Promise<string | null> {
  if (!isTauriAvailable()) {
    // Browser fallback: use a hidden file input
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*,video/*";
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        const dataUrl = await new Promise<string>((res, rej) => {
          const reader = new FileReader();
          reader.onload = () => res(reader.result as string);
          reader.onerror = () => rej(reader.error);
          reader.readAsDataURL(file);
        });
        await loadMediaFromBase64(dataUrl);
        resolve(file.name);
      };
      input.click();
    });
  }
  const path = await open({
    multiple: false,
    filters: [
      {
        name: "All Media",
        extensions: [
          "png",
          "jpg",
          "jpeg",
          "gif",
          "bmp",
          "tiff",
          "webp",
          "avif",
          "ico",
          "tga",
          "dds",
          "qoi",
          "pnm",
          "mp4",
          "avi",
          "mov",
          "mkv",
          "webm",
          "m4v",
          "flv",
          "wmv",
        ],
      },
      {
        name: "Images",
        extensions: [
          "png",
          "jpg",
          "jpeg",
          "gif",
          "bmp",
          "tiff",
          "webp",
          "avif",
          "ico",
          "tga",
          "dds",
          "qoi",
          "pnm",
        ],
      },
      { name: "Videos", extensions: ["mp4", "avi", "mov", "mkv", "webm", "m4v", "flv", "wmv"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });
  if (path && typeof path === "string") {
    await invoke("load_media", { path });
    return path;
  }
  return null;
}

export async function loadMediaFromPath(path: string): Promise<void> {
  if (!isTauriAvailable()) return;
  await invoke("load_media", { path });
}

// Browser-mode media cache: stores the last loaded data URL so getMediaInfo/getFrameData can return it
let browserMedia: { dataUrl: string; width: number; height: number } | null = null;

export async function loadMediaFromBase64(dataUrl: string): Promise<void> {
  if (!isTauriAvailable()) {
    // Load image to get dimensions
    const img = new Image();
    img.src = dataUrl;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });
    browserMedia = { dataUrl, width: img.naturalWidth, height: img.naturalHeight };
    return;
  }
  await invoke("load_media_from_base64", { dataUrl });
}

const CATEGORY_OVERRIDE: Record<string, string> = {
  "overlay.": "overlay",
  "composite.": "composite",
};

export async function listEffects(): Promise<EffectMeta[]> {
  if (!isTauriAvailable()) {
    return getFallbackEffects();
  }
  const rustEffects = await invoke<EffectMeta[]>("list_effects");
  // Fix categories for effects that Rust mis-categorizes (overlay/composite use Color in Rust enum)
  for (const eff of rustEffects) {
    for (const [prefix, cat] of Object.entries(CATEGORY_OVERRIDE)) {
      if (eff.id.startsWith(prefix)) {
        eff.category = cat;
        break;
      }
    }
  }
  // Merge in WebGL-only fallback effects (e.g. overlay shaders) that don't have Rust implementations
  const fallback = getFallbackEffects();
  const rustIds = new Set(rustEffects.map((e) => e.id));
  const webglOnly = fallback.filter((e) => !rustIds.has(e.id));
  return [...rustEffects, ...webglOnly];
}

export async function listEffectsByCategory(category: string): Promise<EffectMeta[]> {
  return invoke("list_effects_by_category", { category });
}

export async function getMediaInfo(): Promise<{ width: number; height: number; loaded: boolean }> {
  if (!isTauriAvailable()) {
    if (!browserMedia) return { width: 0, height: 0, loaded: false };
    return { width: browserMedia.width, height: browserMedia.height, loaded: true };
  }
  return invoke("get_media_info");
}

export async function getMediaMetadata(path: string): Promise<Record<string, unknown>> {
  return invoke("get_media_metadata", { path });
}

/**
 * Extract the audio track from a loaded video to a temp WAV file.
 *
 * Returns the absolute path to the extracted WAV, or throws if the video
 * has no audio stream. Used by the auto-audio-extraction path so
 * audio-reactive effects work when a user loads a video with built-in
 * audio (no manual audio load required). Mirrors the TouchDesigner
 * `Audio Movie CHOP` pattern.
 *
 * @param videoPath Absolute path to the source video
 * @param maxDurationSecs Optional trim limit in seconds (matches export trim)
 */
export async function extractAudioFromVideo(
  videoPath: string,
  maxDurationSecs?: number
): Promise<string> {
  return invoke("extract_audio_from_video", {
    videoPath,
    maxDurationSecs: maxDurationSecs ?? null,
  });
}

export async function getFrameData(): Promise<string> {
  if (!isTauriAvailable()) {
    if (!browserMedia) throw new Error("No media loaded");
    return browserMedia.dataUrl;
  }
  return invoke("get_frame_data");
}

export async function applyEffectStack(
  stack: {
    effect_id: string;
    params: Record<string, unknown>;
    mask_b64?: string | null;
    mask_mode?: string;
  }[],
  maskB64?: string | null,
  previewScale?: number
): Promise<string> {
  return invoke("apply_effect_stack", { stack, maskB64, previewScale });
}

export async function applyEffect(
  effectId: string,
  params: Record<string, unknown>,
  maskB64?: string | null
): Promise<string> {
  return invoke("apply_effect", { effectId, params, maskB64 });
}

export async function saveMedia(): Promise<void> {
  const path = await save({
    filters: [
      { name: "PNG", extensions: ["png"] },
      { name: "JPEG", extensions: ["jpg", "jpeg"] },
      { name: "BMP", extensions: ["bmp"] },
      { name: "TIFF", extensions: ["tiff", "tif"] },
    ],
  });
  if (path && typeof path === "string") {
    const ext = path.split(".").pop()?.toLowerCase() || "png";
    const format = ["png", "jpg", "jpeg", "bmp", "tiff", "tif"].includes(ext) ? ext : "png";
    await invoke("save_media", { path, format, quality: 90 });
  }
}

export async function exportVideo(
  sourcePath: string,
  stack: {
    effect_id: string;
    params: Record<string, unknown>;
    mask_b64?: string | null;
    mask_mode?: string;
  }[],
  options: {
    maskB64?: string | null;
    codec?: string;
    fps?: number;
    width?: number;
    height?: number;
    audioBakeJson?: string | null;
    watermark?: WatermarkSettings | null;
    trimStart?: number;
    trimEnd?: number;
    format?: string;
    quality?: string;
    includeAudio?: boolean;
    /** Max dimension (px) for internal decode + effect processing.
     * `undefined` = auto (backend picks largest resolution that fits
     * memory budget). `number` = explicit cap (e.g. 1080 for 1080p).
     * Final encode still scales to `width`/`height`. */
    processingScale?: number;
  } = {}
): Promise<string> {
  const path = await save({
    filters: [
      { name: "MP4", extensions: ["mp4"] },
      { name: "MOV", extensions: ["mov"] },
      { name: "MKV", extensions: ["mkv"] },
    ],
  });
  if (!path || typeof path !== "string") {
    throw new Error("Export cancelled");
  }
  return invoke("export_video", {
    sourcePath,
    outputPath: path,
    stack,
    maskB64: options.maskB64 ?? null,
    codec: options.codec ?? null,
    fps: options.fps ?? null,
    width: options.width ?? null,
    height: options.height ?? null,
    audioBakeJson: options.audioBakeJson ?? null,
    watermark: options.watermark ?? null,
    trimStart: options.trimStart ?? null,
    trimEnd: options.trimEnd ?? null,
    format: options.format ?? null,
    quality: options.quality ?? null,
    includeAudio: options.includeAudio ?? null,
    processingScale: options.processingScale ?? null,
  });
}

export async function applyFfglitch(
  inputPath: string,
  mode: string,
  params: Record<string, unknown> = {}
): Promise<string> {
  const path = await save({
    filters: [
      { name: "MP4", extensions: ["mp4"] },
      { name: "AVI", extensions: ["avi"] },
    ],
  });
  if (!path || typeof path !== "string") {
    throw new Error("Export cancelled");
  }
  return invoke("apply_ffglitch", {
    inputPath,
    outputPath: path,
    mode,
    params,
  });
}

/** Request cancellation of an in-progress export (real export or FFglitch --
 *  both check the same server-side AtomicBool). Without this, the Cancel
 *  button only reset local UI state (progress bar, running flag) while the
 *  actual ffmpeg/mosh_cli.py subprocess kept running untouched in the
 *  background -- purely cosmetic cancellation. */
export async function cancelExport(): Promise<void> {
  return invoke("cancel_export");
}

// ── Effect Verification ──────────────────────────────────────

export interface VerificationChecks {
  no_crash: boolean;
  non_empty_output: boolean;
  animates: boolean;
  mask_inside_correct: boolean;
  mask_outside_correct: boolean;
}

export interface EffectVerificationResult {
  effect_id: string;
  effect_name: string;
  category: string;
  checks: VerificationChecks;
  overall_pass: boolean;
  error_message: string | null;
  duration_ms: number;
}

export interface VerificationReport {
  total_effects: number;
  passed: number;
  failed: number;
  results: EffectVerificationResult[];
  summary: string;
  timestamp: string;
}

export async function verifyEffects(): Promise<VerificationReport> {
  return invoke("verify_effects");
}

// ── Functional Tests ─────────────────────────────────────────

export interface FunctionTestResult {
  test_name: string;
  category: string;
  passed: boolean;
  error_message: string | null;
  duration_ms: number;
  details: string | null;
}

export interface FunctionTestReport {
  total_tests: number;
  passed: number;
  failed: number;
  results: FunctionTestResult[];
  summary: string;
  timestamp: string;
}

export async function testAllFunctions(): Promise<FunctionTestReport> {
  return invoke("test_all_functions");
}

export interface EnvStatus {
  mode: string;
  python_ok: boolean;
  venv_ok: boolean;
  pip_ok: boolean;
  ffmpeg_ok: boolean;
  ffprobe_ok: boolean;
  ffglitch_ok: boolean;
  python_path?: string;
  venv_dir?: string;
  ffmpeg_path?: string;
  ffprobe_path?: string;
  ffgac_path?: string;
  ffedit_path?: string;
  mosh_cli_path?: string;
}

export async function getEnvironmentStatus(): Promise<EnvStatus> {
  return invoke("get_environment_status");
}

export async function installLocalEnvironment(): Promise<EnvStatus> {
  return invoke("install_local_environment");
}

// ── Proxy Media ──────────────────────────────────────────────

export async function generateProxy(
  sourcePath: string,
  maxWidth: number = 1280,
  crf: number = 28
): Promise<string> {
  return invoke("generate_proxy_command", { sourcePath, maxWidth, crf });
}

/**
 * Absolute path to the preset library file, for showing the user where their
 * presets live. Returns null outside Tauri, where there is no filesystem.
 */
export async function getPresetsPath(): Promise<string | null> {
  if (!isTauriAvailable()) return null;
  return invoke<string>("get_presets_path");
}

/**
 * Read the preset library JSON. Empty string means "no library file yet",
 * which is the normal first-run state rather than an error.
 */
export async function loadPresetsFile(): Promise<string> {
  if (!isTauriAvailable()) return "";
  return invoke<string>("load_presets");
}

/** Write the preset library JSON. The Rust side validates and writes atomically. */
export async function savePresetsFile(json: string): Promise<void> {
  if (!isTauriAvailable()) return;
  await invoke("save_presets", { json });
}

// ── Window Edge Snapping & AppBar Docking ─────────────────────

export interface MonitorInfo {
  x: number;
  y: number;
  width: number;
  height: number;
  scaleFactor: number;
}

/** Returns the current monitor's position and size for edge proximity calculations. */
export async function getMonitorInfo(): Promise<MonitorInfo | null> {
  if (!isTauriAvailable()) return null;
  return invoke<MonitorInfo>("get_monitor_info");
}

/** Snaps the window to the specified display edge (`left`, `right`, `top`, `bottom`). */
export async function snapToEdge(edge: string): Promise<void> {
  if (!isTauriAvailable()) return;
  await invoke("snap_to_edge", { edge });
}

/**
 * Registers the window as a native Win32 AppBar, reserving screen space
 * on the specified edge. Windows-only — errors on other platforms.
 */
export async function dockWindowAppbar(edge: string, size: number): Promise<void> {
  if (!isTauriAvailable()) return;
  await invoke("dock_window_appbar", { edge, size });
}

/** Unregisters the AppBar, releasing the reserved screen space. */
export async function undockWindowAppbar(): Promise<void> {
  if (!isTauriAvailable()) return;
  await invoke("undock_window_appbar");
}
