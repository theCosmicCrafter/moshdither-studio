/**
 * AudioFeatureExtractor — Offline audio analysis producing an AudioManifest.
 *
 * Uses Meyda.extract() with `powerSpectrum` for REAL FFT-based band energies
 * (replacing the previous approximate `estimateSpectrum` method).
 *
 * Also computes high-level primitives (impact, fluidity, brightness, sharpness,
 * texture) that effects can consume as simple [0,1] control signals.
 *
 * Process:
 *   1. Decode audio into an AudioBuffer
 *   2. Detect BPM via web-audio-beat-detector
 *   3. Step through the buffer in frame-sized chunks at video FPS
 *   4. Call Meyda.extract() with powerSpectrum for real frequency data
 *   5. Compute per-band energies from the real power spectrum
 *   6. Run beat detection + onset classification
 *   7. Compute high-level primitives
 *   8. Output AudioManifest JSON (cached by content hash)
 */

import Meyda from "meyda";
import { guess as detectBpm } from "web-audio-beat-detector";
import type {
  AudioBakeData,
  AudioManifest,
  FrameAudioFeatures,
  ManifestFrame,
  ManifestProgressCallback,
} from "./types";
import { MANIFEST_SCHEMA_VERSION, STANDARD_BANDS } from "./types";

export interface ExtractionOptions {
  /** Video FPS. Default 30. */
  fps?: number;
  /** Meyda buffer size. Default 512. */
  bufferSize?: number;
  /** Audio sample rate. Default = buffer.sampleRate. */
  sampleRate?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Compute a simple hash from an ArrayBuffer for manifest caching. */
async function computeHash(buffer: ArrayBuffer): Promise<string> {
  if (crypto?.subtle) {
    const hash = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 16);
  }
  // Fallback: simple checksum
  let sum = 0;
  const view = new Uint8Array(buffer);
  for (let i = 0; i < view.length; i += 4096) {
    sum = (sum + view[i]) % 0xffffffff;
  }
  return sum.toString(16);
}

function mixToMono(buffer: AudioBuffer): Float32Array {
  const numChannels = buffer.numberOfChannels;
  const len = buffer.length;
  const mono = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    let sum = 0;
    for (let ch = 0; ch < numChannels; ch++) {
      sum += buffer.getChannelData(ch)[i];
    }
    mono[i] = sum / numChannels;
  }
  return mono;
}

/** Compute per-band energies from a real power spectrum. */
function calcBandEnergiesFromPower(
  powerSpectrum: Float32Array,
  nyquist: number
): Record<string, number> {
  const binCount = powerSpectrum.length;
  const binToHz = (i: number) => (i * nyquist) / (binCount - 1 || 1);
  const bands: Record<string, number> = {};
  for (const band of STANDARD_BANDS) {
    let sum = 0;
    let count = 0;
    for (let i = 0; i < binCount; i++) {
      const hz = binToHz(i);
      if (hz >= band.minHz && hz <= band.maxHz) {
        sum += powerSpectrum[i];
        count++;
      }
    }
    // Normalize: power spectrum values can be large, scale to 0-1
    bands[band.name] = count > 0 ? Math.min(sum / (count * 100), 1) : 0;
  }
  return bands;
}

/** Spectral flux from real power spectra. */
function calcSpectralFlux(curr: Float32Array, prev: Float32Array | null): number {
  if (!prev || prev.length !== curr.length) return 0;
  let flux = 0;
  for (let i = 0; i < curr.length; i++) {
    const diff = curr[i] - prev[i];
    if (diff > 0) flux += diff * diff;
  }
  return Math.min(Math.sqrt(flux / curr.length) * 5, 1);
}

/** Spectral bandwidth (spread around centroid). */
function calcSpectralBandwidth(
  powerSpectrum: Float32Array,
  centroid: number,
  nyquist: number
): number {
  const binCount = powerSpectrum.length;
  if (binCount === 0) return 0;
  const binToHz = (i: number) => (i * nyquist) / (binCount - 1 || 1);
  let weightedSpread = 0;
  let totalPower = 0;
  for (let i = 0; i < binCount; i++) {
    const hz = binToHz(i);
    weightedSpread += powerSpectrum[i] * (hz - centroid) ** 2;
    totalPower += powerSpectrum[i];
  }
  if (totalPower === 0) return 0;
  return Math.min(Math.sqrt(weightedSpread / totalPower) / nyquist, 1);
}

// ─── Beat Detection ───────────────────────────────────────────────────────

interface BeatState {
  threshold: number;
  lastBeatFrame: number;
}

interface BeatResult {
  bass: boolean;
  mid: boolean;
  treble: boolean;
  energy: number;
  newThreshold: number;
}

function detectBeat(
  bassEnergy: number,
  midEnergy: number,
  trebleEnergy: number,
  frame: number,
  state: BeatState,
  cooldownFrames: number,
  decay: number
): BeatResult {
  if (frame - state.lastBeatFrame < cooldownFrames) {
    state.threshold = Math.max(state.threshold * decay, 0.15);
    return { bass: false, mid: false, treble: false, energy: 0, newThreshold: state.threshold };
  }

  const newThreshold = Math.max(bassEnergy * 1.5, state.threshold * decay, 0.15);
  state.threshold = newThreshold;

  if (bassEnergy > newThreshold && bassEnergy > 0.25) {
    state.lastBeatFrame = frame;
    return { bass: true, mid: false, treble: false, energy: bassEnergy, newThreshold };
  }
  if (midEnergy > newThreshold * 0.9 && midEnergy > 0.2) {
    state.lastBeatFrame = frame;
    return { bass: false, mid: true, treble: false, energy: midEnergy, newThreshold };
  }
  if (trebleEnergy > newThreshold * 0.8 && trebleEnergy > 0.2) {
    state.lastBeatFrame = frame;
    return { bass: false, mid: false, treble: true, energy: trebleEnergy, newThreshold };
  }
  return { bass: false, mid: false, treble: false, energy: 0, newThreshold };
}

// ─── Onset Detection ──────────────────────────────────────────────────────

function detectOnset(
  flux: number,
  zcr: number,
  prevFlux: number,
  threshold: number
): { isOnset: boolean; type: "transient" | "percussive" | "harmonic" | null } {
  if (flux > threshold && flux > prevFlux * 1.5) {
    // Classify onset type based on ZCR + flux characteristics
    if (zcr > 0.5 && flux > 0.6) {
      return { isOnset: true, type: "transient" };
    }
    if (flux > 0.4) {
      return { isOnset: true, type: "percussive" };
    }
    return { isOnset: true, type: "harmonic" };
  }
  return { isOnset: false, type: null };
}

// ─── Primitive Computation ────────────────────────────────────────────────

/** Smooth a value with attack/decay envelope. */
function envelope(
  current: number,
  target: number,
  attack: number,
  decay: number,
  dt: number
): number {
  const factor = target > current ? attack : decay;
  const alpha = 1 - Math.exp(-dt * (factor * 20 + 1));
  return current + (target - current) * alpha;
}

interface PrimitiveState {
  impact: number;
  fluidity: number;
  brightness: number;
  sharpness: number;
  texture: number;
}

function computePrimitives(
  bands: Record<string, number>,
  spectral: { centroid: number; flatness: number; flux: number; zcr: number },
  beat: BeatResult,
  onset: { isOnset: boolean; type: string | null },
  state: PrimitiveState,
  dt: number
): PrimitiveState {
  // Impact: driven by percussive energy (bass + beat)
  const percussiveTarget = Math.max(bands.bass * 0.6 + bands.subBass * 0.3, beat.energy * 0.8);
  state.impact = envelope(state.impact, percussiveTarget, 0.8, 0.15, dt);

  // Fluidity: driven by harmonic energy (mid + highMid) and low flux
  const harmonicTarget =
    ((bands.mid + bands.highMid + bands.presence) / 3) * (1 - spectral.flux * 0.5);
  state.fluidity = envelope(state.fluidity, harmonicTarget, 0.2, 0.3, dt);

  // Brightness: driven by spectral centroid + brilliance band
  const brightnessTarget = Math.max(spectral.centroid, bands.brilliance * 0.7);
  state.brightness = envelope(state.brightness, brightnessTarget, 0.3, 0.2, dt);

  // Sharpness: driven by spectral flux + ZCR + onset
  const sharpTarget = Math.min(
    spectral.flux * 0.5 + spectral.zcr * 0.3 + (onset.isOnset ? 0.3 : 0),
    1
  );
  state.sharpness = envelope(state.sharpness, sharpTarget, 0.7, 0.1, dt);

  // Texture: driven by spectral flatness (noise-like vs tonal)
  state.texture = envelope(state.texture, spectral.flatness, 0.15, 0.15, dt);

  return state;
}

// ─── Main Extractor ───────────────────────────────────────────────────────

export class AudioFeatureExtractor {
  /**
   * Extract an AudioManifest from an AudioBuffer using real FFT analysis.
   *
   * This replaces the old `estimateSpectrum` approximation with Meyda's
   * `powerSpectrum` extractor for accurate band energies and spectral features.
   */
  static async extractManifest(
    buffer: AudioBuffer,
    opts: ExtractionOptions = {},
    onProgress?: ManifestProgressCallback
  ): Promise<AudioManifest> {
    const { fps = 30, bufferSize = 512 } = opts;
    const sampleRate = buffer.sampleRate;
    const nyquist = sampleRate / 2;
    const totalFrames = Math.ceil(buffer.duration * fps);
    const samplesPerFrame = Math.floor(sampleRate / fps);

    onProgress?.(0, "Decoding audio...");
    const monoData = mixToMono(buffer);

    // Compute content hash for caching
    const hashBuffer = monoData.buffer.slice(
      0,
      Math.min(monoData.byteLength, 1024 * 1024)
    ) as ArrayBuffer;
    const contentHash = await computeHash(hashBuffer);

    // Detect BPM
    onProgress?.(0.05, "Detecting tempo...");
    let bpm: number | null = null;
    try {
      const bpmResult = await detectBpm(buffer);
      bpm = typeof bpmResult === "number" ? bpmResult : (bpmResult?.bpm ?? null);
    } catch {
      bpm = null;
    }

    // Analysis state
    const beatState: BeatState = { threshold: 0.3, lastBeatFrame: -10 };
    const beatCooldownFrames = Math.ceil(fps * 0.15);
    const beatDecay = 0.95;
    const primState: PrimitiveState = {
      impact: 0,
      fluidity: 0,
      brightness: 0,
      sharpness: 0,
      texture: 0,
    };

    let prevSpectrum: Float32Array | null = null;
    let prevFlux = 0;
    const onsetThreshold = 0.15;
    const dt = 1 / fps;

    const manifestFrames: ManifestFrame[] = [];

    for (let frame = 0; frame < totalFrames; frame++) {
      if (frame % 50 === 0) {
        onProgress?.(0.05 + 0.9 * (frame / totalFrames), `Analyzing frame ${frame}/${totalFrames}`);
      }

      const startSample = frame * samplesPerFrame;
      const endSample = Math.min(startSample + samplesPerFrame, monoData.length);
      const slice = monoData.slice(startSample, endSample);

      // Pad to bufferSize
      const padded = new Float32Array(bufferSize);
      padded.set(slice.subarray(0, Math.min(slice.length, bufferSize)));

      // Extract Meyda features including powerSpectrum for real FFT
      const features = Meyda.extract(
        [
          "rms",
          "energy",
          "spectralCentroid",
          "spectralFlatness",
          "spectralRolloff",
          "spectralFlux",
          "zcr",
          "loudness",
          "powerSpectrum",
        ],
        padded
      );

      const f = features as Record<string, number | number[] | Float32Array>;

      // Get real power spectrum
      const powerSpectrum = (f.powerSpectrum as Float32Array) ?? new Float32Array(bufferSize / 2);

      // Calculate band energies from REAL FFT
      const bands = calcBandEnergiesFromPower(powerSpectrum, nyquist);

      // Spectral flux from real spectra
      const flux = calcSpectralFlux(powerSpectrum, prevSpectrum);
      prevSpectrum = new Float32Array(powerSpectrum);

      // Spectral bandwidth
      const centroidHz = (f.spectralCentroid as number) ?? 0;
      const bandwidth = calcSpectralBandwidth(powerSpectrum, centroidHz, nyquist);

      // Beat detection
      const beat = detectBeat(
        bands.bass,
        bands.mid,
        bands.brilliance,
        frame,
        beatState,
        beatCooldownFrames,
        beatDecay
      );

      // Onset detection
      const zcrNorm = Math.min((f.zcr as number) ?? 0 / 1000, 1);
      const onset = detectOnset(flux, zcrNorm, prevFlux, onsetThreshold);
      prevFlux = flux;

      // Spectral features normalized to 0-1
      const centroidNorm = Math.min(centroidHz / nyquist, 1);
      const rolloffNorm = Math.min((f.spectralRolloff as number) ?? 0 / nyquist, 1);
      const flatness = (f.spectralFlatness as number) ?? 0;
      const rms = (f.rms as number) ?? 0;
      const energy = (f.energy as number) ?? 0;

      // Compute high-level primitives
      computePrimitives(
        bands,
        { centroid: centroidNorm, flatness, flux, zcr: zcrNorm },
        beat,
        onset,
        primState,
        dt
      );

      const time = frame / fps;

      manifestFrames.push({
        frame,
        time,
        rms,
        energy,
        volume: rms,
        subBass: bands.subBass,
        bass: bands.bass,
        lowMid: bands.lowMid,
        mid: bands.mid,
        highMid: bands.highMid,
        presence: bands.presence,
        brilliance: bands.brilliance,
        spectralCentroid: centroidNorm,
        spectralFlatness: flatness,
        spectralRolloff: rolloffNorm,
        spectralFlux: flux,
        spectralBandwidth: bandwidth,
        zcr: zcrNorm,
        beatBass: beat.bass,
        beatMid: beat.mid,
        beatTreble: beat.treble,
        beatEnergy: beat.energy,
        isOnset: onset.isOnset,
        onsetType: onset.type,
        impact: primState.impact,
        fluidity: primState.fluidity,
        brightness: primState.brightness,
        sharpness: primState.sharpness,
        texture: primState.texture,
      });
    }

    onProgress?.(0.95, "Finalizing manifest...");

    const manifest: AudioManifest = {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      contentHash,
      fps,
      totalFrames,
      duration: buffer.duration,
      sampleRate,
      bpm,
      frames: manifestFrames,
    };

    onProgress?.(1, "Manifest complete");
    return manifest;
  }

  /**
   * Decode an audio file into an AudioBuffer.
   */
  static async decodeFile(file: File | ArrayBuffer): Promise<AudioBuffer> {
    const ctx = new AudioContext();
    const ab = file instanceof File ? await file.arrayBuffer() : file;
    const buffer = await ctx.decodeAudioData(ab);
    await ctx.close();
    return buffer;
  }

  /**
   * Extract a manifest from an audio file, with progress callback.
   */
  static async extractManifestFromFile(
    file: File,
    opts?: ExtractionOptions,
    onProgress?: ManifestProgressCallback
  ): Promise<AudioManifest> {
    const buffer = await AudioFeatureExtractor.decodeFile(file);
    return AudioFeatureExtractor.extractManifest(buffer, opts, onProgress);
  }

  // ─── Legacy compatibility (for existing export pipeline) ───────────────

  /**
   * Convert an AudioManifest to the legacy AudioBakeData format
   * that the Rust export pipeline expects.
   */
  static manifestToBakeData(manifest: AudioManifest): AudioBakeData {
    const frames: FrameAudioFeatures[] = manifest.frames.map((f) => ({
      frame: f.frame,
      time: f.time,
      rms: f.rms,
      energy: f.energy,
      spectralCentroid: f.spectralCentroid,
      spectralFlatness: f.spectralFlatness,
      spectralRolloff: f.spectralRolloff,
      spectralFlux: f.spectralFlux,
      zcr: f.zcr,
      volume: f.volume,
      subBass: f.subBass,
      bass: f.bass,
      lowMid: f.lowMid,
      mid: f.mid,
      highMid: f.highMid,
      presence: f.presence,
      brilliance: f.brilliance,
      beatBass: f.beatBass,
      beatMid: f.beatMid,
      beatTreble: f.beatTreble,
      beatEnergy: f.beatEnergy,
    }));
    return {
      fps: manifest.fps,
      totalFrames: manifest.totalFrames,
      bpm: manifest.bpm,
      frames,
    };
  }

  /**
   * Serialize AudioManifest to JSON string.
   */
  static serializeManifest(manifest: AudioManifest): string {
    return JSON.stringify(manifest);
  }

  /**
   * Deserialize JSON string to AudioManifest.
   */
  static deserializeManifest(json: string): AudioManifest {
    return JSON.parse(json) as AudioManifest;
  }
}
