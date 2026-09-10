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
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";
  fontSize: number;
  fontPath: string | null;
  color: string;
  opacity: number;
  scale: number; // percentage 1-100 for image watermarks
  rotation: number; // degrees, 0-360
}

export const DEFAULT_WATERMARK: WatermarkSettings = {
  enabled: false,
  type: "text",
  text: "MoshDither",
  imagePath: null,
  position: "bottom-right",
  fontSize: 24,
  fontPath: null,
  color: "white",
  opacity: 0.7,
  scale: 20,
  rotation: 0,
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
  type: "text" | "image"
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
export function buildDrawtextFilter(settings: WatermarkSettings): string | null {
  if (!settings.enabled || settings.type !== "text" || !settings.text) return null;

  const { x, y } = getOverlayCoords(settings.position, "text");
  const color = toDrawtextColor(settings.color);
  const opacity = Math.max(0, Math.min(1, Number.isNaN(settings.opacity) ? 0 : settings.opacity));
  // drawtext wants `color@<float 0..1>`; bare hex is rejected outright.
  const alpha = opacity.toFixed(3);
  const fontSize = Math.max(
    1,
    Math.min(999, Math.round(Number.isNaN(settings.fontSize) ? 24 : settings.fontSize))
  );

  // `expansion=none`: the watermark is literal text. With the default
  // expansion drawtext treats `%` and `%{...}` as its own template syntax.
  let filter = `drawtext=text=${escapeFilterValue(settings.text.replace(/[\r\n]/g, " "))}:expansion=none:x=${x}:y=${y}:fontsize=${fontSize}:fontcolor=${color}@${alpha}`;

  // Use selected font file if available
  if (settings.fontPath) {
    filter += `:fontfile=${escapeFilterValue(stripVerbatimPrefix(settings.fontPath))}`;
  }

  return filter;
}

/**
 * One filter option value, escaped for BOTH of FFmpeg's parser levels.
 *
 * This mirrors `escape_filter_value` in src-tauri/src/ffmpeg/mod.rs, which is
 * the builder the export actually runs; keep the two identical. A `-vf`
 * string is parsed twice: the graph parser takes each filter's argument
 * string as one token (literal inside `'...'`, one backslash dropped
 * outside), then the option parser splits on `:` and processes escapes
 * again. So the value is quoted to survive the first pass and escaped
 * (`\` `:` `,` `;`) for the second. A quote cannot be escaped inside quotes,
 * so `'` is spliced in from outside them: close, `\\\'`, reopen.
 *
 * Every rule was measured against the bundled ffmpeg 8.0 by rendering and
 * comparing pixels. The previous escaper aborted the export on an apostrophe
 * (`text='It\'s'` -> "No option name near ..."), lost everything after a `%`
 * ("Stray %"), and never quoted or backslash-escaped `fontfile=`, so a
 * Windows font path was read as `C:WindowsFontsarial.ttf`.
 */
export function escapeFilterValue(value: string): string {
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/'/g, "'\\\\\\''");
  // The option-level parser trims unescaped whitespace at both ends of a
  // value (the quotes are gone by then), so "  MoshDither  " would render as
  // "MoshDither". An escaped space survives both passes.
  const edged = escaped.replace(/^[ \t]+|[ \t]+$/g, (run) => run.replace(/[ \t]/g, "\\$&"));
  return `'${edged}'`;
}

/** Rust's canonicalize yields `\\?\C:\...` on Windows; freetype does not want it. */
function stripVerbatimPrefix(path: string): string {
  return path.startsWith("\\\\?\\") ? path.slice(4) : path;
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
  const alpha = Math.max(0, Math.min(1, Number.isNaN(settings.opacity) ? 0 : settings.opacity));
  const scale = Math.max(0, Math.min(100, Number.isNaN(settings.scale) ? 0 : settings.scale));

  // Scale image to percentage of main video height, then overlay with opacity
  const scaleExpr = scale > 0 ? `scale=-1:${scale}*ih/100` : "";
  const overlayExpr = `overlay=${x}:${y}`;
  const opacityExpr = alpha < 1 ? `format=rgba,colorchannelmixer=aa=${alpha.toFixed(2)}` : "";

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
export function appendTextWatermarkToVf(vf: string, settings: WatermarkSettings): string {
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
  settings: WatermarkSettings
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
      // Insert before output path — skip entries that follow -i (those are input files)
      const insertIndex = args.findIndex(
        (a, i) =>
          i > 0 &&
          args[i - 1] !== "-i" &&
          (a.endsWith(".mp4") || a.endsWith(".gif") || a.endsWith(".png") || a.endsWith(".jpg"))
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
  } else {
    // No existing -i — prepend image input before output
    const outputIdx = args.findIndex(
      (a, i) =>
        i > 0 &&
        args[i - 1] !== "-i" &&
        (a.endsWith(".mp4") || a.endsWith(".gif") || a.endsWith(".png") || a.endsWith(".jpg"))
    );
    if (outputIdx !== -1) {
      args.splice(outputIdx, 0, "-i", settings.imagePath!);
    } else {
      args.unshift("-i", settings.imagePath!);
    }
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
      (a, i) =>
        i > 0 &&
        args[i - 1] !== "-i" &&
        (a.endsWith(".mp4") || a.endsWith(".gif") || a.endsWith(".png") || a.endsWith(".jpg"))
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
      (a, i) =>
        i > 0 &&
        args[i - 1] !== "-i" &&
        (a.endsWith(".mp4") || a.endsWith(".gif") || a.endsWith(".png") || a.endsWith(".jpg"))
    );
    if (outputIndex !== -1) {
      args.splice(outputIndex, 0, "-map", "[out]");
    }
  }

  return { args, extraInputs: [] };
}
