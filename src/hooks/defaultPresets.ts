import type { Keyframe, KeyframeTrack } from "../store";
import type { Preset, PresetStackEntry } from "./usePresets";

function makeEntry(
  effectId: string,
  effectName: string,
  params: Record<string, unknown>,
  enabled = true,
  keyframes?: KeyframeTrack
): PresetStackEntry {
  return {
    id: `default-${effectId}-${Math.random().toString(36).slice(2, 7)}`,
    effectId,
    effectName,
    params,
    enabled,
    maskId: null,
    maskMode: "inside",
    ...(keyframes ? { keyframes } : {}),
  };
}

/** Deterministic ids keep the bundled presets diff-stable. */
function kf(
  id: string,
  time: number,
  value: number,
  easing: Keyframe["easing"] = "linear"
): Keyframe {
  return { id, time, value, easing };
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

  // ── Animated looks (still → clip) ─────────────────────────
  //
  // These presets ship keyframes, not just params: load one over a still,
  // run it through "Animate to clip", and the look plays out over the clip.
  //
  // Authoring rules, learned from the export path (commands.rs):
  //  - Keyframes go on PER-FRAME effects only (glitch/color/analog/noise/
  //    pixel_geo/dithering). Temporal effects — every datamoshing.* — are
  //    handed the whole segment at once and sample each keyframed param a
  //    single time at segment start, so keyframing them would lie.
  //  - Times run 0–5s to match the default 5s still→video duration. The
  //    interpolator clamps outside the track range, so a shorter clip just
  //    doesn't reach the tail and a longer one holds the final value.
  {
    // Clean → corrupt: displacement, databend and compression artefacts all
    // ease in from zero over the clip, channels splitting late.
    id: "default-preset-anim-glitch-decay",
    name: "Glitch Decay",
    createdAt: new Date().toISOString(),
    stack: [
      makeEntry("glitch.slice_shift", "Slice Shift", { slice_height: 6, max_shift: 0 }, true, {
        // Easing rides on the segment's STARTING keyframe (the interpolator
        // reads k1.easing), so easeIn lives on the t=0 key to accelerate
        // into the corrupt end-state.
        max_shift: [kf("gd-ss-0", 0, 0, "easeIn"), kf("gd-ss-1", 4.5, 48)],
      }),
      makeEntry("glitch.databend", "Databend", { amount: 0 }, true, {
        amount: [kf("gd-db-0", 0, 0, "easeIn"), kf("gd-db-1", 5, 0.75)],
      }),
      makeEntry("glitch.jpeg_quantize", "JPEG Quantize", { quality: 100 }, true, {
        quality: [kf("gd-jq-0", 0, 100, "easeIn"), kf("gd-jq-1", 5, 12)],
      }),
      makeEntry("color.rgb_shift", "RGB Shift", { r_shift: 0, g_shift: 0, b_shift: 0 }, true, {
        r_shift: [kf("gd-rs-0", 0, 0, "easeIn"), kf("gd-rs-1", 4, 10)],
        b_shift: [kf("gd-bs-0", 0, 0, "easeIn"), kf("gd-bs-1", 4, -10)],
      }),
    ],
  },
  {
    // Two slow breathing pulses: scanlines, pixelation and fringing swell
    // together at ~1.25s and ~3.75s and fall back to clean between.
    id: "default-preset-anim-pulse-scan",
    name: "Pulse Scan",
    createdAt: new Date().toISOString(),
    stack: [
      makeEntry("analog.scanlines", "Scanlines", { gap: 3, intensity: 0 }, true, {
        intensity: [
          kf("ps-sl-0", 0, 0, "easeInOut"),
          kf("ps-sl-1", 1.25, 0.85, "easeInOut"),
          kf("ps-sl-2", 2.5, 0, "easeInOut"),
          kf("ps-sl-3", 3.75, 0.85, "easeInOut"),
          kf("ps-sl-4", 5, 0),
        ],
      }),
      makeEntry("pixel_geo.pixelate", "Pixelate", { block_size: 2 }, true, {
        block_size: [
          kf("ps-px-0", 0, 2, "easeInOut"),
          kf("ps-px-1", 1.25, 28, "easeInOut"),
          kf("ps-px-2", 2.5, 2, "easeInOut"),
          kf("ps-px-3", 3.75, 28, "easeInOut"),
          kf("ps-px-4", 5, 2),
        ],
      }),
      makeEntry("analog.chromatic_aberration", "Chromatic Aberration", { shift: 2 }, true, {
        shift: [
          kf("ps-ca-0", 0, 2, "easeInOut"),
          kf("ps-ca-1", 1.25, 12, "easeInOut"),
          kf("ps-ca-2", 2.5, 2, "easeInOut"),
          kf("ps-ca-3", 3.75, 12, "easeInOut"),
          kf("ps-ca-4", 5, 2),
        ],
      }),
    ],
  },
  {
    // Colour channels drift apart and back while the hue wheel makes a full
    // turn — lands where it started, so the clip loops cleanly.
    id: "default-preset-anim-rgb-drift",
    name: "RGB Drift",
    createdAt: new Date().toISOString(),
    stack: [
      makeEntry("color.rgb_shift", "RGB Shift", { r_shift: 0, g_shift: 0, b_shift: 0 }, true, {
        r_shift: [
          kf("rd-rs-0", 0, 0, "easeInOut"),
          kf("rd-rs-1", 1.67, 14, "easeInOut"),
          kf("rd-rs-2", 3.33, -10, "easeInOut"),
          kf("rd-rs-3", 5, 0),
        ],
        b_shift: [
          kf("rd-bs-0", 0, 0, "easeInOut"),
          kf("rd-bs-1", 1.67, -14, "easeInOut"),
          kf("rd-bs-2", 3.33, 10, "easeInOut"),
          kf("rd-bs-3", 5, 0),
        ],
      }),
      makeEntry("analog.hue_shift", "Hue Shift", { degrees: 0 }, true, {
        degrees: [kf("rd-hs-0", 0, 0), kf("rd-hs-1", 5, 360)],
      }),
      makeEntry("analog.chromatic_aberration", "Chromatic Aberration", { shift: 3 }, true, {
        shift: [kf("rd-ca-0", 0, 3, "easeInOut"), kf("rd-ca-1", 2.5, 9, "easeInOut"), kf("rd-ca-2", 5, 3)],
      }),
    ],
  },
  {
    // VHS signal loss: two dropout bursts (~1.5s and ~4s) then recovery.
    // Tracking, tape noise, gaussian noise and brightness dip together.
    id: "default-preset-anim-signal-loss",
    name: "Signal Loss",
    createdAt: new Date().toISOString(),
    stack: [
      makeEntry("analog.vhs", "VHS", { tracking: 0, noise: 0 }, true, {
        tracking: [
          kf("sg-tr-0", 0, 0, "easeInOut"),
          kf("sg-tr-1", 1.5, 0.85, "easeInOut"),
          kf("sg-tr-2", 2.2, 0.1, "easeInOut"),
          kf("sg-tr-3", 4, 0.9, "easeInOut"),
          kf("sg-tr-4", 5, 0),
        ],
        noise: [
          kf("sg-no-0", 0, 0, "easeInOut"),
          kf("sg-no-1", 1.5, 0.7, "easeInOut"),
          kf("sg-no-2", 2.2, 0.05, "easeInOut"),
          kf("sg-no-3", 4, 0.75, "easeInOut"),
          kf("sg-no-4", 5, 0),
        ],
      }),
      makeEntry("noise.gaussian", "Gaussian Noise", { std_dev: 0 }, true, {
        std_dev: [
          kf("sg-gn-0", 0, 0, "easeInOut"),
          kf("sg-gn-1", 1.5, 40, "easeInOut"),
          kf("sg-gn-2", 2.2, 5, "easeInOut"),
          kf("sg-gn-3", 4, 45, "easeInOut"),
          kf("sg-gn-4", 5, 0),
        ],
      }),
      makeEntry("color.brightness_contrast", "Brightness / Contrast", { brightness: 0 }, true, {
        brightness: [
          kf("sg-bc-0", 0, 0, "easeInOut"),
          kf("sg-bc-1", 1.5, -0.25, "easeInOut"),
          kf("sg-bc-2", 2.2, 0, "easeInOut"),
          kf("sg-bc-3", 4, -0.2, "easeInOut"),
          kf("sg-bc-4", 5, 0),
        ],
      }),
    ],
  },
  {
    // Built for the still→clip flow: the datamoshing.bloom layer is
    // video-only, so on a still it warns until "Animate to clip" gives it
    // frames to smear — then the keyframed pixel layers swell over it.
    // Bloom carries no keyframes on purpose: as a temporal effect it would
    // only ever sample them once, at segment start.
    id: "default-preset-anim-mosh-swell",
    name: "Mosh Swell",
    createdAt: new Date().toISOString(),
    stack: [
      makeEntry("datamoshing.bloom", "Bloom", { bloom_size: 8 }),
      makeEntry("glitch.slice_shift", "Slice Shift", { slice_height: 8, max_shift: 0 }, true, {
        max_shift: [kf("ms-ss-0", 0, 0, "easeInOut"), kf("ms-ss-1", 2.5, 30, "easeInOut"), kf("ms-ss-2", 5, 0)],
      }),
      makeEntry("glitch.databend", "Databend", { amount: 0 }, true, {
        amount: [kf("ms-db-0", 0, 0, "easeInOut"), kf("ms-db-1", 2.5, 0.5, "easeInOut"), kf("ms-db-2", 5, 0)],
      }),
      makeEntry("color.rgb_shift", "RGB Shift", { r_shift: 0, g_shift: 0, b_shift: 0 }, true, {
        r_shift: [kf("ms-rs-0", 0, 0, "easeInOut"), kf("ms-rs-1", 2.5, 8, "easeInOut"), kf("ms-rs-2", 5, 0)],
      }),
    ],
  },
];
