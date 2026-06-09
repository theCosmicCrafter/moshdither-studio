import type { IconName } from "../components/atoms/Icon";
import type { Keyframe } from "./keyframeTypes";

export type EffectType =
  | "dither"
  | "halftone"
  | "analog-glitch"
  | "datamosh"
  | "epsilon-glow"
  | "crt-phosphor"
  | "temporal-noise";

export type EffectCategory = "python" | "webgl";

// ---------------------------------------------------------------------------
// Discriminated Union for Effect Parameters
// ---------------------------------------------------------------------------

export interface DitherParams {
  ditherMode:
    | "none"
    | "bayer"
    | "error_diffusion"
    | "riemersma"
    | "blue_noise"
    | "IGN"
    | "polka_dot"
    | "wavelet"
    | "adaptive_variance"
    | "perceptual"
    | "hybrid"
    | "halftone"
    | "ostromoukhov";
  paletteSource: "kmeans" | "median_cut" | "uniform" | "bw" | "gameboy" | "cga";
  numColors: number;
  useGamma: boolean;
  // bayer-specific
  matrixSize?: number | string;
  // error_diffusion-specific
  errorDiffusionVariant?: string;
  serpentine?: boolean;
  // IGN-specific
  scale?: number;
  seed?: number;
  // blue_noise-specific
  // (reuses matrixSize, seed)
  // polka_dot-specific
  dotSize?: number;
  gamma?: number;
  // wavelet-specific
  wavelet?: string;
  subbandQuant?: number;
  // adaptive_variance-specific
  varThreshold?: number;
  windowRadius?: number;
  // hybrid-specific
  lumFactor?: number;
  colFactor?: number;
  // halftone-specific
  angle?: number;
  dotGain?: number;
  minDotSize?: number;
  maxDotSize?: number;
  shape?: string;
  sharpness?: number;
}

export interface HalftoneParams {
  dotSize: number;
  angleC: number;
  angleM: number;
  angleY: number;
  angleK: number;
}

export interface AnalogGlitchParams {
  intensity: number;
}

export interface DatamoshParams {
  intensity: number;
  mode: string;
}

export interface EpsilonGlowParams {
  intensity: number;
}

export interface CrtPhosphorParams {
  intensity: number;
}

export interface TemporalNoiseParams {
  intensity: number;
  noiseScale: number;
  numColors: number;
}

export type EffectParams =
  | ({ type: "dither" } & DitherParams)
  | ({ type: "halftone" } & HalftoneParams)
  | ({ type: "analog-glitch" } & AnalogGlitchParams)
  | ({ type: "datamosh" } & DatamoshParams)
  | ({ type: "epsilon-glow" } & EpsilonGlowParams)
  | ({ type: "crt-phosphor" } & CrtPhosphorParams)
  | ({ type: "temporal-noise" } & TemporalNoiseParams);

// ---------------------------------------------------------------------------
// Effect Mask & Core Effect Interface
// ---------------------------------------------------------------------------

export interface EffectMask {
  type: "none" | "brush" | "radial" | "linear";
  brushData?: string; // Base64 PNG mask drawn by user
  radialCenter?: { x: number; y: number }; // [0..1] coordinates
  radialRadius?: number; // [0..1] radius
  linearAngle?: number; // degrees [0..360]
  linearOffset?: number; // [-1..1] offset
  invert?: boolean;
}

export type BlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "color-burn"
  | "hard-light"
  | "soft-light"
  | "difference"
  | "exclusion"
  | "hue"
  | "saturation"
  | "color"
  | "luminosity";

export const BLEND_MODES: BlendMode[] = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
  "hue",
  "saturation",
  "color",
  "luminosity",
];

export const BLEND_MODE_MAP: Record<BlendMode, number> = {
  normal: 0,
  multiply: 1,
  screen: 2,
  overlay: 3,
  darken: 4,
  lighten: 5,
  "color-dodge": 6,
  "color-burn": 7,
  "hard-light": 8,
  "soft-light": 9,
  difference: 10,
  exclusion: 11,
  hue: 12,
  saturation: 13,
  color: 14,
  luminosity: 15,
};

export interface Effect {
  id: string;
  name: string;
  type: EffectType;
  enabled: boolean;
  // Params are runtime-dynamic; use the discriminated union helpers
  // for type-safe access in new code.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: Record<string, any>;
  startTime?: number;
  endTime?: number;
  mask?: EffectMask;
  /** Layer opacity 0..1. Default 1.0. */
  opacity?: number;
  /** Blend mode when compositing onto previous layer. Default "normal". */
  blendMode?: BlendMode;
  /** Keyframe tracks per parameter key. */
  keyframes?: Record<string, Keyframe[]>;
}

// ---------------------------------------------------------------------------
// Effect Metadata Registry
// ---------------------------------------------------------------------------

interface EffectMeta {
  name: string;
  icon: IconName;
  category: EffectCategory;
  defaultParams: Record<string, unknown>;
}

export const EFFECT_REGISTRY: Record<EffectType, EffectMeta> = {
  dither: {
    name: "Advanced Dither",
    icon: "dither",
    category: "webgl",
    defaultParams: {
      ditherMode: "atkinson",
      paletteSource: "kmeans",
      numColors: 16,
      useGamma: false,
    },
  },
  halftone: {
    name: "CMYK Halftone",
    icon: "halftone",
    category: "webgl",
    defaultParams: {
      dotSize: 4,
      angleC: 15,
      angleM: 75,
      angleY: 0,
      angleK: 45,
    },
  },
  "analog-glitch": {
    name: "Analog Glitch",
    icon: "mosh",
    category: "webgl",
    defaultParams: { intensity: 0.5 },
  },
  datamosh: {
    name: "Classic Datamosh",
    icon: "mosh",
    category: "python",
    defaultParams: { intensity: 0.8, mode: "classic" },
  },
  "epsilon-glow": {
    name: "Epsilon Glow",
    icon: "glow",
    category: "webgl",
    defaultParams: { intensity: 0.5 },
  },
  "crt-phosphor": {
    name: "CRT Monitor",
    icon: "crt",
    category: "webgl",
    defaultParams: { intensity: 0.5 },
  },
  "temporal-noise": {
    name: "Temporal Noise",
    icon: "refresh",
    category: "webgl",
    defaultParams: { intensity: 0.15, noiseScale: 1.0, numColors: 0 },
  },
};

export const ALL_EFFECT_TYPES: EffectType[] = Object.keys(
  EFFECT_REGISTRY,
) as EffectType[];

export const WEBGL_EFFECT_TYPES: ReadonlySet<EffectType> = new Set(
  ALL_EFFECT_TYPES.filter((t) => EFFECT_REGISTRY[t].category === "webgl"),
);

export const PYTHON_EFFECT_TYPES: ReadonlySet<EffectType> = new Set(
  ALL_EFFECT_TYPES.filter((t) => EFFECT_REGISTRY[t].category === "python"),
);

export function isWebGLEffect(type: EffectType): boolean {
  return WEBGL_EFFECT_TYPES.has(type);
}

export function isPythonEffect(type: EffectType): boolean {
  return PYTHON_EFFECT_TYPES.has(type);
}

export function getEffectDefaults(type: EffectType): EffectMeta {
  return EFFECT_REGISTRY[type];
}

/**
 * Narrow an Effect to its discriminated params type.
 * Useful in switch statements for type-safe parameter access.
 */
export function getEffectParams(effect: Effect): EffectParams | null {
  switch (effect.type) {
    case "dither":
      return { type: "dither", ...(effect.params as unknown as DitherParams) };
    case "halftone":
      return {
        type: "halftone",
        ...(effect.params as unknown as HalftoneParams),
      };
    case "analog-glitch":
      return {
        type: "analog-glitch",
        ...(effect.params as unknown as AnalogGlitchParams),
      };
    case "datamosh":
      return {
        type: "datamosh",
        ...(effect.params as unknown as DatamoshParams),
      };
    case "epsilon-glow":
      return {
        type: "epsilon-glow",
        ...(effect.params as unknown as EpsilonGlowParams),
      };
    case "crt-phosphor":
      return {
        type: "crt-phosphor",
        ...(effect.params as unknown as CrtPhosphorParams),
      };
    case "temporal-noise":
      return {
        type: "temporal-noise",
        ...(effect.params as unknown as TemporalNoiseParams),
      };
    default:
      return null;
  }
}
