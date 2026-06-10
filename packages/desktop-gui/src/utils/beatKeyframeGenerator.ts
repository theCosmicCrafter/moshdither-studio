/**
 * Auto-keyframe generator for MoshDither Studio.
 *
 * Bridges beat detection timestamps to effect parameter keyframes.
 * Uses the existing `detectBeats` from `beatDetection.ts`.
 */

import type { Beat } from "./beatDetection";
import type { Keyframe, Easing } from "../types/keyframeTypes";

export type BeatKeyframeMode = "pulse" | "toggle" | "ramp" | "decay";

export interface BeatKeyframeOptions {
  beats: Beat[];
  paramKey: string;
  mode: BeatKeyframeMode;
  minValue: number;
  maxValue: number;
  easing?: Easing;
  /** For ramp mode: how many beats before resetting to min */
  rampCycleBeats?: number;
  /** For pulse mode: decay time in seconds (how long to fade from max to min) */
  pulseDecay?: number;
}

/**
 * Generate keyframes from beat timestamps for a single effect parameter.
 *
 * @param opts - Configuration for keyframe generation
 * @returns Array of keyframes sorted by time
 */
export function generateBeatKeyframes(opts: BeatKeyframeOptions): Keyframe[] {
  const {
    beats,
    mode,
    minValue,
    maxValue,
    easing = "linear",
    rampCycleBeats = 4,
    pulseDecay = 0.3,
  } = opts;

  if (beats.length === 0) return [];

  const sorted = [...beats].sort((a, b) => a.time - b.time);

  switch (mode) {
    case "pulse":
      return generatePulse(sorted, minValue, maxValue, easing, pulseDecay);
    case "toggle":
      return generateToggle(sorted, minValue, maxValue, easing);
    case "ramp":
      return generateRamp(sorted, minValue, maxValue, easing, rampCycleBeats);
    case "decay":
      return generateDecay(sorted, minValue, maxValue, easing);
    default:
      return generatePulse(sorted, minValue, maxValue, easing, pulseDecay);
  }
}

function generatePulse(
  beats: Beat[],
  min: number,
  max: number,
  easing: Easing,
  decaySeconds: number,
): Keyframe[] {
  const keyframes: Keyframe[] = [];

  for (let i = 0; i < beats.length; i++) {
    const beat = beats[i];
    const intensity = beat.intensity;
    const value = min + (max - min) * intensity;

    // Peak on the beat
    keyframes.push({ time: beat.time, value, easing });

    // Decay keyframe after the beat (unless it's the last beat)
    if (i < beats.length - 1) {
      const nextBeat = beats[i + 1];
      const decayTime = Math.min(beat.time + decaySeconds, nextBeat.time - 0.05);
      if (decayTime > beat.time) {
        keyframes.push({ time: decayTime, value: min, easing: "ease-out" });
      }
    } else {
      // Last beat: decay after
      keyframes.push({ time: beat.time + decaySeconds, value: min, easing: "ease-out" });
    }
  }

  return dedupeAndSort(keyframes);
}

function generateToggle(
  beats: Beat[],
  min: number,
  max: number,
  easing: Easing,
): Keyframe[] {
  const keyframes: Keyframe[] = [];

  for (let i = 0; i < beats.length; i++) {
    const value = i % 2 === 0 ? max : min;
    keyframes.push({ time: beats[i].time, value, easing });
  }

  return keyframes;
}

function generateRamp(
  beats: Beat[],
  min: number,
  max: number,
  easing: Easing,
  cycleBeats: number,
): Keyframe[] {
  const keyframes: Keyframe[] = [];
  const step = (max - min) / (cycleBeats - 1 || 1);

  for (let i = 0; i < beats.length; i++) {
    const cyclePosition = i % cycleBeats;
    const value = min + step * cyclePosition;
    keyframes.push({ time: beats[i].time, value: Math.min(value, max), easing });
  }

  return keyframes;
}

function generateDecay(
  beats: Beat[],
  min: number,
  max: number,
  easing: Easing,
): Keyframe[] {
  const keyframes: Keyframe[] = [];

  for (let i = 0; i < beats.length; i++) {
    const beat = beats[i];
    // Start high
    keyframes.push({ time: beat.time, value: max, easing });

    // If there's a next beat, interpolate down to min before it
    if (i < beats.length - 1) {
      const nextBeat = beats[i + 1];
      const midTime = (beat.time + nextBeat.time) / 2;
      keyframes.push({ time: midTime, value: min, easing: "ease-in-out" });
    }
  }

  return dedupeAndSort(keyframes);
}

function dedupeAndSort(keyframes: Keyframe[]): Keyframe[] {
  // Sort by time, then remove duplicates within 10ms
  const sorted = keyframes.sort((a, b) => a.time - b.time);
  const result: Keyframe[] = [];
  for (const kf of sorted) {
    const last = result[result.length - 1];
    if (!last || Math.abs(last.time - kf.time) > 0.01) {
      result.push(kf);
    } else {
      // Same time: keep the one with higher value (the peak)
      if (kf.value > last.value) {
        result[result.length - 1] = kf;
      }
    }
  }
  return result;
}
