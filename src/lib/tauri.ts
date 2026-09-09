import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { EffectMeta } from "../store";
import type { WatermarkSettings } from "../utils/watermark";
import { getFallbackEffects, isTauriAvailable } from "./browserFallback";

export { convertFileSrc };

// ── SAM3 Segmentation ────────────────────────────────────────

export interface Sam3AddonStatus {
  ready: boolean;
  sidecar_installed: boolean;
  sidecar_path: string | null;
  sidecar_bytes: number | null;
  checkpoint_installed: boolean;
  checkpoint_path: string | null;
  checkpoint_bytes: number | null;
  /** Set when a developer interpreter supersedes the add-on. */
  dev_override: string | null;
}

const ADDON_UNAVAILABLE: Sam3AddonStatus = {
  ready: false,
  sidecar_installed: false,
  sidecar_path: null,
  sidecar_bytes: null,
  checkpoint_installed: false,
  checkpoint_path: null,
  checkpoint_bytes: null,
  dev_override: null,
};

export async function sam3AddonStatus(): Promise<Sam3AddonStatus> {
  if (!isTauriAvailable()) return ADDON_UNAVAILABLE;
  return invoke("sam3_addon_status");
}

export async function sam3AddonInstall(): Promise<Sam3AddonStatus> {
  // No browser fallback: there is nothing meaningful to install into, and a
  // silent no-op here would look like a successful install that did nothing.
  if (!isTauriAvailable()) {
    throw new Error("The SAM3 add-on can only be installed from the desktop app.");
  }
  return invoke("sam3_addon_install");
}

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
        // NOTE: avif and dds are deliberately absent. The `image` crate in
        // this build has no DDS decoder at all, and its AVIF decoder needs
        // the `avif-native` feature (dav1d, a C dependency). Offering an
        // extension we cannot open only fails after the user picks a file.
        // Pinned by every_offered_still_format_actually_decodes.
        extensions: [
          "png",
          "jpg",
          "jpeg",
          "gif",
          "bmp",
          "tiff",
          "webp",
          "ico",
          "tga",
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
          "ico",
          "tga",
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

/**
 * Turn a currently-loaded still image into a real multi-frame video by
 * looping its single frame for `durationSecs` at `fps` (a classic
 * freeze-frame "image to video" operation). This is what lets the
 * video-only effect family (frame_reverse, shuffle, motion_transfer, ...)
 * operate on what started out as a still image -- those effects read/write
 * multiple frames and are meaningless applied to a single still.
 *
 * Returns the absolute path to the generated `.mp4`. The caller is
 * responsible for loading it back in via `loadMediaFromPath` (the normal
 * video-loading path) to make it the active session.
 */
export async function animateStillAsVideo(
  imagePath: string,
  durationSecs: number = 5,
  fps: number = 30
): Promise<string> {
  return invoke("animate_still_as_video", { imagePath, durationSecs, fps });
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

export interface MediaMetadata extends Record<string, unknown> {
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  fps?: number | null;
  codec?: string | null;
  bitrate?: number | null;
}

export async function getMediaInfo(): Promise<{ width: number; height: number; loaded: boolean }> {
  if (!isTauriAvailable()) {
    if (!browserMedia) return { width: 0, height: 0, loaded: false };
    return { width: browserMedia.width, height: browserMedia.height, loaded: true };
  }
  return invoke("get_media_info");
}

/**
 * Full metadata for a media file, including its real DURATION.
 *
 * The duration was fetched here all along and only ever used for the metadata
 * DISPLAY -- nothing fed it back to the timeline. So `duration` sat at its
 * store default of 10 and every video, however long, scrubbed and EXPORTED as
 * ten seconds. AppLayout's refreshPreview now sets it; that is the single
 * funnel every "open a file" path goes through.
 */
export async function getMediaMetadata(path: string): Promise<MediaMetadata> {
  if (!isTauriAvailable()) return {};
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

/** Applies the effect stack to the currently loaded frame and saves the
 * result to disk as a still image (png/jpg/bmp/tiff), via a native save
 * dialog. Unlike exportVideo, this never duplicates the frame into a
 * multi-frame clip -- the output is exactly one image. */
export async function saveImage(
  stack: {
    effect_id: string;
    params: Record<string, unknown>;
    mask_b64?: string | null;
    mask_mode?: string;
  }[],
  maskB64?: string | null,
  format: "png" | "jpg" | "bmp" | "tiff" = "png",
  quality?: number
): Promise<string> {
  const path = await save({
    filters: [
      { name: "PNG", extensions: ["png"] },
      { name: "JPEG", extensions: ["jpg", "jpeg"] },
      { name: "BMP", extensions: ["bmp"] },
      { name: "TIFF", extensions: ["tiff", "tif"] },
    ],
    defaultPath: `image.${format}`,
  });
  if (!path || typeof path !== "string") {
    throw new Error("Save cancelled");
  }
  return invoke("save_processed_image", {
    stack,
    maskB64: maskB64 ?? null,
    path,
    format,
    quality: quality ?? null,
  });
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
    /** Skip the Save dialog and write here instead. Used by the two-stage
     *  FFglitch export, which prompts once and then renders to an intermediate
     *  file before datamoshing it. */
    outputPath?: string;
  } = {}
): Promise<string> {
  const path = options.outputPath ?? (await save({ filters: saveFiltersFor(options.format) }));
  if (!path || typeof path !== "string") {
    throw new Error("Export cancelled");
  }
  // The extension the user actually chose wins over the panel's chip: the save
  // dialog is where people expect to pick a format, and a mismatch would encode
  // one format under another's file name.
  const resolvedFormat = options.outputPath
    ? options.format ?? null
    : formatFromPath(path, options.format) ?? null;
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
    format: resolvedFormat,
    quality: options.quality ?? null,
    includeAudio: options.includeAudio ?? null,
    processingScale: options.processingScale ?? null,
  });
}

/**
 * Run a bitstream datamosh over `inputPath`.
 *
 * `outputPath` may be supplied by callers that have already asked the user
 * where the result should go -- the two-stage export (render the effect stack,
 * then datamosh that render) prompts once and then drives both steps, and must
 * not raise a second Save dialog part-way through.
 */
/** Every export format, in the order the Save dialog should list them. */
const EXPORT_FILTERS: { format: string; name: string; extensions: string[] }[] = [
  { format: "mp4", name: "MP4", extensions: ["mp4"] },
  { format: "mov", name: "QuickTime MOV", extensions: ["mov"] },
  { format: "mkv", name: "Matroska MKV", extensions: ["mkv"] },
  { format: "webm", name: "WebM", extensions: ["webm"] },
  { format: "avi", name: "AVI", extensions: ["avi"] },
  { format: "gif", name: "Animated GIF", extensions: ["gif"] },
  { format: "apng", name: "Animated PNG", extensions: ["apng", "png"] },
  { format: "webp", name: "Animated WebP", extensions: ["webp"] },
  // Sequences write many files; the chosen name seeds the numbered pattern.
  { format: "png_seq", name: "PNG sequence", extensions: ["png"] },
  { format: "jpg_seq", name: "JPEG sequence", extensions: ["jpg", "jpeg"] },
  { format: "webp_seq", name: "WebP sequence", extensions: ["webp"] },
  { format: "tiff_seq", name: "TIFF sequence", extensions: ["tif", "tiff"] },
  { format: "bmp_seq", name: "BMP sequence", extensions: ["bmp"] },
];

/**
 * Save-dialog filters, listing EVERY format with the selected one first.
 *
 * This used to return only the selected format's filter, which meant the dialog
 * showed MP4/MOV/MKV unless the user had already found and clicked the right
 * chip in the export panel -- so the formats looked missing, and the only way
 * to discover them was to notice a row of chips elsewhere in the UI. Every
 * other application lets you choose the format in the save dialog itself, and
 * now so does this one: `formatFromPath` reads the chosen extension back.
 */
export function saveFiltersFor(format?: string | null): { name: string; extensions: string[] }[] {
  const selected = EXPORT_FILTERS.filter((f) => f.format === format);
  const rest = EXPORT_FILTERS.filter((f) => f.format !== format);
  return [...selected, ...rest].map(({ name, extensions }) => ({ name, extensions }));
}

/**
 * How an extension written by more than one format resolves when the current
 * selection does not already claim it. Explicit so the answer does not depend
 * on the order the dialog happens to list filters in.
 */
const AMBIGUOUS_EXTENSION_DEFAULT: Record<string, string> = {
  // APNG has its own .apng, so a bare .png reads as a sequence.
  png: "png_seq",
  // Animated WebP is one file, which is the likelier reading of a lone .webp.
  webp: "webp",
};

/**
 * The format implied by a chosen filename, or `fallback` when the extension
 * does not decide it.
 *
 * The save dialog is the surface people expect to choose a format on, so the
 * extension they picked wins over the chip. Two extensions are genuinely
 * ambiguous -- `.png` is both a PNG sequence and an APNG, `.webp` is both an
 * animated WebP and a WebP sequence -- so when the current selection already
 * uses that extension it is kept, and otherwise the single-file reading wins
 * for `.webp` and the sequence reading for `.png` (APNG has its own `.apng`).
 */
export function formatFromPath(path: string, fallback?: string | null): string | undefined {
  const ext = path.split(".").pop()?.toLowerCase();
  if (!ext) return fallback ?? undefined;

  const candidates = EXPORT_FILTERS.filter((f) => f.extensions.includes(ext));
  if (candidates.length === 0) return fallback ?? undefined;
  // The current selection already writes this extension, so it is what the
  // user meant -- picking APNG and naming the file .png should stay APNG.
  if (candidates.some((c) => c.format === fallback)) return fallback ?? undefined;
  // Otherwise resolve the genuinely ambiguous extensions explicitly, rather
  // than letting the dialog's display order silently decide.
  return AMBIGUOUS_EXTENSION_DEFAULT[ext] ?? candidates[0].format;
}

/**
 * Mosh a couple of seconds of the source so a mode can be SEEN before committing.
 *
 * FFglitch corrupts the compressed bitstream, so unlike every other effect here
 * it genuinely cannot render live -- there is nothing to show until the clip is
 * re-encoded. That constraint is real; the modes being invisible until the user
 * was already in the export dialog was not. Returns a path to a short clip.
 */
export async function previewFfglitch(
  inputPath: string,
  mode: string,
  startSecs?: number,
  durationSecs?: number
): Promise<string> {
  if (!isTauriAvailable()) throw new Error("Datamosh preview needs the desktop app.");
  return invoke("preview_ffglitch", { inputPath, mode, startSecs, durationSecs });
}

export async function applyFfglitch(
  inputPath: string,
  mode: string,
  params: Record<string, unknown> = {},
  outputPath?: string
): Promise<string> {
  const path = outputPath ?? (await save({
    filters: [
      { name: "MP4", extensions: ["mp4"] },
      { name: "AVI", extensions: ["avi"] },
    ],
  }));
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

/**
 * Delete an intermediate render left by a two-stage export. The backend refuses
 * anything that is not one of its own `.moshdither-fx-tmp.` files, so this
 * cannot remove a user's media. Cleanup failure is not worth failing an
 * otherwise-finished export over, so callers should ignore the rejection.
 */
export async function removeExportTemp(path: string): Promise<void> {
  return invoke("remove_export_temp", { path });
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

// ── App Updates ──────────────────────────────────────────────

export interface UpdateInfo {
  version: string;
  date: string | null;
  body: string | null;
  url: string;
  signature: string;
}

/** Checks the configured updater endpoint. Returns null when already up to date. */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!isTauriAvailable()) return null;
  return invoke<UpdateInfo | null>("check_update");
}

/**
 * Downloads, verifies, and installs the latest signed update, then restarts
 * the app. Resolves with "up to date" instead of installing anything if no
 * update was actually available at install time.
 */
export async function installUpdate(): Promise<string> {
  if (!isTauriAvailable()) return "up to date";
  return invoke<string>("install_update");
}
