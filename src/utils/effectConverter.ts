import { RenderPass, EffectShader } from "../engine/webgl2/types";
import { shaderRegistry } from "../engine/shaders";
import { StackEntry } from "../store";

/** Maps a Rust effect ID to its WebGL shader preview equivalent. */
interface WebGLMapping {
  shaderId: string;
  /** Maps Rust parameter names to WebGL uniform names. */
  paramMap: Record<string, string>;
  /** Optional value transforms: (rustParamName, value) => webglValue */
  transform?: (rustParam: string, value: unknown) => number | number[] | boolean;
}

/**
 * Registry of Rust effect IDs that have a WebGL real-time preview equivalent.
 * Parameter names differ between the Rust CPU backend and WebGL shaders,
 * so we map them here for preview-export parity where possible.
 */
const rustToWebGL: Record<string, WebGLMapping> = {
  // Pixel Geometry
  "pixel_geo.pixelate": {
    shaderId: "pixelate",
    paramMap: { block_size: "blockSize" },
  },
  "pixel_geo.kaleidoscope": {
    shaderId: "kaleidoscope",
    paramMap: { segments: "segments" },
  },
  "pixel_geo.wave_distort": {
    shaderId: "wave_distort",
    paramMap: { amount: "amount", frequency: "frequency" },
  },
  "pixel_geo.mirror_slices": {
    shaderId: "mirror",
    paramMap: { mode: "mode" },
    transform: (_k, v) => {
      const mode = typeof v === "number" ? v : 0;
      return Math.floor(mode);
    },
  },
  "pixel_geo.anaglyph": {
    shaderId: "anaglyph",
    paramMap: { amount: "amount" },
  },
  "pixel_geo.block_shift": {
    shaderId: "block_shift",
    paramMap: { block_size: "blockSize", amount: "amount" },
  },
  "pixel_geo.pixel_sort": {
    shaderId: "pixel_sort",
    paramMap: { threshold: "threshold", amount: "amount" },
  },

  // Analog
  "analog.scanlines": {
    shaderId: "scanlines",
    paramMap: { intensity: "amount" },
  },
  "analog.chromatic_aberration": {
    shaderId: "chromatic_aberration",
    paramMap: { amount: "amount" },
  },
  "analog.vhs": {
    shaderId: "vhs_crt",
    paramMap: { tracking: "amount", noise: "amount" },
  },
  "analog.hue_shift": {
    shaderId: "hue_saturation",
    paramMap: { degrees: "hue" },
    transform: (_k, v) => {
      const deg = typeof v === "number" ? v : 0;
      return deg / 360.0;
    },
  },
  "analog.tv_glitch": {
    shaderId: "tv_glitch",
    paramMap: { amount: "amount" },
  },
  "analog.color_bleed": {
    shaderId: "color_bleed",
    paramMap: { amount: "amount" },
  },
  "analog.ghosting": {
    shaderId: "ghosting",
    paramMap: { amount: "amount" },
  },
  "analog.scan_drift": {
    shaderId: "scan_drift",
    paramMap: { amount: "amount" },
  },

  // Color
  "color.invert": {
    shaderId: "invert",
    paramMap: { intensity: "amount" },
  },
  "color.lut_grading": {
    shaderId: "lut_color_grading",
    paramMap: { amount: "amount" },
  },
  "color.rgb_shift": {
    shaderId: "rgb_shift",
    paramMap: { r_shift: "amount" },
    transform: (_k, v) => {
      const shift = typeof v === "number" ? v : 0;
      return Math.abs(shift) * 0.5;
    },
  },
  "color.channel_swap": {
    shaderId: "channel_swap",
    paramMap: { mode: "mode" },
    transform: (_k, v) => {
      const mode = typeof v === "number" ? v : 0;
      return Math.floor(mode);
    },
  },

  // Artistic
  "artistic.posterize": {
    shaderId: "posterize",
    paramMap: { levels: "levels" },
  },
  "artistic.grayscale": {
    shaderId: "grayscale",
    paramMap: {},
  },
  "artistic.solarize": {
    shaderId: "solarize",
    paramMap: { threshold: "threshold" },
  },
  "artistic.vaporwave": {
    shaderId: "vaporwave",
    paramMap: { amount: "amount" },
  },

  // Noise
  "noise.uniform_noise": {
    shaderId: "noise_grain",
    paramMap: { amount: "amount" },
  },
  "noise.gaussian_noise": {
    shaderId: "noise_grain",
    paramMap: { amount: "amount" },
  },
  "noise.salt_pepper_noise": {
    shaderId: "noise_grain",
    paramMap: { density: "amount" },
  },
  "noise.fractal_noise": {
    shaderId: "fractal_noise",
    paramMap: { amount: "amount", scale: "scale", octaves: "octaves" },
    transform: (_k, v) => {
      if (_k === "octaves") return typeof v === "number" ? Math.floor(v) : 4;
      return typeof v === "number" ? v : 0;
    },
  },

  // Dithering
  "dithering.halftone": {
    shaderId: "dither_halftone",
    paramMap: { dot_size: "scale" },
    transform: (_k, v) => {
      const dot = typeof v === "number" ? v : 8.0;
      return Math.max(2.0, Math.min(32.0, dot));
    },
  },
  "dithering.bayer_dither": {
    shaderId: "bayer_dither",
    paramMap: { scale: "scale" },
  },
  "dithering.palette": {
    shaderId: "palette_dither",
    paramMap: {
      scale: "scale",
      angle: "angle",
      palette_size: "paletteSize",
      amount: "amount",
    },
  },
  "dithering.threshold": {
    shaderId: "threshold_dither",
    paramMap: { threshold: "threshold" },
  },
  "dithering.random_noise": {
    shaderId: "random_dither",
    paramMap: { amount: "amount" },
  },
  "dithering.blue_noise": {
    shaderId: "blue_noise_dither",
    paramMap: { amount: "amount" },
  },
  "dithering.atkinson": {
    shaderId: "atkinson_dither",
    paramMap: { amount: "amount" },
  },
  "dithering.burkes": {
    shaderId: "burkes_dither",
    paramMap: { amount: "amount" },
  },
  "dithering.floyd_steinberg": {
    shaderId: "floyd_steinberg_dither",
    paramMap: { amount: "amount" },
  },
  "dithering.jarvis_judice_ninke": {
    shaderId: "jarvis_dither",
    paramMap: { amount: "amount" },
  },
  "dithering.sierra": {
    shaderId: "sierra_dither",
    paramMap: { amount: "amount" },
  },
  "dithering.stucki": {
    shaderId: "stucki_dither",
    paramMap: { amount: "amount" },
  },
  "dithering.riemersma": {
    shaderId: "riemersma_dither",
    paramMap: { amount: "amount" },
  },

  // Glitch
  "glitch.slice_shift": {
    shaderId: "slice_shift",
    paramMap: { slice_height: "sliceHeight", amount: "amount" },
  },
  "glitch.databend": {
    shaderId: "databend",
    paramMap: { amount: "amount" },
  },
  "glitch.jpeg_quantize": {
    shaderId: "jpeg_quantize",
    paramMap: { quality: "quality" },
  },
  "glitch.byte_flip": {
    shaderId: "byte_flip",
    paramMap: { amount: "amount" },
  },
  "glitch.byte_zero": {
    shaderId: "byte_zero",
    paramMap: { amount: "amount" },
  },
  "glitch.byte_insert": {
    shaderId: "byte_insert",
    paramMap: { amount: "amount" },
  },
  "glitch.byte_reverse": {
    shaderId: "byte_reverse",
    paramMap: { amount: "amount" },
  },
};

/**
 * Convert the zustand effect stack into WebGL render passes for real-time preview.
 * Skips disabled effects and effects without a WebGL equivalent.
 */
export function stackToRenderPasses(stack: StackEntry[]): RenderPass[] {
  const passes: RenderPass[] = [];

  for (const entry of stack) {
    if (!entry.enabled) continue;

    const mapping = rustToWebGL[entry.effectId];
    if (!mapping) continue;

    if (!shaderRegistry.has(mapping.shaderId)) continue;

    const uniforms: Record<string, number | number[] | boolean> = {};
    for (const [rustParam, webglUniform] of Object.entries(mapping.paramMap)) {
      const rawValue = entry.params[rustParam];
      if (rawValue === undefined) continue;

      if (mapping.transform) {
        uniforms[webglUniform] = mapping.transform(rustParam, rawValue);
      } else {
        const num = typeof rawValue === "number" ? rawValue : Number(rawValue);
        uniforms[webglUniform] = Number.isNaN(num) ? 0 : num;
      }
    }

    passes.push({
      shaderId: mapping.shaderId,
      inputTexture: passes.length === 0 ? "source" : `pass_${passes.length - 1}`,
      outputFramebuffer: `pass_${passes.length}`,
      uniforms,
    });
  }

  return passes;
}

/** Build a Map of shaders needed for the given passes. */
export function buildShaderMap(passes: RenderPass[]): Map<string, EffectShader> {
  const map = new Map<string, EffectShader>();
  for (const pass of passes) {
    const shader = shaderRegistry.get(pass.shaderId);
    if (shader && !map.has(pass.shaderId)) {
      map.set(pass.shaderId, shader);
    }
  }
  return map;
}

/** Whether a Rust effect has a WebGL real-time preview equivalent. */
export function hasWebGLPreview(rustEffectId: string): boolean {
  const mapping = rustToWebGL[rustEffectId];
  return !!mapping && shaderRegistry.has(mapping.shaderId);
}

/** List all Rust effect IDs that have WebGL preview support. */
export function listPreviewableEffects(): string[] {
  return Object.keys(rustToWebGL).filter((id) => shaderRegistry.has(rustToWebGL[id].shaderId));
}

/**
 * Resolve a maskId to a base64 PNG string.
 */
export function resolveMaskId(
  maskId: string | null,
  activeMask: string | null,
  sam3Masks: string[]
): string | null {
  if (!maskId) return null;
  if (maskId === "active") return activeMask;
  if (maskId.startsWith("sam3-")) {
    const idx = parseInt(maskId.replace("sam3-", ""), 10);
    return sam3Masks[idx] ?? null;
  }
  return null;
}

/**
 * Convert zustand effect stack directly to the Rust IPC payload shape.
 * This is what Toolbar.tsx already does inline; extracted here for consistency.
 */
export function stackToRustPayload(
  stack: StackEntry[],
  activeMask: string | null,
  sam3Masks: string[],
  time?: number
): Array<{
  effect_id: string;
  params: Record<string, unknown>;
  mask_b64: string | null;
}> {
  return stack
    .filter((e) => e.enabled)
    .map((e) => ({
      effect_id: e.effectId,
      params: { ...e.params, ...(time !== undefined ? { time } : {}) },
      mask_b64: resolveMaskId(e.maskId, activeMask, sam3Masks),
    }));
}
