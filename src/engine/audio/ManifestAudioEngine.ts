/**
 * ManifestAudioEngine — File-based audio playback synced to an AudioManifest.
 *
 * When a user loads an audio file (not microphone), we:
 *   1. Bake an AudioManifest via AudioFeatureExtractor.extractManifest()
 *   2. Play the audio through a standard <audio> element / AudioContext
 *   3. On each animation frame, look up the manifest frame at the current
 *      playback time and emit it as a "features" event
 *
 * This gives perfect preview/export parity because both use the same manifest.
 * Effects read from the manifest — no live DSP in the renderer.
 */

import type { AudioManifest, ManifestFrame } from "./types";

export type ManifestEventType = "features" | "play" | "pause" | "stop" | "ended" | "error" | "manifest_ready";

export interface ManifestEvent {
  type: ManifestEventType;
  data?: ManifestFrame | string | AudioManifest;
}

type EventListener = (event: ManifestEvent) => void;

export class ManifestAudioEngine {
  private audioCtx: AudioContext | null = null;
  private mediaElement: HTMLAudioElement | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private manifest: AudioManifest | null = null;
  private listeners: Set<EventListener> = new Set();
  private rafId: number = 0;
  private _volume = 1.0;
  private _isPlaying = false;
  private _isManifestMode = false;

  get volume(): number {
    return this._volume;
  }

  set volume(v: number) {
    this._volume = v;
    if (this.gainNode) {
      this.gainNode.gain.value = v;
    }
    if (this.mediaElement) {
      this.mediaElement.volume = v;
    }
  }

  get isPlaying(): boolean {
    return this._isPlaying;
  }

  get isManifestMode(): boolean {
    return this._isManifestMode;
  }

  get hasManifest(): boolean {
    return this.manifest !== null;
  }

  getManifest(): AudioManifest | null {
    return this.manifest;
  }

  onEvent(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: ManifestEvent) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  /**
   * Load an audio file, bake the manifest, and prepare for playback.
   * Audio playback uses an HTMLAudioElement for seek/transport control.
   */
  async loadFile(
    file: File | string,
    manifest: AudioManifest
  ): Promise<void> {
    // Clean up previous
    await this.stop();
    this.disconnectNodes();

    // Create audio element for playback
    const url = file instanceof File ? URL.createObjectURL(file) : file;
    this.mediaElement = new Audio(url);
    this.mediaElement.volume = this._volume;
    this.mediaElement.crossOrigin = "anonymous";

    // Set up Web Audio graph for volume control
    this.audioCtx = new AudioContext();
    this.sourceNode = this.audioCtx.createMediaElementSource(this.mediaElement);
    this.gainNode = this.audioCtx.createGain();
    this.gainNode.gain.value = this._volume;
    this.sourceNode.connect(this.gainNode);
    this.gainNode.connect(this.audioCtx.destination);

    // Store manifest
    this.manifest = manifest;
    this._isManifestMode = true;

    // Emit manifest ready
    this.emit({ type: "manifest_ready", data: manifest });

    // Set up ended listener
    this.mediaElement.addEventListener("ended", () => {
      this._isPlaying = false;
      this.emit({ type: "ended" });
      this.stopRaf();
    });

    // Start RAF loop to emit features from manifest
    this.startRaf();
  }

  /**
   * Set the manifest directly (e.g. from cache).
   */
  setManifest(manifest: AudioManifest) {
    this.manifest = manifest;
    this._isManifestMode = true;
    this.emit({ type: "manifest_ready", data: manifest });
  }

  /**
   * Clear the manifest and exit manifest mode.
   */
  clearManifest() {
    this.manifest = null;
    this._isManifestMode = false;
  }

  play(): void {
    if (this.mediaElement) {
      this.mediaElement.play();
      this._isPlaying = true;
      this.emit({ type: "play" });
      this.startRaf();
    }
  }

  pause(): void {
    if (this.mediaElement) {
      this.mediaElement.pause();
      this._isPlaying = false;
      this.emit({ type: "pause" });
    }
  }

  async stop(): Promise<void> {
    if (this.mediaElement) {
      this.mediaElement.pause();
      this.mediaElement.currentTime = 0;
      this._isPlaying = false;
      this.emit({ type: "stop" });
    }
    this.stopRaf();
  }

  seek(time: number): void {
    if (this.mediaElement) {
      this.mediaElement.currentTime = time;
    }
  }

  get currentTime(): number {
    return this.mediaElement?.currentTime ?? 0;
  }

  get duration(): number {
    return this.mediaElement?.duration ?? (this.manifest?.duration ?? 0);
  }

  /**
   * Get the manifest frame at a specific time.
   */
  getFrameAtTime(time: number): ManifestFrame | null {
    if (!this.manifest) return null;
    const frameIdx = Math.floor(time * this.manifest.fps);
    return this.manifest.frames[Math.min(frameIdx, this.manifest.frames.length - 1)] ?? null;
  }

  /**
   * Get the manifest frame at a specific frame index.
   */
  getFrame(index: number): ManifestFrame | null {
    if (!this.manifest) return null;
    return this.manifest.frames[index] ?? null;
  }

  private startRaf() {
    if (this.rafId) return;
    const tick = () => {
      if (this._isPlaying && this.manifest) {
        const frame = this.getFrameAtTime(this.currentTime);
        if (frame) {
          this.emit({ type: "features", data: frame });
        }
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopRaf() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  private disconnectNodes() {
    if (this.sourceNode) {
      try { this.sourceNode.disconnect(); } catch { /* noop */ }
      this.sourceNode = null;
    }
    if (this.gainNode) {
      try { this.gainNode.disconnect(); } catch { /* noop */ }
      this.gainNode = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close();
      this.audioCtx = null;
    }
    if (this.mediaElement) {
      this.mediaElement.src = "";
      this.mediaElement = null;
    }
  }

  dispose() {
    this.stopRaf();
    this.disconnectNodes();
    this.manifest = null;
    this.listeners.clear();
    this._isManifestMode = false;
    this._isPlaying = false;
  }
}
