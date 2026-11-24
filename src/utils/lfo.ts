import type { EasingType, Keyframe, LfoSpec } from "../store";

/**
 * Pure modulation math, shared by the preview resolver
 * (store `resolveModulatedValue`, driven from useKeyframePlayback) and by the
 * export bake in `stackToRustPayload`. Everything here is a pure function of
 * the spec and media time -- no wall-clock reads, no Math.random -- so what
 * the preview resolves at transport time `t` is bit-for-bit what the baked
 * export keyframes carry for that same `t`.
 */

/** Easing function for keyframe interpolation. */
export function applyEasing(t: number, easing: EasingType): number {
  if (easing === "hold") return 0;
  // Clamp t to [0, 1] to prevent out-of-range values from NaN/Infinity/negative inputs
  const tc = Number.isNaN(t) ? 0 : Math.max(0, Math.min(1, t));
  if (easing === "linear") return tc;
  if (easing === "easeIn") return tc * tc;
  if (easing === "easeOut") return 1 - (1 - tc) * (1 - tc);
  // easeInOut
  return tc < 0.5 ? 2 * tc * tc : 1 - Math.pow(-2 * tc + 2, 2) / 2;
}

/**
 * Value of one keyframe track at `time`, or null if the track is empty.
 * Holds the first/last value outside the track and interpolates between
 * neighbours with the LEFT key's easing. Mirror of `keyframe_value_at` in
 * `src-tauri/src/commands.rs` -- the two must agree or the exported file
 * stops matching the preview the user approved.
 */
export function keyframeValueAt(track: Keyframe[], time: number): number | null {
  if (!track || track.length === 0) return null;
  let idx = 0;
  while (idx < track.length && track[idx].time < time) idx++;
  if (idx < track.length && track[idx].time === time) return track[idx].value;
  if (idx === 0) return track[0].value;
  if (idx >= track.length) return track[track.length - 1].value;
  const k1 = track[idx - 1];
  const k2 = track[idx];
  const t = (time - k1.time) / (k2.time - k1.time);
  const eased = applyEasing(t, k1.easing);
  return k1.value + (k2.value - k1.value) * eased;
}

/** FNV-1a over a string -> uint32. Seeds the random waveform per LFO so two
 *  LFOs on different params don't share a sequence. */
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Deterministic pseudo-random value in [0, 1) for integer `index` under
 * `seed`. Integer ops only (Math.imul, unsigned shifts) -- the same inputs
 * give the same bits on every platform and every run, which is what makes a
 * "random" LFO reproducible frame-for-frame in preview AND export.
 */
export function seededUnit(seed: number, index: number): number {
  let h = (seed ^ Math.imul(index | 0, 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

/**
 * The LFO's waveshape at media time `t`, in [-1, 1]. Phase is anchored to the
 * transport (`rateHz * t` cycles), never to a frame counter or wall clock, so
 * scrubbing is deterministic.
 *
 * `random` is a per-cycle sample-and-hold: each whole cycle of phase gets one
 * seeded value and keeps it for the cycle -- the mosh-friendly "stepped"
 * variant. Hashing the cycle index (not Math.random per frame) is what makes
 * it repeatable.
 */
export function lfoWaveValue(spec: LfoSpec, t: number): number {
  const phase = spec.rateHz * t;
  switch (spec.waveform) {
    case "sine":
      return Math.sin(phase * 2 * Math.PI);
    case "triangle": {
      const f = phase - Math.floor(phase);
      return f < 0.5 ? 4 * f - 1 : 3 - 4 * f;
    }
    case "square":
      return phase - Math.floor(phase) < 0.5 ? 1 : -1;
    case "random":
      return seededUnit(hashString(spec.id), Math.floor(phase)) * 2 - 1;
  }
}

/**
 * The export frame-time grid, mirroring `export_frame_time` in
 * `src-tauri/src/commands.rs`: the segment was trimmed before effects run,
 * so frame `idx` of the exported clip sits at `trim_start + idx / fps` on the
 * transport -- the probe's fps for video, the export fps for an animated
 * still. Baking LFO values at exactly these times means the Rust keyframe
 * resolver hits the exact-match branch on every frame and the file plays the
 * curve the preview showed.
 *
 * `trimEnd` only sizes the grid; a few keys past the real frame count are
 * harmless (they sit on the same grid and are never sampled), while too few
 * would freeze the tail on the last baked value.
 */
export function exportFrameTimes(fps: number, trimStart: number, trimEnd: number): number[] {
  const start = Math.max(0, Number.isFinite(trimStart) ? trimStart : 0);
  const safeFps = Number.isFinite(fps) && fps > 0 ? fps : 30;
  const span = Math.max(0, (Number.isFinite(trimEnd) ? trimEnd : 0) - start);
  // Baked keys are ~60B of JSON each and Rust re-scans the track per frame,
  // so an unbounded grid is a real DoS shape (2h @ 60fps ≈ 432k keys per
  // param). Past the cap the keys redistribute evenly over the span — the
  // LFO curve still interpolates correctly, just at coarser temporal
  // resolution than one-key-per-frame.
  const MAX_BAKE_KEYS = 8192;
  const count = Math.max(1, Math.ceil(span * safeFps) + 2);
  if (count <= MAX_BAKE_KEYS) {
    const times: number[] = new Array(count);
    for (let i = 0; i < count; i++) times[i] = start + i / safeFps;
    return times;
  }
  const times: number[] = new Array(MAX_BAKE_KEYS);
  const step = span / (MAX_BAKE_KEYS - 1);
  for (let i = 0; i < MAX_BAKE_KEYS; i++) times[i] = start + i * step;
  return times;
}

/**
 * A parameter's effective value at `time` under its keyframes and LFO.
 *
 * Composition: keyframe interp (when a track exists) is the oscillation
 * centre; `spec.offset` -- in the parameter's own units -- is the centre
 * when it doesn't. Depth is a fraction of the declared range [min, max], so
 * one LFO spec reads the same on a 0..1 mix and a 0..255 threshold.
 *
 * `keyframeValue` is passed pre-resolved (not the track) so callers that
 * already have it -- the store resolver -- and callers walking a raw track --
 * the export bake -- share this exact arithmetic. The clamp mirrors the
 * `clamp_for_effect` the export applies right after keyframe injection
 * (frame_params_at in commands.rs), so a baked track and the live preview
 * agree at the edges.
 *
 * Returns null when nothing animates the param, matching the contract of
 * `getKeyframeValue` it replaces in the playback path.
 */
export function modulatedParamValue(opts: {
  keyframeValue: number | null;
  lfo: LfoSpec | null | undefined;
  min: number | undefined;
  max: number | undefined;
  time: number;
}): number | null {
  const { keyframeValue, lfo, min, max, time } = opts;
  if (keyframeValue === null && !lfo) return null;
  const centre = keyframeValue ?? lfo!.offset;
  const range =
    min !== undefined && max !== undefined && Number.isFinite(max - min) ? max - min : 1;
  const value = centre + (lfo ? lfo.depth * range * lfoWaveValue(lfo, time) : 0);
  if (min !== undefined && max !== undefined && Number.isFinite(min) && Number.isFinite(max)) {
    return Math.max(min, Math.min(max, value));
  }
  return value;
}
