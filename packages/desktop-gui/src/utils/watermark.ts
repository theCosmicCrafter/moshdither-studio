/**
 * Watermark overlay utilities for the render pipeline.
 *
 * Supports both text (drawtext) and image (overlay) watermarks.
 * Generates FFmpeg filter arguments with cross-platform font detection.
 */

export type WatermarkType = "text" | "image";

export interface WatermarkSettings {
  enabled: boolean;
  type: WatermarkType;
  text: string;
  imagePath: string | null;
  position:
    | "top-left"
    | "top-right"
    | "bottom-left"
    | "bottom-right"
    | "center";
  fontSize: number;
  color: string;
  opacity: number;
  scale: number; // percentage 1-100 for image watermarks
}

export const DEFAULT_WATERMARK: WatermarkSettings = {
  enabled: false,
  type: "text",
  text: "MoshDither",
  imagePath: null,
  position: "bottom-right",
  fontSize: 24,
  color: "white",
  opacity: 0.7,
  scale: 20,
};

/**
 * Convert hex/rgb color name to FFmpeg drawtext color format.
 */
function toDrawtextColor(color: string): string {
  const colorMap: Record<string, string> = {
    white: "white",
    black: "black",
    red: "red",
    green: "green",
    blue: "blue",
    yellow: "yellow",
    cyan: "cyan",
    magenta: "magenta",
  };
  return colorMap[color.toLowerCase()] || "white";
}

/**
 * Get FFmpeg overlay position coordinates for both text and image.
 */
function getOverlayCoords(
  position: WatermarkSettings["position"],
  type: "text" | "image",
): { x: string; y: string } {
  if (type === "text") {
    switch (position) {
      case "top-left":
        return { x: "10", y: "10" };
      case "top-right":
        return { x: "w-text_w-10", y: "10" };
      case "bottom-left":
        return { x: "10", y: "h-text_h-10" };
      case "bottom-right":
        return { x: "w-text_w-10", y: "h-text_h-10" };
      case "center":
        return { x: "(w-text_w)/2", y: "(h-text_h)/2" };
    }
  }
  // Image overlay uses overlay filter expressions
  switch (position) {
    case "top-left":
      return { x: "10", y: "10" };
    case "top-right":
      return { x: "W-w-10", y: "10" };
    case "bottom-left":
      return { x: "10", y: "H-h-10" };
    case "bottom-right":
      return { x: "W-w-10", y: "H-h-10" };
    case "center":
      return { x: "(W-w)/2", y: "(H-h)/2" };
  }
}

/**
 * Build FFmpeg drawtext filter string for text watermark.
 */
export function buildDrawtextFilter(
  settings: WatermarkSettings,
): string | null {
  if (!settings.enabled || settings.type !== "text" || !settings.text)
    return null;

  const { x, y } = getOverlayCoords(settings.position, "text");
  const color = toDrawtextColor(settings.color);
  const alpha = Math.round(settings.opacity * 255)
    .toString(16)
    .padStart(2, "0");

  // Cross-platform font file detection (Electron main process only)
  return `drawtext=text='${escapeDrawtext(settings.text)}':x=${x}:y=${y}:fontsize=${settings.fontSize}:fontcolor=${color}@${alpha}`;
}

/**
 * Escape special characters in drawtext string.
 */
function escapeDrawtext(text: string): string {
  return text.replace(/'/g, "\\'").replace(/:/g, "\\:");
}

/**
 * Build FFmpeg overlay filter for image watermark.
 * Returns the filter string and required extra input index.
 */
export function buildImageOverlayFilter(settings: WatermarkSettings): {
  filter: string | null;
  extraInputIndex: number | null;
} {
  if (!settings.enabled || settings.type !== "image" || !settings.imagePath) {
    return { filter: null, extraInputIndex: null };
  }

  const { x, y } = getOverlayCoords(settings.position, "image");
  const alpha = settings.opacity;

  // Scale image to percentage of main video height, then overlay with opacity
  const scaleExpr =
    settings.scale > 0 ? `scale=-1:${settings.scale}*ih/100` : "";
  const overlayExpr = `overlay=${x}:${y}`;
  const opacityExpr =
    alpha < 1 ? `format=rgba,colorchannelmixer=aa=${alpha.toFixed(2)}` : "";

  let filter = "";
  if (scaleExpr) {
    filter += `[1:v]${scaleExpr}`;
    if (opacityExpr) {
      filter += `[wm];[wm]${opacityExpr}[wm2];[0:v][wm2]${overlayExpr}`;
    } else {
      filter += `[wm];[0:v][wm]${overlayExpr}`;
    }
  } else if (opacityExpr) {
    filter += `[1:v]${opacityExpr}[wm];[0:v][wm]${overlayExpr}`;
  } else {
    filter += `[0:v][1:v]${overlayExpr}`;
  }

  return { filter, extraInputIndex: 1 };
}

/**
 * Append text watermark to existing FFmpeg video filter string.
 */
export function appendTextWatermarkToVf(
  vf: string,
  settings: WatermarkSettings,
): string {
  const watermark = buildDrawtextFilter(settings);
  if (!watermark) return vf;
  if (!vf) return watermark;
  return `${vf},${watermark}`;
}

/**
 * Build complete FFmpeg args including watermark.
 * Returns the modified args array and any extra inputs needed.
 */
export function buildWatermarkArgs(
  baseArgs: string[],
  settings: WatermarkSettings,
): { args: string[]; extraInputs: string[] } {
  if (!settings.enabled) {
    return { args: baseArgs, extraInputs: [] };
  }

  if (settings.type === "text") {
    const drawtext = buildDrawtextFilter(settings);
    if (!drawtext) return { args: baseArgs, extraInputs: [] };

    const args = [...baseArgs];
    // Find existing -vf or -filter_complex and append watermark
    let vfIndex = args.indexOf("-vf");
    if (vfIndex === -1) vfIndex = args.indexOf("-filter_complex");

    if (vfIndex !== -1 && vfIndex + 1 < args.length) {
      args[vfIndex + 1] = `${args[vfIndex + 1]},${drawtext}`;
    } else {
      // Insert before output path (last element is usually -y or output path)
      const insertIndex = args.findIndex(
        (a) =>
          a.endsWith(".mp4") ||
          a.endsWith(".gif") ||
          a.endsWith(".png") ||
          a.endsWith(".jpg"),
      );
      if (insertIndex !== -1) {
        args.splice(insertIndex, 0, "-vf", drawtext);
      } else {
        args.push("-vf", drawtext);
      }
    }
    return { args, extraInputs: [] };
  }

  // Image watermark
  const { filter, extraInputIndex } = buildImageOverlayFilter(settings);
  if (!filter || extraInputIndex === null) {
    return { args: baseArgs, extraInputs: [] };
  }

  const args = [...baseArgs];
  // Find input file position (first -i after args start)
  const firstInputIndex = args.indexOf("-i");
  if (firstInputIndex !== -1) {
    // Insert image input right after first input
    args.splice(firstInputIndex + 2, 0, "-i", settings.imagePath!);
  }

  // Replace or insert filter_complex
  let fcIndex = args.indexOf("-filter_complex");
  if (fcIndex === -1) fcIndex = args.indexOf("-vf");

  if (fcIndex !== -1 && fcIndex + 1 < args.length) {
    const existing = args[fcIndex + 1];
    // If existing is a simple vf (no stream labels), wrap it for filter_complex
    if (fcIndex === args.indexOf("-vf")) {
      args[fcIndex] = "-filter_complex";
      args[fcIndex + 1] =
        `[0:v]${existing}[v0];${filter}[v1];[v1]${existing.replace(/scale=trunc\(iw\/2\)\*2:trunc\(ih\/2\)\*2/, "")}[out]`;
    } else {
      args[fcIndex + 1] = `${existing};${filter}`;
    }
  } else {
    const insertIndex = args.findIndex(
      (a) =>
        a.endsWith(".mp4") ||
        a.endsWith(".gif") ||
        a.endsWith(".png") ||
        a.endsWith(".jpg"),
    );
    if (insertIndex !== -1) {
      args.splice(insertIndex, 0, "-filter_complex", filter);
    } else {
      args.push("-filter_complex", filter);
    }
  }

  // Add -map for output if using filter_complex
  if (!args.includes("-map")) {
    const outputIndex = args.findIndex(
      (a) =>
        a.endsWith(".mp4") ||
        a.endsWith(".gif") ||
        a.endsWith(".png") ||
        a.endsWith(".jpg"),
    );
    if (outputIndex !== -1) {
      args.splice(outputIndex, 0, "-map", "[out]");
    }
  }

  return { args, extraInputs: [] };
}
