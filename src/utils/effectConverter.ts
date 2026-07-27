import { shaderRegistry } from "../engine/shaders";
import { EffectShader, RenderPass } from "../engine/webgl2/types";
import { StackEntry } from "../store";

/** Maps a Rust effect ID to its WebGL shader preview equivalent. */
export interface WebGLMapping {
  shaderId: string;
  /** Maps Rust parameter names to WebGL uniform names. */
  paramMap: Record<string, string>;
  /** Optional value transforms: (rustParamName, value) => webglValue */
  transform?: (rustParam: string, value: unknown) => number | number[] | boolean;
  /**
   * If false, the WebGL shader is an approximation of the Rust algorithm and
   * the preview should fall back to CPU rendering for accuracy.
   * Defaults to true (shader accurately represents the Rust effect).
   */
  accurate?: boolean;
}

/**
 * Registry of Rust effect IDs that have a WebGL real-time preview equivalent.
 * Parameter names differ between the Rust CPU backend and WebGL shaders,
 * so we map them here for preview-export parity where possible.
 */
export const rustToWebGL: Record<string, WebGLMapping> = {
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
    // Rust: amplitude in pixels [0, 50]; frequency multiplies pixel-space y [0, 0.2].
    // Shader: uv.x += sin(uv.y * frequency + t) * amount * 0.05, in UV space.
    paramMap: { amplitude: "amount", frequency: "frequency" },
    transform: (k, v) => {
      const n = typeof v === "number" ? v : 0;
      if (k === "amplitude") return n / 50; // px -> normalized shader amount
      return n * 200; // pixel-space frequency -> UV-space cycles
    },
  },
  "pixel_geo.slice_shift_advanced": {
    shaderId: "slice_shift",
    // direction / repeat / mirror have no shader equivalent -> approximate.
    paramMap: { max_slice_size: "sliceHeight", shift_amount: "amount" },
    transform: (k, v) => {
      const n = typeof v === "number" ? v : 0;
      if (k === "shift_amount") return Math.abs(n) / 64;
      return Math.max(1, n);
    },
    accurate: false,
  },
  "pixel_geo.mirror_slices": {
    shaderId: "mirror",
    // Rust exposes only slice_height; the mirror shader exposes only a discrete
    // mode. There is no meaningful mapping between them, so the preview is a
    // fixed approximation and the parameter is honestly reported as unmapped.
    paramMap: {},
    accurate: false,
  },
  "pixel_geo.anaglyph": {
    shaderId: "anaglyph",
    // Rust: shift in pixels [0, 50]. Shader: offset = amount * 0.03 in UV space.
    paramMap: { shift: "amount" },
    transform: (_k, v) => (typeof v === "number" ? v / 30 : 0.2),
  },
  "pixel_geo.block_shift": {
    shaderId: "block_shift",
    // Rust: max_shift in pixels [0, 32]. Shader: amount scales blockSize offsets.
    paramMap: { block_size: "blockSize", max_shift: "amount" },
    transform: (k, v) => {
      const n = typeof v === "number" ? v : 0;
      if (k === "max_shift") return n / 32;
      return Math.max(2, n);
    },
  },
  "pixel_geo.pixel_sort": {
    shaderId: "pixel_sort",
    // Rust threshold is 0-255 luma; shader compares against normalized luma.
    paramMap: { threshold: "threshold" },
    transform: (_k, v) => (typeof v === "number" ? v / 255 : 0.5),
    // Rust defaults auto_threshold on, deriving the threshold from the frame's
    // mean luminance. A fragment shader cannot do that: the mean is a reduction
    // over every pixel, and this chain has no reduction pass -- a fragment only
    // sees its own texel. The shader therefore uses whatever fixed threshold it
    // is given, which is precisely the behaviour that made this effect look like
    // a no-op on dark images.
    //
    // Marked inaccurate so the preview routes to the Rust CPU path and matches
    // the export. Restore an accurate GPU preview by adding a mean-luminance
    // reduction pass, not by dropping auto_threshold.
    accurate: false,
  },

  // Analog
  "analog.scanlines": {
    shaderId: "scanlines",
    // Rust 'gap' is the row period in pixels; the shader's lineCount is the
    // number of half-cycles across the (normalized) height. lineCount = 2H/gap,
    // evaluated at a nominal 480px height so gap=2 lands on the shader default.
    paramMap: { intensity: "amount", gap: "lineCount" },
    transform: (k, v) => {
      const n = typeof v === "number" ? v : 0;
      if (k === "gap") return 480 / Math.max(1, n);
      return n;
    },
  },
  "analog.chromatic_aberration": {
    shaderId: "chromatic_aberration",
    paramMap: { shift: "amount" },
    transform: (_k, v) => (typeof v === "number" ? v / 10 : 1),
  },
  "analog.vhs": {
    shaderId: "vhs_crt",
    // slice_size drives the number of tracking bars in the shader. The Rust
    // effect additionally models tracking_error, scan_curve and
    // glitch_probability, for which vhsCrt.ts declares no uniforms — so the
    // preview is deliberately an approximation of the export.
    paramMap: {
      tracking: "amount",
      noise: "noise",
      head_switching: "headSwitching",
      chroma_delay: "chromaDelay",
      chroma_bleed: "chromaBleed",
      chroma_offset: "chromaOffset",
      slice_size: "bars",
    },
    transform: (k, v) => {
      const n = typeof v === "number" ? v : 0;
      if (k === "slice_size") return Math.max(1, Math.round(24 / Math.max(1, n)));
      return n;
    },
    accurate: false,
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
    // The Rust effect is a full NTSC model (subcarrier, pre-emphasis, chroma
    // phase noise, chroma loss, scanlines). The shader exposes a single
    // 'amount'. Drive it from video_noise as the closest proxy for overall
    // severity and report the preview as approximate.
    paramMap: { video_noise: "amount" },
    transform: (_k, v) => (typeof v === "number" ? Math.min(1, v / 500) : 0.2),
    accurate: false,
  },
  "analog.color_bleed": {
    shaderId: "color_bleed",
    paramMap: { amount: "amount" },
  },
  "analog.ghosting": {
    shaderId: "ghosting",
    // Rust 'intensity' is [0,1] and maps directly. Rust 'offset' (ghost
    // displacement in pixels) has no shader uniform -> approximate.
    paramMap: { intensity: "amount" },
    accurate: false,
  },
  "analog.scan_drift": {
    shaderId: "scan_drift",
    // Rust 'amplitude' is drift in pixels [0, 30]. The shader's spatial
    // frequency is hard-coded at 20.0, so Rust 'frequency' cannot be
    // forwarded -> approximate.
    paramMap: { amplitude: "amount" },
    transform: (_k, v) => (typeof v === "number" ? v / 30 : 0.17),
    accurate: false,
  },

  // Color
  "color.invert": {
    shaderId: "invert",
    paramMap: { intensity: "amount" },
  },
  "color.brightness_contrast": {
    shaderId: "colorGrade",
    paramMap: {
      brightness: "u_brightness",
      contrast: "u_contrast",
      saturation: "u_saturation",
    },
    transform: (k, v) => {
      const n = typeof v === "number" ? v : 0;
      // Rust contrast is [-1, 1] where 0 = no change; shader expects multiplier where 1 = no change
      if (k === "contrast") return n + 1.0;
      // brightness and saturation map directly
      return n;
    },
    // colorGrade.ts has no gamma uniform, so the Rust 'gamma' parameter cannot
    // be previewed -> approximate.
    accurate: false,
  },
  "color.historical_palettes": {
    shaderId: "pass_through",
    paramMap: {},
    accurate: false,
  },
  "color.lut_grading": {
    shaderId: "lut_color_grading",
    // 'lut_path' carries the LUT texture URL; stackToRenderPasses preserves
    // string values verbatim for sampler2D uniforms. The previous key ("tLUT")
    // was not a Rust parameter, so the selected LUT never reached the shader
    // and the preview always used the bundled default lookup.png.
    paramMap: { amount: "amount", lut_path: "tLUT" },
  },
  "color.rgb_shift": {
    shaderId: "rgb_shift",
    // The shader models a single radial shift magnitude plus an angle, so the
    // three independent Rust channel offsets cannot be represented exactly.
    // Drive magnitude from the widest channel separation -> approximate.
    paramMap: { r_shift: "amount" },
    transform: (_k, v) => {
      const shift = typeof v === "number" ? v : 0;
      return Math.min(1, Math.abs(shift) / 20);
    },
    accurate: false,
  },
  "color.channel_swap": {
    shaderId: "channel_swap",
    paramMap: { mode: "mode" },
    transform: (_k, v) => {
      const mode = typeof v === "number" ? v : 0;
      return Math.floor(mode);
    },
  },
  "color.lift_gamma_gain": {
    shaderId: "lift_gamma_gain",
    paramMap: {
      lift_r: "lift",
      lift_g: "lift",
      lift_b: "lift",
      gamma_r: "gamma",
      gamma_g: "gamma",
      gamma_b: "gamma",
      gain_r: "gain",
      gain_g: "gain",
      gain_b: "gain",
      amount: "amount",
    },
    transform: (_k, v) => {
      return typeof v === "number" ? v : 0;
    },
  },

  // Artistic
  "artistic.posterize": {
    shaderId: "posterize",
    // Rust quantises to 'bits' [1, 8] bits per channel; the shader quantises to
    // a level count. levels = 2^bits.
    paramMap: { bits: "levels" },
    transform: (_k, v) => {
      const bits = typeof v === "number" ? v : 3;
      return Math.pow(2, Math.max(1, Math.min(8, Math.round(bits))));
    },
  },
  "artistic.grayscale": {
    shaderId: "grayscale",
    paramMap: { intensity: "amount" },
  },
  "artistic.solarize": {
    shaderId: "solarize",
    paramMap: { threshold: "threshold" },
  },
  "artistic.vaporwave": {
    shaderId: "vaporwave",
    // The Rust effect exposes no parameters; the shader keeps its own default.
    paramMap: {},
  },

  // Noise
  "noise.uniform": {
    shaderId: "noise_grain",
    // Rust 'range' is peak noise amplitude in 0-255 units; the shader adds
    // (rand - 0.5) * amount in normalized colour space.
    paramMap: { range: "amount" },
    transform: (_k, v) => (typeof v === "number" ? v / 255 : 0.08),
  },
  "noise.gaussian": {
    shaderId: "noise_grain",
    // Rust 'std_dev' is in 0-255 units; noise_grain is uniform rather than
    // gaussian, so the distribution differs -> approximate.
    paramMap: { std_dev: "amount" },
    transform: (_k, v) => (typeof v === "number" ? v / 255 : 0.06),
    accurate: false,
  },
  "noise.salt_pepper": {
    shaderId: "noise_grain",
    paramMap: { density: "amount" },
  },
  "noise.fractal": {
    shaderId: "fractal_noise",
    // Rust 'amount' is [0, 10]; the shader expects a normalized blend weight.
    // Rust 'persistence' has no shader uniform (the shader's octave falloff is
    // fixed) and the shader's 'scale' has no Rust counterpart -> approximate.
    paramMap: { amount: "amount", octaves: "octaves" },
    transform: (k, v) => {
      if (k === "octaves") return typeof v === "number" ? Math.floor(v) : 4;
      return typeof v === "number" ? v / 20 : 0.25;
    },
    accurate: false,
  },

  // Dithering
  "dithering.halftone": {
    shaderId: "dither_halftone",
    // The Rust effect exposes dot_size and screen_angle only. The previous
    // col_light / col_dark / col_white keys were not Rust parameters, and the
    // colour branch of the transform below tested uniform names against the
    // rustParam argument, so it could never fire. dither_halftone.ts declares
    // no screen-angle uniform, so rotation is not previewed -> approximate.
    paramMap: { dot_size: "scale" },
    transform: (_k, v) => {
      const dot = typeof v === "number" ? v : 8.0;
      return Math.max(2.0, Math.min(32.0, dot));
    },
    accurate: false,
  },
  "dithering.bayer": {
    shaderId: "bayer_dither",
    paramMap: { matrix_size: "scale" },
    // matrix_size is an INDEX into [2,4,8,16], not the size -- every Select in
    // this app sends the option index (ParameterPanel.tsx). The index is resolved
    // to the actual matrix size before being passed to the shader.
    transform: (_k, v) => {
      const sizes = [2, 4, 8, 16];
      const i = typeof v === "number" && Number.isInteger(v) ? v : 1;
      return sizes[i] ?? 4;
    },
    // The shader now implements the same per-pixel Bayer threshold matrix as the
    // Rust backend, so the GPU preview matches the export.
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
    // The Rust effect exposes no parameters; the shader keeps its own default.
    paramMap: {},
  },
  "dithering.blue_noise": {
    shaderId: "blue_noise_dither",
    paramMap: { strength: "amount" },
    // Shader uses Bayer 8x8, not real blue noise texture. Approximate.
    accurate: false,
  },
  // Error diffusion algorithms — cannot be done in parallel pixel shaders.
  // Error diffusion is inherently sequential — a pixel's quantisation error is
  // pushed into neighbours that have not been processed yet — so no fragment
  // shader can implement it. These map to pass_through and rely on
  // accurate: false to route the preview through the Rust CPU backend, the same
  // arrangement as dithering.error_diffusion_variants below.
  "dithering.atkinson": {
    shaderId: "pass_through",
    paramMap: {},
    accurate: false,
  },
  "dithering.burkes": {
    shaderId: "pass_through",
    paramMap: {},
    accurate: false,
  },
  "dithering.floyd_steinberg": {
    shaderId: "pass_through",
    paramMap: {},
    accurate: false,
  },
  "dithering.jarvis_judice_ninke": {
    shaderId: "pass_through",
    paramMap: {},
    accurate: false,
  },
  "dithering.sierra": {
    shaderId: "pass_through",
    paramMap: {},
    accurate: false,
  },
  "dithering.stucki": {
    shaderId: "pass_through",
    paramMap: {},
    accurate: false,
  },
  "dithering.riemersma": {
    shaderId: "pass_through",
    paramMap: {},
    accurate: false,
  },
  // Error diffusion variants — Rust-only, no WebGL shader can do error diffusion
  "dithering.error_diffusion_variants": {
    shaderId: "pass_through",
    // pass_through declares no uniforms; 'algorithm' and 'levels' were being
    // written into a uniform that does not exist. Export applies them.
    paramMap: {},
    accurate: false,
  },
  // Ordered dither variants — Rust-only (various ordered matrices)
  "dithering.ordered_variants": {
    shaderId: "pass_through",
    paramMap: {},
    accurate: false,
  },
  // Line screen — Rust-only (spiral halftone screen)
  "dithering.line_screen": {
    shaderId: "pass_through",
    paramMap: {},
    accurate: false,
  },
  // Custom matrix — Rust-only (user-defined dithering matrix)
  "dithering.custom_matrix": {
    shaderId: "pass_through",
    paramMap: {},
    accurate: false,
  },
  // K-means quantization — Rust-only (clustering-based color reduction)
  "dithering.kmeans": {
    shaderId: "pass_through",
    paramMap: {},
    accurate: false,
  },
  // Auto palette — Rust-only (MMCQ color quantization)
  "dithering.auto_palette": {
    shaderId: "pass_through",
    paramMap: {},
    accurate: false,
  },

  // Glitch — byte-level effects operate on decoded RGBA pixels, not encoded
  // file bytes. The WebGL shaders are visual approximations, not real corruption.
  "glitch.slice_shift": {
    shaderId: "slice_shift",
    // Rust 'max_shift' is a pixel displacement in [0, 100]; the shader's
    // 'amount' is a normalized displacement scale.
    paramMap: { slice_height: "sliceHeight", max_shift: "amount" },
    transform: (k, v) => {
      const n = typeof v === "number" ? v : 0;
      if (k === "max_shift") return Math.min(1, n / 100);
      return Math.max(1, n);
    },
  },
  "glitch.databend": {
    shaderId: "databend",
    paramMap: { amount: "amount" },
    // Rust does byte-level corruption; shader does row shift. Fake.
    accurate: false,
  },
  "glitch.jpeg_quantize": {
    shaderId: "jpeg_quantize",
    paramMap: { quality: "quality" },
    transform: (_k, v) => {
      const q = typeof v === "number" ? v : 50;
      return q / 100;
    },
    // Shader approximates JPEG quantization, not real DCT. Approximate.
    accurate: false,
  },
  "glitch.byte_flip": {
    shaderId: "byte_flip",
    paramMap: { amount: "amount" },
    // Rust XORs random bytes; shader does row-based color inversion. Fake.
    accurate: false,
  },
  "glitch.byte_zero": {
    shaderId: "byte_zero",
    paramMap: { amount: "amount" },
    accurate: false,
  },
  "glitch.byte_insert": {
    shaderId: "byte_insert",
    paramMap: { amount: "amount" },
    accurate: false,
  },
  "glitch.byte_reverse": {
    shaderId: "byte_reverse",
    // Rust exposes 'chunk_size' only, which byte_reverse.ts does not model.
    paramMap: {},
    accurate: false,
  },
  "glitch.sorting_glitch": {
    shaderId: "sortingGlitch",
    // Rust also exposes u_sort_mode ("brightness" | …); sortingGlitch.ts sorts
    // by luma only and declares no mode uniform -> approximate.
    paramMap: {
      u_threshold: "u_threshold",
      u_intensity: "u_intensity",
      u_direction: "u_direction",
    },
    accurate: false,
  },
  "glitch.macroblock_glitch": {
    shaderId: "macroblockGlitch",
    // 'u_blockSize' is a shader-only uniform with no Rust counterpart; it keeps
    // its declared default rather than being mapped from a non-existent param.
    paramMap: {
      u_intensity: "u_intensity",
      u_seed: "u_seed",
    },
  },
  "glitch.crc_mismatch": {
    shaderId: "slice_shift",
    paramMap: { scanline_interval: "sliceHeight", shift_amount: "amount" },
    transform: (_k, v) => (typeof v === "number" ? v / 100 : 0.2),
    // Mapped to slice_shift shader — completely different algorithm. Fake.
    accurate: false,
  },
  "glitch.png_chunk": {
    shaderId: "databend",
    paramMap: { corruption: "amount" },
    transform: (_k, v) => (typeof v === "number" ? v / 100 : 0.3),
    // Rust simulates PNG chunk corruption on decoded pixels. Fake.
    accurate: false,
  },
  "glitch.edge_stretch": {
    shaderId: "pass_through",
    paramMap: {},
    accurate: false,
  },

  // Audio-Reactive
  "audio_reactive.bass_pulse": {
    shaderId: "audioBassPulse",
    // Rust 'sensitivity' is a multiplier in [0.1, 5] and the shader's
    // u_intensity is the same kind of multiplier, so it passes through
    // unscaled. The previous /100 divisor pinned the preview at ~0.01 and made
    // the effect invisible. Rust 'block_size' has no shader uniform.
    paramMap: { sensitivity: "u_intensity" },
    transform: (_k, v) => (typeof v === "number" ? v : 1),
    accurate: false,
  },
  "audio_reactive.beat_glitch": {
    shaderId: "audioGlitchBeat",
    paramMap: { corruption: "u_intensity", trigger_threshold: "u_sliceHeight" },
    transform: (_k, v) => (typeof v === "number" ? v / 100 : 0.5),
  },
  "audio_reactive.spectral_shift": {
    shaderId: "audioSpectralShift",
    paramMap: { shift_amount: "u_intensity" },
    transform: (_k, v) => (typeof v === "number" ? v / 100 : 0.5),
  },
  "audio_reactive.audio_dither": {
    shaderId: "audioReactiveDither",
    paramMap: {
      base_threshold: "u_threshold",
      modulation: "u_intensity",
      levels: "u_levels",
    },
    transform: (rustParam, v) => {
      if (rustParam === "base_threshold") return typeof v === "number" ? v / 255.0 : 0.5;
      if (rustParam === "modulation") return typeof v === "number" ? v : 0.5;
      if (rustParam === "levels") return typeof v === "number" ? v : 4;
      return typeof v === "number" ? v : 0;
    },
  },

  // Datamoshing — ALL effects are pixel-level simulations, not real codec-level
  // datamoshing (I-frame removal, P-frame duplication, motion vector manipulation).
  // The Rust effects operate on decoded RGBA frames, not on the video bitstream.
  // Real datamoshing requires FFglitch/FFedit or custom codec parsing. All marked
  // accurate: false so the preview uses the Rust CPU backend for best results.
  "datamoshing.classic": {
    shaderId: "temporalDatamoshing",
    paramMap: { chunk_size: "u_blockSize", repeats: "u_intensity" },
    transform: (_k, v) => {
      if (_k === "u_blockSize") return typeof v === "number" ? v : 16;
      return typeof v === "number" ? v / 10 : 0.2;
    },
    accurate: false,
  },
  "datamoshing.bloom": {
    shaderId: "temporalDatamoshing",
    paramMap: { bloom_size: "u_blockSize" },
    transform: (_k, v) => {
      if (_k === "u_blockSize") return typeof v === "number" ? v : 32;
      return 0.3;
    },
    accurate: false,
  },
  "datamoshing.buffer": {
    shaderId: "temporalDatamoshing",
    paramMap: { buffer_size: "u_blockSize", feedback: "u_intensity" },
    transform: (_k, v) => {
      if (_k === "u_blockSize") return typeof v === "number" ? v : 16;
      return typeof v === "number" ? v / 100 : 0.3;
    },
    accurate: false,
  },
  "datamoshing.stop": {
    shaderId: "temporalDatamoshing",
    paramMap: { threshold: "u_intensity", n_frames: "u_blockSize" },
    transform: (_k, v) => {
      if (_k === "u_blockSize") return typeof v === "number" ? v * 4 : 16;
      return typeof v === "number" ? v / 100 : 0.2;
    },
    accurate: false,
  },
  // "datamoshing.repeat" was removed 2026-07-26 -- it was the same algorithm as
  // datamoshing.classic with renamed parameters. The Rust registry aliases the
  // old ID to classic so existing projects still render, and classic accepts
  // `series_size`/`repeat_count` as parameter aliases. No mapping is needed
  // here: an aliased ID never reaches this table, because the effect list the
  // UI builds comes from the registry, which does not advertise aliases.
  "datamoshing.shuffle": {
    shaderId: "temporalDatamoshing",
    paramMap: { chunk_size: "u_blockSize" },
    transform: (_k, v) => {
      if (_k === "u_blockSize") return typeof v === "number" ? v : 16;
      return 0.4;
    },
    accurate: false,
  },
  "datamoshing.delay": {
    shaderId: "temporalDatamoshing",
    paramMap: { delay_frames: "u_blockSize" },
    transform: (_k, v) => {
      if (_k === "u_blockSize") return typeof v === "number" ? v * 4 : 16;
      return 0.3;
    },
    accurate: false,
  },
  "datamoshing.mirror": {
    shaderId: "mirror",
    paramMap: {},
    transform: () => 2,
    accurate: false,
  },
  "datamoshing.zoom": {
    shaderId: "transform",
    paramMap: { intensity: "u_scaleX" },
    transform: (_k, v) => {
      const i = typeof v === "number" ? v : 1;
      return 1.0 + i / 10;
    },
    accurate: false,
  },
  "datamoshing.shear": {
    shaderId: "transform",
    paramMap: { intensity: "u_rotation" },
    transform: (_k, v) => (typeof v === "number" ? v / 10 : 0.1),
    accurate: false,
  },
  "datamoshing.vibrate": {
    shaderId: "motionVectorGlitch",
    paramMap: { randomness: "u_intensity" },
    transform: (_k, v) => (typeof v === "number" ? v / 100 : 0.2),
    accurate: false,
  },
  "datamoshing.iframe_removal": {
    shaderId: "iframeRemoval",
    paramMap: { interval: "u_intensity" },
    transform: (_k, v) => (typeof v === "number" ? v / 10 : 0.3),
    accurate: false,
  },
  "datamoshing.iframe_removal_advanced": {
    shaderId: "iframeRemoval",
    paramMap: { threshold: "u_intensity", rate: "u_blockSize" },
    transform: (_k, v) => {
      if (_k === "u_blockSize") return typeof v === "number" ? v * 4 : 16;
      return typeof v === "number" ? v / 100 : 0.3;
    },
    accurate: false,
  },
  "datamoshing.rise": {
    shaderId: "temporalDatamoshing",
    paramMap: { start_drop: "u_intensity" },
    transform: (_k, v) => (typeof v === "number" ? v / 100 : 0.2),
    accurate: false,
  },
  "datamoshing.motion_transfer": {
    shaderId: "motionVectorGlitch",
    paramMap: { strength: "u_intensity", block_size: "u_scale" },
    transform: (_k, v) => {
      if (_k === "u_scale") return typeof v === "number" ? v / 10 : 1;
      return typeof v === "number" ? v / 100 : 0.3;
    },
    accurate: false,
  },
  "datamoshing.optical_flow": {
    shaderId: "motionVectorGlitch",
    paramMap: { warp_strength: "u_intensity", alpha: "u_scale" },
    transform: (_k, v) => {
      if (_k === "u_scale") return typeof v === "number" ? v : 1;
      return typeof v === "number" ? v / 10 : 0.2;
    },
    accurate: false,
  },
  "datamoshing.profile_glitch": {
    shaderId: "temporalDatamoshing",
    paramMap: { intensity: "u_intensity", drop_interval: "u_blockSize" },
    transform: (_k, v) => {
      if (_k === "u_blockSize") return typeof v === "number" ? v * 4 : 16;
      return typeof v === "number" ? v / 100 : 0.4;
    },
    accurate: false,
  },
  "datamoshing.profile_bloom": {
    shaderId: "temporalDatamoshing",
    paramMap: { bloom_size: "u_blockSize", repeat_count: "u_intensity" },
    transform: (_k, v) => {
      if (_k === "u_blockSize") return typeof v === "number" ? v : 32;
      return typeof v === "number" ? v / 10 : 0.3;
    },
    accurate: false,
  },
  "datamoshing.profile_smear": {
    shaderId: "temporalDatamoshing",
    paramMap: { strength: "u_intensity", drop_interval: "u_blockSize" },
    transform: (_k, v) => {
      if (_k === "u_blockSize") return typeof v === "number" ? v * 4 : 16;
      return typeof v === "number" ? v / 100 : 0.5;
    },
    accurate: false,
  },
  "datamoshing.profile_extreme": {
    shaderId: "temporalDatamoshing",
    paramMap: { aggression: "u_intensity" },
    transform: (_k, v) => (typeof v === "number" ? v / 100 : 0.8),
    accurate: false,
  },
  "datamoshing.profile_rainbow": {
    shaderId: "temporalDatamoshing",
    paramMap: { hue_shift: "u_intensity", drop_interval: "u_blockSize" },
    transform: (_k, v) => {
      if (_k === "u_blockSize") return typeof v === "number" ? v * 4 : 16;
      return typeof v === "number" ? v / 360 : 0.3;
    },
    accurate: false,
  },

  // Segmentation
  // NOTE: this id has no `<category>.` prefix, unlike every other effect.
  // It is kept as-is because saved projects and presets serialize effect ids
  // verbatim; renaming it to `segmentation.mask_isolate` needs a migration.
  mask_isolate: {
    shaderId: "pass_through",
    // The WebGL path applies masks via the maskBlend pass rather than by
    // isolating inside this shader, so the preview cannot represent 'invert'.
    paramMap: {},
    accurate: false,
  },

  // Composite (Rust-only, requires external overlay image — pass-through for preview)
  "composite.overlay": {
    shaderId: "pass_through",
    // Compositing a second image is not implemented in the WebGL path, so the
    // preview is a no-op while the export applies opacity and blend_mode.
    // Marked approximate so the viewport badge tells the user that.
    paramMap: {},
    accurate: false,
  },

  // Datamoshing — temporal/video-only effects with no meaningful single-frame preview
  "datamoshing.frame_reverse": {
    shaderId: "pass_through",
    paramMap: {},
    accurate: false,
  },
  "datamoshing.frame_sort_by_size": {
    shaderId: "pass_through",
    paramMap: {},
    accurate: false,
  },
  "datamoshing.frame_hold": {
    shaderId: "pass_through",
    paramMap: {},
    accurate: false,
  },
  "datamoshing.combine": {
    shaderId: "pass_through",
    paramMap: {},
    accurate: false,
  },
  "datamoshing.cross_video": {
    shaderId: "pass_through",
    paramMap: {},
    accurate: false,
  },

  // Composition guides (safe area, rule of thirds, crosshairs, pixel grid) are
  // no longer effects. They are viewport furniture drawn by ViewportGuides.tsx
  // and never reach the export stack — see migrateOverlayGuides.ts for the
  // migration that strips them out of stacks saved while they were effects.
};

/**
 * Convert the zustand effect stack into WebGL render passes for real-time preview.
 * Skips disabled effects and effects without a WebGL equivalent.
 */
export function stackToRenderPasses(
  stack: StackEntry[],
  time?: number,
  activeMask?: string | null,
  sam3Masks?: string[]
): RenderPass[] {
  const passes: RenderPass[] = [];

  for (const entry of stack) {
    if (!entry.enabled) continue;

    const mapping = rustToWebGL[entry.effectId];
    if (!mapping) continue;

    if (!shaderRegistry.has(mapping.shaderId)) continue;

    // Resolve mask for this effect — prefer snapshotted maskB64
    const maskB64 =
      entry.maskB64 ?? resolveMaskId(entry.maskId, activeMask ?? null, sam3Masks ?? []);

    const uniformGroups: Record<string, { rustParam: string; value: unknown }[]> = {};
    for (const [rustParam, webglUniform] of Object.entries(mapping.paramMap)) {
      const rawValue = entry.params[rustParam];
      if (rawValue === undefined) continue;
      if (!uniformGroups[webglUniform]) uniformGroups[webglUniform] = [];
      uniformGroups[webglUniform].push({ rustParam, value: rawValue });
    }

    const uniforms: Record<string, number | number[] | boolean | string> = {};
    for (const [webglUniform, group] of Object.entries(uniformGroups)) {
      if (group.length === 1) {
        const { rustParam, value } = group[0];
        if (mapping.transform) {
          uniforms[webglUniform] = mapping.transform(rustParam, value);
        } else if (typeof value === "string") {
          // Preserve string values (e.g., sampler2D texture URLs).
          uniforms[webglUniform] = value;
        } else {
          const num = typeof value === "number" ? value : Number(value);
          uniforms[webglUniform] = Number.isNaN(num) ? 0 : num;
        }
      } else {
        // Multiple params map to same uniform: try to combine into vec3
        const r = group.find((g) => g.rustParam.endsWith("_r"));
        const g_ = group.find((g) => g.rustParam.endsWith("_g"));
        const b = group.find((g) => g.rustParam.endsWith("_b"));
        if (r && g_ && b) {
          const getVal = (item: typeof r) => {
            const v = item.value;
            return typeof v === "number" ? v : Number(v);
          };
          uniforms[webglUniform] = [getVal(r), getVal(g_), getVal(b)];
        } else if (group[0].value !== undefined && typeof group[0].value === "string") {
          // String values are not combined.
          uniforms[webglUniform] = group[0].value as string;
        } else {
          // Fallback: use last value
          const last = group[group.length - 1];
          const num = typeof last.value === "number" ? last.value : Number(last.value);
          uniforms[webglUniform] = Number.isNaN(num) ? 0 : num;
        }
      }
    }

    // Provide default values for sampler2D uniforms not set by param mapping
    const shader = shaderRegistry.get(mapping.shaderId);
    if (shader) {
      for (const u of shader.uniforms) {
        if (u.type === "sampler2D" && uniforms[u.name] === undefined) {
          uniforms[u.name] = u.default as string;
        }
      }
      // Inject u_time for animated shaders
      if (shader.uniforms.some((u) => u.name === "u_time") && uniforms["u_time"] === undefined) {
        uniforms["u_time"] = time ?? 0;
      }
    }

    passes.push({
      shaderId: mapping.shaderId,
      inputTexture: passes.length === 0 ? "source" : `pass_${passes.length - 1}`,
      outputFramebuffer: `pass_${passes.length}`,
      uniforms,
      maskB64: maskB64 ?? undefined,
      maskMode: entry.maskMode ?? "inside",
    });
  }

  return passes;
}

/** Build a Map of shaders needed for the given passes, including maskBlend if any pass has a mask. */
export function buildShaderMap(passes: RenderPass[]): Map<string, EffectShader> {
  const map = new Map<string, EffectShader>();
  for (const pass of passes) {
    const shader = shaderRegistry.get(pass.shaderId);
    if (shader && !map.has(pass.shaderId)) {
      map.set(pass.shaderId, shader);
    }
    // EffectChain.render() dynamically inserts maskBlend passes after any pass with a mask.
    // Pre-register the maskBlend shader so it's available when those expanded passes run.
    if (pass.maskB64 && !map.has("maskBlend")) {
      const maskShader = shaderRegistry.get("maskBlend");
      if (maskShader) map.set("maskBlend", maskShader);
    }
  }
  return map;
}

/** Whether a Rust effect has a WebGL real-time preview equivalent. */
export function hasWebGLPreview(rustEffectId: string): boolean {
  const mapping = rustToWebGL[rustEffectId];
  return !!mapping && shaderRegistry.has(mapping.shaderId);
}

/**
 * Check if any enabled effect in the stack requires CPU preview rendering.
 * Returns true if either:
 * - an effect has NO WebGL mapping at all (Rust-only effect with no shader), or
 * - an effect is mapped but marked `accurate: false`, meaning its shader is an
 *   approximation (or a pass_through stand-in) that would misrepresent output.
 *
 * In both cases the preview is rendered by the Rust CPU backend so that what
 * the user sees matches what export writes.
 *
 * Note this is stack-level: one CPU-only effect sends the whole stack through
 * the CPU path, including effects that do have accurate shaders.
 */
export function stackRequiresCpuPreview(stack: StackEntry[]): boolean {
  return stack.some((e) => {
    if (!e.enabled) return false;
    const mapping = rustToWebGL[e.effectId];
    if (!mapping) return true; // No WebGL mapping → CPU only
    if (mapping.accurate === false) return true; // Approximate WebGL shader → use CPU preview for exact output match!
    return false;
  });
}

/** Check if any effect in the stack has an approximate WebGL shader (accurate: false).
 *  Used to show a "preview approximate" badge to the user. */
export function stackHasApproximatePreview(stack: StackEntry[]): boolean {
  return stack.some((e) => {
    if (!e.enabled) return false;
    const mapping = rustToWebGL[e.effectId];
    if (!mapping) return false;
    return mapping.accurate === false;
  });
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
    const idx = Number.parseInt(maskId.replace("sam3-", ""), 10);
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
  mask_mode?: string;
}> {
  return stack
    .filter((e) => e.enabled)
    .map((e) => ({
      effect_id: e.effectId,
      params: { ...e.params, ...(time !== undefined ? { time } : {}) },
      // Use snapshotted maskB64 if available; fall back to live resolution
      mask_b64: e.maskB64 ?? resolveMaskId(e.maskId, activeMask, sam3Masks),
      mask_mode: e.maskMode ?? "inside",
    }));
}
