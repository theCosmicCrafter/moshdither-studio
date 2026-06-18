/**
 * Shared types for the audio-reactive pipeline.
 * Designed for the "Bake-and-Pass" architecture:
 *   Frontend analyzes audio -> generates AudioBakeData JSON
 *   -> sends to Rust export -> Rust looks up frame index, applies values.
 */

/** Named frequency bands with Hz ranges. */
export interface FrequencyBand {
  name: string;
  minHz: number;
  maxHz: number;
}

/** The standard frequency bands used throughout the app. */
export const STANDARD_BANDS: FrequencyBand[] = [
  { name: 'subBass', minHz: 20, maxHz: 60 },
  { name: 'bass', minHz: 60, maxHz: 250 },
  { name: 'lowMid', minHz: 250, maxHz: 500 },
  { name: 'mid', minHz: 500, maxHz: 2000 },
  { name: 'highMid', minHz: 2000, maxHz: 4000 },
  { name: 'presence', minHz: 4000, maxHz: 6000 },
  { name: 'brilliance', minHz: 6000, maxHz: 20000 },
];

/** Per-frame audio features extracted by Meyda + custom band energy. */
export interface FrameAudioFeatures {
  /** Frame index (0-based). */
  frame: number;
  /** Time in seconds. */
  time: number;

  // --- Meyda features ---
  /** Overall loudness (0-1). */
  rms: number;
  /** Spectral energy sum. */
  energy: number;
  /** "Brightness" of sound — weighted avg frequency (0-1 normalized). */
  spectralCentroid: number;
  /** Noise-like vs tone-like (0-1). */
  spectralFlatness: number;
  /** Frequency below which X% of energy lies (0-1 normalized). */
  spectralRolloff: number;
  /** Rate of spectral change (onset detection). */
  spectralFlux: number;
  /** Zero crossing rate — percussiveness. */
  zcr: number;

  // --- Per-band energy (0-1 normalized) ---
  subBass: number;
  bass: number;
  lowMid: number;
  mid: number;
  highMid: number;
  presence: number;
  brilliance: number;

  // --- Beat detection ---
  /** True if a bass-dominant beat was detected this frame. */
  beatBass: boolean;
  /** True if a mid-dominant beat was detected this frame. */
  beatMid: boolean;
  /** True if a treble-dominant beat was detected this frame. */
  beatTreble: boolean;
  /** Beat confidence / energy at trigger time. */
  beatEnergy: number;

  // --- Volume ---
  /** Overall volume (0-1), derived from RMS + smoothing. */
  volume: number;
}

/**
 * The baked audio data sent to Rust for export.
 * This is the "source of truth" that guarantees preview/export parity.
 */
export interface AudioBakeData {
  /** Video FPS used during baking. */
  fps: number;
  /** Total frame count. */
  totalFrames: number;
  /** Detected BPM (approximate). */
  bpm: number | null;
  /** Per-frame feature array. */
  frames: FrameAudioFeatures[];
}

/** A mapped audio parameter output for a single frame. */
export interface MappedAudioValue {
  /** The raw feature value (0-1). */
  raw: number;
  /** The smoothed/scaled value after attack/decay curves. */
  smoothed: number;
  /** True if this frame had a beat trigger for this channel. */
  triggered: boolean;
}

/** Configuration for mapping an audio feature to a shader uniform. */
export interface AudioMappingConfig {
  /** Which audio feature to read from. */
  source: keyof FrameAudioFeatures | string;
  /** Minimum expected input value. */
  inputMin: number;
  /** Maximum expected input value. */
  inputMax: number;
  /** Output minimum (shader uniform min). */
  outputMin: number;
  /** Output maximum (shader uniform max). */
  outputMax: number;
  /** Attack curve: how fast value rises (0-1, higher = faster). */
  attack: number;
  /** Decay curve: how fast value falls (0-1, higher = slower). */
  decay: number;
  /** Gate mode: only output when above threshold. */
  gateEnabled: boolean;
  /** Gate threshold (0-1). */
  gateThreshold: number;
  /** Invert output. */
  invert: boolean;
}

/** Current state of all mapped audio parameters. */
export interface AudioParameterState {
  /** Named output channels and their current values. */
  channels: Record<string, MappedAudioValue>;
  /** Timestamp of last update. */
  lastUpdate: number;
}
