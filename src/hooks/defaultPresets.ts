import type { StackEntry } from "../store";
import type { Preset } from "./usePresets";

function makeEntry(
  effectId: string,
  effectName: string,
  params: Record<string, unknown>,
  enabled = true
): StackEntry {
  return {
    id: `default-${effectId}-${Math.random().toString(36).slice(2, 7)}`,
    effectId,
    effectName,
    params,
    enabled,
    maskId: null,
    maskMode: "inside",
  };
}

export const DEFAULT_PRESETS: Preset[] = [
  {
    id: "default-preset-vhs-analog",
    name: "VHS Analog",
    createdAt: new Date().toISOString(),
    stack: [
      makeEntry("analog.scanlines", "Scanlines", { gap: 2, intensity: 0.4 }),
      makeEntry("analog.chromatic_aberration", "Chromatic Aberration", { shift: 6 }),
      makeEntry("noise.gaussian", "Gaussian Noise", { std_dev: 20 }),
      makeEntry("analog.vhs", "VHS", { tracking: 0.3, noise: 0.2 }),
      makeEntry("color.brightness_contrast", "Brightness / Contrast", {
        contrast: 1.2,
        brightness: -0.05,
      }),
    ],
  },
  {
    id: "default-preset-cyberpunk-dither",
    name: "Cyberpunk Dither",
    createdAt: new Date().toISOString(),
    stack: [
      makeEntry("dithering.palette", "Palette Dither", {
        scale: 1.0,
        angle: 0,
        palette_size: 4,
        amount: 1.0,
      }),
      makeEntry("color.lift_gamma_gain", "Lift / Gamma / Gain", {
        lift_r: 0.1,
        lift_g: 0.0,
        lift_b: 0.15,
        gamma_r: 0.0,
        gamma_g: 0.05,
        gamma_b: -0.1,
        gain_r: 0.2,
        gain_g: 0.0,
        gain_b: 0.3,
        amount: 0.8,
      }),
      makeEntry("analog.chromatic_aberration", "Chromatic Aberration", { shift: 3 }),
      makeEntry("glitch.slice_shift", "Slice Shift", { slice_height: 8, max_shift: 12 }),
    ],
  },
  {
    id: "default-pret-bw-halftone",
    name: "B&W Halftone",
    createdAt: new Date().toISOString(),
    stack: [
      makeEntry("artistic.grayscale", "Grayscale", {}),
      makeEntry("dithering.halftone", "Halftone Dither", { dot_size: 4, screen_angle: 45 }),
      makeEntry("color.brightness_contrast", "Brightness / Contrast", {
        contrast: 1.3,
        brightness: 0,
      }),
    ],
  },
  {
    id: "default-preset-glitch-storm",
    name: "Glitch Storm",
    createdAt: new Date().toISOString(),
    stack: [
      makeEntry("glitch.slice_shift", "Slice Shift", { slice_height: 3, max_shift: 40 }),
      makeEntry("glitch.databend", "Databend", { amount: 0.6 }),
      makeEntry("glitch.jpeg_quantize", "JPEG Quantize", { quality: 30 }),
      makeEntry("color.rgb_shift", "RGB Shift", { r_shift: 4, g_shift: 0, b_shift: -4 }),
      makeEntry("analog.scanlines", "Scanlines", { gap: 2, intensity: 0.25 }),
    ],
  },
  {
    id: "default-preset-pixel-crush",
    name: "Pixel Crush",
    createdAt: new Date().toISOString(),
    stack: [
      makeEntry("pixel_geo.pixelate", "Pixelate", { block_size: 12 }),
      makeEntry("artistic.posterize", "Posterize", { bits: 4 }),
      makeEntry("dithering.bayer", "Bayer Dither", { matrix_size: 1 }),
      makeEntry("color.brightness_contrast", "Saturation", { saturation: 1.4 }),
    ],
  },
  {
    id: "default-preset-deep-bass",
    name: "Deep Bass Pulse",
    createdAt: new Date().toISOString(),
    stack: [
      makeEntry("audio_reactive.bass_pulse", "Bass Pulse", { sensitivity: 0.8, block_size: 16 }),
      makeEntry("audio_reactive.spectral_shift", "Reactive Chromatic", { shift_amount: 0.5 }),
      makeEntry("color.lift_gamma_gain", "Lift / Gamma / Gain", {
        lift_r: 0.0,
        lift_g: 0.0,
        lift_b: 0.0,
        gamma_r: 0.0,
        gamma_g: 0.0,
        gamma_b: 0.0,
        gain_r: 0.3,
        gain_g: 0.0,
        gain_b: 0.2,
        amount: 0.6,
      }),
      makeEntry("analog.scanlines", "Scanlines", { gap: 2, intensity: 0.2 }),
    ],
  },
  {
    id: "default-preset-datamosh-classic",
    name: "Datamosh Classic",
    createdAt: new Date().toISOString(),
    stack: [
      makeEntry("datamoshing.classic", "Classic Datamosh", { chunk_size: 16, repeats: 3, smear_direction: "horizontal" }),
      makeEntry("glitch.byte_flip", "Byte Flip", { amount: 0.05 }),
      makeEntry("color.channel_swap", "Channel Swap", { mode: 2 }),
      makeEntry("analog.chromatic_aberration", "Chromatic Aberration", { shift: 2 }),
    ],
  },
  {
    id: "default-preset-vintage-film",
    name: "Vintage Film",
    createdAt: new Date().toISOString(),
    stack: [
      makeEntry("color.brightness_contrast", "Saturation", { saturation: 0.7 }),
      makeEntry("noise.salt_pepper", "Salt & Pepper", { density: 0.03 }),
      makeEntry("noise.gaussian", "Film Grain", { std_dev: 10 }),
      makeEntry("artistic.solarize", "Solarize", { threshold: 128 }),
    ],
  },
  {
    id: "default-preset-spectral-shift",
    name: "Spectral Shift",
    createdAt: new Date().toISOString(),
    stack: [
      makeEntry("audio_reactive.spectral_shift", "Spectral Shift", { shift_amount: 0.8 }),
      makeEntry("color.lift_gamma_gain", "Lift / Gamma / Gain", {
        lift_r: 0.0,
        lift_g: 0.0,
        lift_b: 0.0,
        gamma_r: -0.1,
        gamma_g: 0.0,
        gamma_b: 0.1,
        gain_r: 0.1,
        gain_g: 0.2,
        gain_b: 0.0,
        amount: 0.7,
      }),
      makeEntry("dithering.floyd_steinberg", "Floyd-Steinberg", {}),
      makeEntry("pixel_geo.pixel_sort", "Pixel Sort", { auto_threshold: false, threshold: 77 }),
    ],
  },
  {
    id: "default-preset-kaleidoscope",
    name: "Kaleidoscope",
    createdAt: new Date().toISOString(),
    stack: [
      makeEntry("pixel_geo.kaleidoscope", "Kaleidoscope", { segments: 6 }),
      makeEntry("color.brightness_contrast", "Saturation", { saturation: 1.5 }),
      makeEntry("dithering.ordered_variants", "Ordered Dither", { matrix: "clustereddot4x4", levels: 2 }),
      makeEntry("analog.hue_shift", "Hue Shift", { degrees: 30 }),
    ],
  },
];
