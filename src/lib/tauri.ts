import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { EffectMeta } from "../store";

export { convertFileSrc };

// ── SAM3 Segmentation ────────────────────────────────────────

export async function sam3Init(): Promise<string> {
  return invoke("sam3_init");
}

export async function sam3LoadImage(imageB64: string): Promise<{ width: number; height: number }> {
  return invoke("sam3_load_image", { imageB64 });
}

export async function sam3TextPrompt(
  prompt: string
): Promise<{ count: number; masks: string[]; scores: number[] }> {
  return invoke("sam3_text_prompt", { prompt });
}

export async function sam3PointPrompt(
  points: [number, number][],
  labels?: number[]
): Promise<{ count: number; masks: string[]; scores: number[] }> {
  return invoke("sam3_point_prompt", { points, labels });
}

export async function sam3BoxPrompt(
  boxes: [number, number, number, number][]
): Promise<{ count: number; masks: string[]; scores: number[] }> {
  return invoke("sam3_box_prompt", { boxes });
}

export async function sam3AutoMask(
  gridSize: number = 16,
  iouThreshold: number = 0.7,
  minMaskRegionArea: number = 100
): Promise<{ count: number; masks: string[]; scores: number[] }> {
  return invoke("sam3_auto_mask", {
    grid_size: gridSize,
    iou_threshold: iouThreshold,
    min_mask_region_area: minMaskRegionArea,
  });
}

export async function sam3PostprocessMask(
  maskB64: string,
  grow: number = 0,
  shrink: number = 0,
  feather: number = 0,
  fillHoles: boolean = false
): Promise<string> {
  return invoke("sam3_postprocess_mask", {
    mask_b64: maskB64,
    grow,
    shrink,
    feather,
    fill_holes: fillHoles,
  });
}

export async function sam3Clear(): Promise<string> {
  return invoke("sam3_clear");
}

export async function sam3Shutdown(): Promise<string> {
  return invoke("sam3_shutdown");
}

// ── Media / Effects ──────────────────────────────────────────

export async function loadMediaFile(): Promise<string | null> {
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
  await invoke("load_media", { path });
}

export async function loadMediaFromBase64(dataUrl: string): Promise<void> {
  await invoke("load_media_from_base64", { dataUrl });
}

export async function listEffects(): Promise<EffectMeta[]> {
  return invoke("list_effects");
}

export async function listEffectsByCategory(category: string): Promise<EffectMeta[]> {
  return invoke("list_effects_by_category", { category });
}

export async function getMediaInfo(): Promise<{ width: number; height: number; loaded: boolean }> {
  return invoke("get_media_info");
}

export async function getFrameData(): Promise<string> {
  return invoke("get_frame_data");
}

export async function applyEffectStack(
  stack: { effect_id: string; params: Record<string, unknown>; mask_b64?: string | null }[],
  maskB64?: string | null
): Promise<string> {
  return invoke("apply_effect_stack", { stack, maskB64 });
}

export async function applyEffect(
  effectId: string,
  params: Record<string, unknown>,
  maskB64?: string | null
): Promise<string> {
  return invoke("apply_effect", { effectId, params, maskB64 });
}

export async function saveMedia(): Promise<void> {
  const path = await open({
    multiple: false,
    filters: [
      { name: "PNG", extensions: ["png"] },
      { name: "JPEG", extensions: ["jpg", "jpeg"] },
    ],
  });
  if (path && typeof path === "string") {
    await invoke("save_media", { path });
  }
}

export async function exportVideo(
  sourcePath: string,
  stack: { effect_id: string; params: Record<string, unknown>; mask_b64?: string | null }[],
  options: {
    maskB64?: string | null;
    codec?: string;
    fps?: number;
    width?: number;
    height?: number;
    audioBakeJson?: string | null;
  } = {}
): Promise<string> {
  const path = await open({
    multiple: false,
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
  });
}
