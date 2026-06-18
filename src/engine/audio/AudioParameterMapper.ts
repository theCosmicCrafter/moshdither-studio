/**
 * AudioParameterMapper — The core of the audio-reactive pipeline.
 *
 * Maps extracted audio features to shader uniform values with:
 * - Input range scaling (min/max normalization)
 * - Attack/decay smoothing curves
 * - Gate mode (threshold-based activation)
 * - Inversion
 * - Per-channel state tracking
 *
 * Usage:
 *   const mapper = new AudioParameterMapper();
 *   mapper.addMapping('intensity', { source: 'bass', inputMin: 0, inputMax: 1, outputMin: 0, outputMax: 2, attack: 0.3, decay: 0.1 });
 *   const values = mapper.process(features);
 *   // values.intensity.smoothed is ready to pass as a shader uniform
 */

import type {
  FrameAudioFeatures,
  AudioMappingConfig,
  MappedAudioValue,
  AudioParameterState,
} from './types';

export class AudioParameterMapper {
  private mappings: Map<string, AudioMappingConfig> = new Map();
  private state: Map<string, number> = new Map();
  private lastTrigger: Map<string, number> = new Map();
  private lastUpdateTime = 0;

  /**
   * Register a new audio-to-parameter mapping.
   */
  addMapping(outputName: string, config: AudioMappingConfig): void {
    this.mappings.set(outputName, config);
    if (!this.state.has(outputName)) {
      this.state.set(outputName, 0);
      this.lastTrigger.set(outputName, 0);
    }
  }

  /**
   * Remove a mapping.
   */
  removeMapping(outputName: string): void {
    this.mappings.delete(outputName);
    this.state.delete(outputName);
    this.lastTrigger.delete(outputName);
  }

  /**
   * Update an existing mapping.
   */
  updateMapping(outputName: string, partial: Partial<AudioMappingConfig>): void {
    const existing = this.mappings.get(outputName);
    if (existing) {
      this.mappings.set(outputName, { ...existing, ...partial });
    }
  }

  /**
   * Get all current mapping configs.
   */
  getMappings(): Map<string, AudioMappingConfig> {
    return new Map(this.mappings);
  }

  /**
   * Clear all mappings.
   */
  clear(): void {
    this.mappings.clear();
    this.state.clear();
    this.lastTrigger.clear();
  }

  /**
   * Process a frame of audio features and produce mapped output values.
   *
   * Call this every frame (e.g. inside requestAnimationFrame).
   */
  process(features: Partial<FrameAudioFeatures>): AudioParameterState {
    const now = performance.now();
    const dt = this.lastUpdateTime > 0 ? (now - this.lastUpdateTime) / 1000 : 0.016;
    this.lastUpdateTime = now;

    const channels: Record<string, MappedAudioValue> = {};

    for (const [name, config] of this.mappings) {
      const value = this.processChannel(name, config, features, dt);
      channels[name] = value;
    }

    return { channels, lastUpdate: now };
  }

  private processChannel(
    name: string,
    config: AudioMappingConfig,
    features: Partial<FrameAudioFeatures>,
    dt: number
  ): MappedAudioValue {
    // 1. Read raw feature value
    const rawInput = this.getFeatureValue(config.source, features);

    // 2. Normalize to 0-1 based on input range
    const range = config.inputMax - config.inputMin;
    const normalized = range > 0 ? (rawInput - config.inputMin) / range : 0;
    const clamped = Math.max(0, Math.min(1, normalized));

    // 3. Gate check
    const gated = config.gateEnabled && clamped < config.gateThreshold ? 0 : clamped;
    const triggered = gated > 0 && clamped >= (config.gateEnabled ? config.gateThreshold : 0);

    if (triggered) {
      this.lastTrigger.set(name, performance.now());
    }

    // 4. Map to output range
    const target = gated * (config.outputMax - config.outputMin) + config.outputMin;

    // 5. Apply attack/decay smoothing
    let current = this.state.get(name) ?? 0;

    // Convert 0-1 attack/decay to actual time constants based on dt
    // Higher attack = faster rise. Higher decay = slower fall.
    const attackFactor = 1 - Math.exp(-dt * (config.attack * 20 + 1));
    const decayFactor = 1 - Math.exp(-dt * (config.decay * 10 + 0.5));

    if (target > current) {
      current = current + (target - current) * attackFactor;
    } else {
      current = current + (target - current) * decayFactor;
    }

    this.state.set(name, current);

    // 6. Invert if requested
    const output = config.invert
      ? config.outputMax - (current - config.outputMin)
      : current;

    return {
      raw: clamped,
      smoothed: output,
      triggered,
    };
  }

  private getFeatureValue(
    source: string,
    features: Partial<FrameAudioFeatures>
  ): number {
    if (source in features) {
      const val = features[source as keyof FrameAudioFeatures];
      return typeof val === 'number' ? val : 0;
    }
    return 0;
  }

  /**
   * Reset all channel states to zero.
   */
  reset(): void {
    this.state.clear();
    this.lastTrigger.clear();
    this.lastUpdateTime = 0;
  }
}
