import type { Preset } from "./usePresets";
import type { StackEntry } from "../store";

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
      makeEntry("noise.gaussian_noise", "Gaussian Noise", { amount: 0.08 }),
      makeEntry("analog.vhs", "VHS", { tracking: 0.3, noise: 0.2 }),
      makeEntry("color.contrast_brightness", "Contrast / Brightness", {
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
      makeEntry("dithering.palette_dither", "Palette Dither", {
        scale: 1.0,
        angle: 0,
        palette_size: 4,
        amount: 1.0,
        palette_0: [255, 0, 128],
        palette_1: [0, 255, 255],
        palette_2: [255, 255, 0],
        palette_3: [0, 0, 0],
        palette_4: [0, 0, 0],
        palette_5: [0, 0, 0],
        palette_6: [0, 0, 0],
        palette_7: [0, 0, 0],
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
      makeEntry("dithering.halftone", "Halftone Dither", { dot_size: 4, angle: 45 }),
      makeEntry("color.contrast_brightness", "Contrast / Brightness", {
        contrast: 1.3,
        brightness: 0,
      }),
      makeEntry("analog.vignette", "Vignette", { strength: 0.4 }),
    ],
  },
  {
    id: "default-preset-glitch-storm",
    name: "Glitch Storm",
    createdAt: new Date().toISOString(),
    stack: [
      makeEntry("glitch.slice_shift", "Slice Shift", { slice_height: 3, max_shift: 40 }),
      makeEntry("glitch.databend", "Databend", { intensity: 0.6 }),
      makeEntry("glitch.jpeg_quantize", "JPEG Quantize", { quality: 30 }),
      makeEntry("color.rgb_shift", "RGB Shift", { r_offset: 4, g_offset: 0, b_offset: -4 }),
      makeEntry("analog.scanlines", "Scanlines", { gap: 2, intensity: 0.25 }),
    ],
  },
  {
    id: "default-preset-pixel-crush",
    name: "Pixel Crush",
    createdAt: new Date().toISOString(),
    stack: [
      makeEntry("pixel_geo.pixelate", "Pixelate", { block_size: 12 }),
      makeEntry("artistic.posterize", "Posterize", { levels: 4 }),
      makeEntry("dithering.bayer", "Bayer Dither", { matrix_size: 1 }),
      makeEntry("color.saturation", "Saturation", { saturation: 1.4 }),
    ],
  },
  {
    id: "default-preset-deep-bass",
    name: "Deep Bass Pulse",
    createdAt: new Date().toISOString(),
    stack: [
      makeEntry("audio_reactive.bass_pulse", "Bass Pulse", { scale: 0.8, threshold: 0.3 }),
      makeEntry("audio_reactive.chromatic", "Reactive Chromatic", { intensity: 0.5 }),
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
      makeEntry("datamoshing.classic", "Classic Datamosh", { strength: 0.7, block_size: 16 }),
      makeEntry("glitch.byte_flip", "Byte Flip", { probability: 0.05 }),
      makeEntry("color.channel_swap", "Channel Swap", { mode: 2 }),
      makeEntry("analog.chromatic_aberration", "Chromatic Aberration", { shift: 2 }),
    ],
  },
  {
    id: "default-preset-vintage-film",
    name: "Vintage Film",
    createdAt: new Date().toISOString(),
    stack: [
      makeEntry("color.temperature_tint", "Temperature / Tint", { temperature: 20, tint: 5 }),
      makeEntry("color.saturation", "Saturation", { saturation: 0.7 }),
      makeEntry("noise.salt_pepper", "Salt & Pepper", { amount: 0.03 }),
      makeEntry("analog.film_grain", "Film Grain", { intensity: 0.25 }),
      makeEntry("analog.vignette", "Vignette", { strength: 0.5 }),
      makeEntry("artistic.solarize", "Solarize", { threshold: 128 }),
    ],
  },
  {
    id: "default-preset-spectral-shift",
    name: "Spectral Shift",
    createdAt: new Date().toISOString(),
    stack: [
      makeEntry("audio_reactive.spectral_shift", "Spectral Shift", { intensity: 0.8 }),
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
      makeEntry("pixel_geo.pixel_sort", "Pixel Sort", { threshold: 0.3, length: 20 }),
    ],
  },
  {
    id: "default-preset-kaleidoscope",
    name: "Kaleidoscope",
    createdAt: new Date().toISOString(),
    stack: [
      makeEntry("pixel_geo.kaleidoscope", "Kaleidoscope", { segments: 6, rotation: 0 }),
      makeEntry("color.saturation", "Saturation", { saturation: 1.5 }),
      makeEntry("dithering.ordered", "Ordered Dither", { scale: 1 }),
      makeEntry("analog.hue_shift", "Hue Shift", { shift: 30 }),
    ],
  },
];
