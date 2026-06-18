/**
 * AudioEngine - Core Web Audio API manager using Meyda + web-audio-beat-detector.
 *
 * Architecture: The frontend is the single source of truth for audio analysis.
 * Real-time: Meyda analyzer feeds live features into the AudioParameterMapper.
 * Export: OfflineAudioContext + Meyda.extract() bakes per-frame JSON that
 *         Rust consumes directly (no Rust-side DSP).
 */

import Meyda from "meyda";
import type { FrameAudioFeatures, FrequencyBand } from "./types";
import { STANDARD_BANDS } from "./types";

export type AudioSourceType = "file" | "microphone" | "none";

export type AudioEngineEvent =
  | { type: "play" }
  | { type: "pause" }
  | { type: "stop" }
  | { type: "beat"; band: string; energy: number }
  | { type: "ended" }
  | { type: "error"; message: string }
  | { type: "features"; data: Partial<FrameAudioFeatures> };

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private sourceNode: AudioNode | null = null;
  private gainNode: GainNode | null = null;
  private mediaElement: HTMLAudioElement | null = null;
  private stream: MediaStream | null = null;
  private meydaAnalyzer: ReturnType<typeof Meyda.createMeydaAnalyzer> | null = null;

  private _bufferSize = 512;
  private _volume = 1.0;
  private _sourceType: AudioSourceType = "none";

  private listeners: Set<(event: AudioEngineEvent) => void> = new Set();

  // Latest raw frequency data from AnalyserNode (for band energy calc)
  private freqData: Uint8Array<ArrayBuffer> | null = null;

  // Previous spectrum for flux calculation
  private prevSpectrum: Float32Array | null = null;

  // Beat detection state
  private beatThreshold = 0.3;
  private beatDecay = 0.95;
  private lastBeatTime = 0;
  private beatCooldownMs = 150;

  get audioContext(): AudioContext | null {
    return this.ctx;
  }

  get analyserNode(): AnalyserNode | null {
    return this.analyser;
  }

  /** Get current time-domain waveform data (128 samples). */
  getTimeDomainData(): Uint8Array | null {
    if (!this.analyser) return null;
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteTimeDomainData(data);
    return data;
  }

  get bufferSize(): number {
    return this._bufferSize;
  }

  set bufferSize(size: number) {
    const valid = [256, 512, 1024, 2048, 4096];
    this._bufferSize = valid.includes(size) ? size : 512;
    // Meyda analyzer must be recreated with new buffer size
    if (this.meydaAnalyzer) {
      this.rebuildMeyda();
    }
  }

  get volume(): number {
    return this._volume;
  }

  set volume(value: number) {
    this._volume = Math.max(0, Math.min(1, value));
    if (this.gainNode) {
      this.gainNode.gain.value = this._volume;
    }
  }

  get sourceType(): AudioSourceType {
    return this._sourceType;
  }

  get sampleRate(): number {
    return this.ctx?.sampleRate ?? 44100;
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new (
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      )();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    return this.ctx;
  }

  private createAnalyser(): AnalyserNode {
    if (!this.analyser) {
      const ctx = this.ensureContext();
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = this._bufferSize * 2; // Meyda needs this
      this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
    }
    return this.analyser;
  }

  private createGain(): GainNode {
    if (!this.gainNode) {
      this.gainNode = this.ensureContext().createGain();
      this.gainNode.gain.value = this._volume;
    }
    return this.gainNode;
  }

  private rebuildMeyda(): void {
    if (!this.ctx || !this.analyser || !this.sourceNode) return;
    if (this.meydaAnalyzer) {
      this.meydaAnalyzer.stop();
    }
    this.meydaAnalyzer = Meyda.createMeydaAnalyzer({
      audioContext: this.ctx,
      source: this.sourceNode,
      bufferSize: this._bufferSize,
      featureExtractors: [
        "rms",
        "energy",
        "spectralCentroid",
        "spectralFlatness",
        "spectralRolloff",
        "spectralFlux",
        "zcr",
        "loudness",
      ],
      callback: (features: Record<string, unknown>) => {
        this.onMeydaFeatures(features);
      },
    });
    this.meydaAnalyzer.start();
  }

  private onMeydaFeatures(features: Record<string, unknown>): void {
    const f = features as Record<string, number | number[]>;

    // Calculate per-band energy from AnalyserNode (Meyda doesn't give named bands)
    const freq = this.getFrequencyData();
    const bandEnergies = this.calcBandEnergies(freq);

    // Spectral flux: we compute manually since Meyda's flux needs prevSignal, not spectrum
    const flux = this.calcSpectralFlux(freq);

    // Beat detection
    const beatInfo = this.detectBeat(bandEnergies.bass, bandEnergies.mid, bandEnergies.brilliance);

    const frameFeatures: Partial<FrameAudioFeatures> = {
      rms: (f.rms as number) ?? 0,
      energy: (f.energy as number) ?? 0,
      spectralCentroid: this.normalizeCentroid(f.spectralCentroid as number),
      spectralFlatness: (f.spectralFlatness as number) ?? 0,
      spectralRolloff: this.normalizeRolloff(f.spectralRolloff as number),
      spectralFlux: flux,
      zcr: Math.min((f.zcr as number) ?? 0 / 1000, 1),
      volume: (f.rms as number) ?? 0,
      ...bandEnergies,
      beatBass: beatInfo.bass,
      beatMid: beatInfo.mid,
      beatTreble: beatInfo.treble,
      beatEnergy: beatInfo.energy,
    };

    this.emit({ type: "features", data: frameFeatures });

    if (beatInfo.bass || beatInfo.mid || beatInfo.treble) {
      const band = beatInfo.bass ? "bass" : beatInfo.mid ? "mid" : "treble";
      this.emit({ type: "beat", band, energy: beatInfo.energy });
    }
  }

  private calcBandEnergies(freq: Uint8Array): Record<string, number> {
    const nyquist = this.sampleRate / 2;
    const binCount = freq.length;
    const binToHz = (i: number) => (i * nyquist) / (binCount - 1);

    const bands: Record<string, number> = {};
    for (const band of STANDARD_BANDS as FrequencyBand[]) {
      let sum = 0;
      let count = 0;
      for (let i = 0; i < binCount; i++) {
        const hz = binToHz(i);
        if (hz >= band.minHz && hz <= band.maxHz) {
          sum += freq[i];
          count++;
        }
      }
      bands[band.name] = count > 0 ? sum / (count * 255) : 0;
    }
    return bands;
  }

  private calcSpectralFlux(freq: Uint8Array): number {
    const curr = new Float32Array(freq.length);
    for (let i = 0; i < freq.length; i++) curr[i] = freq[i] / 255;

    if (!this.prevSpectrum || this.prevSpectrum.length !== freq.length) {
      this.prevSpectrum = new Float32Array(freq.length);
      this.prevSpectrum.set(curr);
      return 0;
    }

    let flux = 0;
    for (let i = 0; i < curr.length; i++) {
      const diff = curr[i] - this.prevSpectrum[i];
      if (diff > 0) flux += diff * diff;
    }
    flux = Math.sqrt(flux / curr.length);
    this.prevSpectrum.set(curr);
    return Math.min(flux * 5, 1); // scale to 0-1
  }

  private detectBeat(bassEnergy: number, midEnergy: number, trebleEnergy: number) {
    const now = performance.now();
    const info = { bass: false, mid: false, treble: false, energy: 0 };

    if (now - this.lastBeatTime < this.beatCooldownMs) {
      return info;
    }

    this.beatThreshold = Math.max(bassEnergy * 1.5, this.beatThreshold * this.beatDecay, 0.15);

    if (bassEnergy > this.beatThreshold && bassEnergy > 0.25) {
      info.bass = true;
      info.energy = bassEnergy;
      this.lastBeatTime = now;
    } else if (midEnergy > this.beatThreshold * 0.9 && midEnergy > 0.2) {
      info.mid = true;
      info.energy = midEnergy;
      this.lastBeatTime = now;
    } else if (trebleEnergy > this.beatThreshold * 0.8 && trebleEnergy > 0.2) {
      info.treble = true;
      info.energy = trebleEnergy;
      this.lastBeatTime = now;
    }

    return info;
  }

  private normalizeCentroid(centroid: number | undefined): number {
    if (!centroid || !this.sampleRate) return 0;
    // centroid is in Hz, normalize to 0-1 against nyquist
    return Math.min(centroid / (this.sampleRate / 2), 1);
  }

  private normalizeRolloff(rolloff: number | undefined): number {
    if (!rolloff || !this.sampleRate) return 0;
    return Math.min(rolloff / (this.sampleRate / 2), 1);
  }

  /**
   * Get the latest frequency data from the AnalyserNode.
   */
  getFrequencyData(): Uint8Array {
    if (!this.analyser || !this.freqData) {
      return new Uint8Array(0);
    }
    this.analyser.getByteFrequencyData(this.freqData);
    return this.freqData;
  }

  /**
   * Load audio from a file URL or File object.
   */
  async loadFile(file: File | string): Promise<void> {
    await this.stop();
    this._sourceType = "file";

    const ctx = this.ensureContext();
    const analyser = this.createAnalyser();
    const gain = this.createGain();

    const audio = document.createElement("audio");
    audio.crossOrigin = "anonymous";
    audio.loop = true;

    if (typeof file === "string") {
      audio.src = file;
    } else {
      audio.src = URL.createObjectURL(file);
    }

    this.mediaElement = audio;

    await new Promise<void>((resolve, reject) => {
      audio.onloadedmetadata = () => resolve();
      audio.onerror = () => reject(new Error("Failed to load audio file"));
      if (audio.readyState >= 2) resolve();
    });

    const source = ctx.createMediaElementSource(audio);
    this.sourceNode = source;

    source.connect(analyser);
    analyser.connect(gain);
    gain.connect(ctx.destination);

    this.rebuildMeyda();

    audio.onended = () => {
      this.emit({ type: "ended" });
    };
  }

  /**
   * Start microphone input.
   */
  async startMicrophone(): Promise<void> {
    await this.stop();
    this._sourceType = "microphone";

    const ctx = this.ensureContext();
    const analyser = this.createAnalyser();
    const gain = this.createGain();

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const source = ctx.createMediaStreamSource(this.stream);
      this.sourceNode = source;

      source.connect(analyser);
      analyser.connect(gain);
      // No destination connect to prevent feedback

      this.rebuildMeyda();
    } catch (err) {
      this.emit({ type: "error", message: `Microphone access denied: ${err}` });
      throw err;
    }
  }

  play(): void {
    if (this.mediaElement) {
      this.mediaElement.play();
      if (this.ctx?.state === "suspended") {
        this.ctx.resume();
      }
      this.emit({ type: "play" });
    }
  }

  pause(): void {
    if (this.mediaElement) {
      this.mediaElement.pause();
      this.emit({ type: "pause" });
    }
  }

  async stop(): Promise<void> {
    if (this.meydaAnalyzer) {
      this.meydaAnalyzer.stop();
      this.meydaAnalyzer = null;
    }
    if (this.mediaElement) {
      this.mediaElement.pause();
      this.mediaElement.src = "";
      this.mediaElement = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {
        /* ignore */
      }
      this.sourceNode = null;
    }
    this._sourceType = "none";
    this.prevSpectrum = null;
    this.emit({ type: "stop" });
  }

  seek(time: number): void {
    if (this.mediaElement) {
      this.mediaElement.currentTime = Math.max(0, time);
    }
  }

  get currentTime(): number {
    return this.mediaElement?.currentTime ?? 0;
  }

  get duration(): number {
    return this.mediaElement?.duration ?? 0;
  }

  onEvent(listener: (event: AudioEngineEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: AudioEngineEvent): void {
    this.listeners.forEach((l) => l(event));
  }

  dispose(): void {
    this.stop();
    this.listeners.clear();
    if (this.analyser) {
      try {
        this.analyser.disconnect();
      } catch {
        /* ignore */
      }
    }
    if (this.gainNode) {
      try {
        this.gainNode.disconnect();
      } catch {
        /* ignore */
      }
    }
    if (this.ctx) {
      this.ctx.close();
    }
    this.ctx = null;
    this.analyser = null;
    this.gainNode = null;
  }
}

/** Global singleton for accessing the active audio engine from any component. */
let _globalAudioEngine: AudioEngine | null = null;

export function setGlobalAudioEngine(engine: AudioEngine | null) {
  _globalAudioEngine = engine;
}

export function getGlobalAudioEngine(): AudioEngine | null {
  return _globalAudioEngine;
}
