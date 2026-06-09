/**
 * Keyframe animation types for MoshDither Studio.
 */

export type Easing = "linear" | "ease-in" | "ease-out" | "ease-in-out" | "step";

export interface Keyframe {
  time: number; // seconds
  value: number;
  easing: Easing;
}

export interface ParameterTrack {
  paramKey: string;
  keyframes: Keyframe[];
}

export interface EffectKeyframes {
  effectId: string;
  tracks: ParameterTrack[];
}

/**
 * Evaluate a track at a given time, interpolating between keyframes.
 */
export function evaluateTrack(track: ParameterTrack, time: number): number {
  const { keyframes } = track;
  if (keyframes.length === 0) return 0;
  if (keyframes.length === 1) return keyframes[0].value;

  // Sort by time
  const sorted = [...keyframes].sort((a, b) => a.time - b.time);

  // Before first keyframe
  if (time <= sorted[0].time) return sorted[0].value;
  // After last keyframe
  if (time >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1].value;

  // Find surrounding keyframes
  for (let i = 0; i < sorted.length - 1; i++) {
    const k1 = sorted[i];
    const k2 = sorted[i + 1];
    if (time >= k1.time && time <= k2.time) {
      const t = (time - k1.time) / (k2.time - k1.time);
      const eased = applyEasing(t, k1.easing);
      return k1.value + (k2.value - k1.value) * eased;
    }
  }

  return sorted[sorted.length - 1].value;
}

function applyEasing(t: number, easing: Easing): number {
  switch (easing) {
    case "linear":
      return t;
    case "ease-in":
      return t * t;
    case "ease-out":
      return 1 - (1 - t) * (1 - t);
    case "ease-in-out":
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    case "step":
      return t < 1 ? 0 : 1;
    default:
      return t;
  }
}

/**
 * Add or update a keyframe on a track.
 */
export function setKeyframe(track: ParameterTrack, time: number, value: number, easing: Easing = "linear"): ParameterTrack {
  const existing = track.keyframes.findIndex((k) => Math.abs(k.time - time) < 0.01);
  const newKeyframe: Keyframe = { time, value, easing };
  if (existing >= 0) {
    const updated = [...track.keyframes];
    updated[existing] = newKeyframe;
    return { ...track, keyframes: updated };
  }
  return { ...track, keyframes: [...track.keyframes, newKeyframe] };
}
