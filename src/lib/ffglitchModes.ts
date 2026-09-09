/**
 * The datamosh (FFglitch) modes and the knobs each one actually reads.
 *
 * One table, used by the Export panel (controls), the store (defaults), the
 * presets (what gets saved) and the preview. Until this existed the panel
 * offered a mode and then called `applyFfglitch(..., {})`: every mode ran on
 * its script's baked-in constants and not one knob was reachable, while
 * mosh_cli.py had been parsing all of them the whole time.
 *
 * Ids and defaults are the ones mosh_cli.py reads (`params.get(...)`) and the
 * `var X = ...` lines it rewrites in DatamoshLib/FFG_effects/jscripts/*.js.
 * Ranges are practical, not the mathematical limits: a delay of 2000 frames is
 * a legal number and a useless control.
 */

export type FfglitchParamValue = number | boolean | string;

export interface FfglitchParamDef {
  id: string;
  label: string;
  type: "number" | "boolean" | "select";
  min?: number;
  max?: number;
  step?: number;
  default: FfglitchParamValue;
  options?: { value: string; label: string }[];
  /** One line under the control, when the name alone does not say what it does. */
  hint?: string;
}

export interface FfglitchModeDef {
  id: string;
  label: string;
  group: string;
  /** What the mode does to the picture, in one sentence. */
  blurb: string;
  params: FfglitchParamDef[];
}

const num = (
  id: string,
  label: string,
  def: number,
  min: number,
  max: number,
  step = 1,
  hint?: string
): FfglitchParamDef => ({ id, label, type: "number", default: def, min, max, step, hint });

const bool = (id: string, label: string, def: boolean, hint?: string): FfglitchParamDef => ({
  id,
  label,
  type: "boolean",
  default: def,
  hint,
});

// Shared knobs. The JS-script modes gate their effect on a motion-vector
// threshold and count frames before acting; the AVI modes take a frame range.
const threshold = (def: number) =>
  num("threshold", "Threshold", def, 0, 100, 1, "Motion vectors below this are left alone");
const frameCount = (def: number) =>
  num("frameCount", "Start after (frames)", def, 0, 300, 1, "Frames to leave untouched before the effect kicks in");
const zoom = (def: number, label = "Zoom") =>
  num("zoom", label, def, -100, 100, 1, "Negative pulls inward, positive pushes outward");
const startFrame = (def: number) => num("startFrame", "From frame", def, 0, 5000, 1);
const endFrame = (def: number) => num("endFrame", "To frame", def, 1, 5000, 1);

export const FFGLITCH_MODES: FfglitchModeDef[] = [
  // ── Frame stutter: I-frames dropped or repeated so motion smears across cuts ──
  {
    id: "classic",
    label: "Classic",
    group: "Frame stutter",
    blurb: "Drops the keyframes in a time range so motion bleeds across every cut.",
    params: [
      num("start", "From (s)", 0, 0, 120, 0.5),
      num("end", "To (s)", 10, 0.5, 120, 0.5),
      num("p", "Repeat", 1, 1, 30, 1, "How many times each P-frame is repeated"),
    ],
  },
  {
    id: "classic2",
    label: "Classic 2",
    group: "Frame stutter",
    blurb: "The same keyframe drop, addressed by frame instead of by seconds.",
    params: [startFrame(0), endFrame(1000)],
  },
  {
    id: "repeat",
    label: "Repeat",
    group: "Frame stutter",
    blurb: "Repeats P-frames so motion piles up on itself.",
    params: [startFrame(0), endFrame(1000), num("p", "Repeat", 5, 1, 30)],
  },
  {
    id: "glide",
    label: "Glide",
    group: "Frame stutter",
    blurb: "Holds motion vectors for a run of frames so the picture glides.",
    params: [num("p", "Glide length (frames)", 5, 1, 30)],
  },
  {
    id: "sort",
    label: "Sort",
    group: "Frame stutter",
    blurb: "Sorts the frames by size, which scrambles the order the decoder expects.",
    params: [
      bool("keepFirst", "Keep the first frame", true, "Off scrambles the opening keyframe too"),
      bool("reverse", "Reverse order", false),
    ],
  },
  {
    id: "echo",
    label: "Echo",
    group: "Frame stutter",
    blurb: "Splits the clip and echoes the first half's motion into the second.",
    params: [num("mid", "Split point", 0.5, 0, 1, 0.05, "Where the clip is split, as a fraction of its length")],
  },
  {
    id: "pulse",
    label: "Pulse",
    group: "Frame stutter",
    blurb: "Pulses of frame corruption at a set interval.",
    params: [
      num("count", "Pulses", 20, 1, 100),
      num("frame", "Frame gap", 1, 1, 30, 1, "Frames between pulses"),
      num("kill", "Kill rate", 0.7, 0, 1, 0.05, "Share of frames each pulse destroys"),
    ],
  },

  // ── Motion vector: vectors rewritten in the bitstream ──
  {
    id: "fluid",
    label: "Fluid",
    group: "Motion vector",
    blurb: "Averages motion vectors over neighbouring frames so movement flows like liquid.",
    params: [num("fluidity", "Fluidity", 5, 1, 50, 1, "Frames averaged together")],
  },
  {
    id: "stretch",
    label: "Stretch",
    group: "Motion vector",
    blurb: "Stretches motion along one axis.",
    params: [
      {
        id: "direction",
        label: "Direction",
        type: "select",
        default: "horizontal",
        options: [
          { value: "horizontal", label: "Horizontal" },
          { value: "vertical", label: "Vertical" },
        ],
      },
    ],
  },
  {
    id: "shuffle_basic",
    label: "Shuffle",
    group: "Motion vector",
    blurb: "Shuffles chunks of frames so motion arrives out of order.",
    params: [num("chunkSize", "Chunk size (frames)", 1, 1, 30)],
  },
  {
    id: "rise",
    label: "Rise",
    group: "Motion vector",
    blurb: "Pushes motion vectors upward across a frame range.",
    params: [startFrame(1), endFrame(100)],
  },
  {
    id: "water_bloom",
    label: "Water Bloom",
    group: "Motion vector",
    blurb: "Repeats one frame's motion so it blooms outward.",
    params: [
      num("positionFrame", "At frame", 1, 1, 5000),
      num("repeatCount", "Bloom length (frames)", 20, 1, 100),
    ],
  },

  // ── Movement: motion vectors bent by a script ──
  {
    id: "zoom",
    label: "Zoom",
    group: "Movement",
    blurb: "Adds a constant zoom to every motion vector.",
    params: [zoom(20)],
  },
  {
    id: "slam zoom",
    label: "Slam Zoom",
    group: "Movement",
    blurb: "Zoom that slams in hard rather than easing.",
    params: [zoom(20)],
  },
  {
    id: "shift",
    label: "Shift",
    group: "Movement",
    blurb: "Shifts still regions downward with a gravity pull once motion drops below the threshold.",
    params: [
      threshold(98),
      num("origGravity", "Gravity", 5, -50, 50, 1, "Negative pulls up"),
      frameCount(10),
    ],
  },
  {
    id: "sink",
    label: "Sink",
    group: "Movement",
    blurb: "Regions that stop moving sink out of frame.",
    params: [num("movementThreshold", "Movement threshold", 3, 0, 50, 1, "Lower sinks more of the picture")],
  },
  {
    id: "slice",
    label: "Slice",
    group: "Movement",
    blurb: "Slices the picture along motion boundaries.",
    params: [threshold(95), zoom(0, "Slice zoom"), frameCount(0)],
  },
  {
    id: "mirror",
    label: "Mirror",
    group: "Movement",
    blurb: "Mirrors motion vectors so movement folds back on itself.",
    params: [zoom(-20)],
  },
  {
    id: "shear",
    label: "Shear",
    group: "Movement",
    blurb: "Shears motion sideways.",
    params: [zoom(-20, "Shear")],
  },
  {
    id: "vibrate",
    label: "Vibrate",
    group: "Movement",
    blurb: "Random jitter added to every motion vector.",
    params: [num("randomness", "Randomness", 10, 0, 100)],
  },

  // ── Time: motion delayed, buffered or stopped ──
  {
    id: "delay",
    label: "Delay",
    group: "Time",
    blurb: "Delays motion vectors by a number of frames so movement lags the picture.",
    params: [num("delay", "Delay (frames)", 20, 1, 120)],
  },
  {
    id: "buffer",
    label: "Buffer",
    group: "Time",
    blurb: "Feeds motion back into itself through a buffer.",
    params: [
      num("delay", "Delay (frames)", 10, 1, 120),
      num("feedback", "Feedback", 0.5, 0, 1, 0.05, "How much buffered motion re-enters each pass"),
    ],
  },
  {
    id: "stop",
    label: "Stop",
    group: "Time",
    blurb: "Freezes motion once it drops below the threshold.",
    params: [threshold(95), frameCount(0)],
  },
  {
    id: "invert-reverse",
    label: "Invert / Reverse",
    group: "Time",
    blurb: "Inverts motion vectors so movement runs backwards.",
    params: [threshold(95), frameCount(0)],
  },
  {
    id: "noise",
    label: "Noise",
    group: "Time",
    blurb: "Random motion noise with a decaying tail.",
    params: [
      num("somePercentage", "Amount", 0.5, 0, 1, 0.05),
      num("multiple", "Strength", 10, 1, 50),
      num("tailLength", "Tail (frames)", 20, 1, 100),
    ],
  },
];

export const FFGLITCH_GROUPS: string[] = Array.from(new Set(FFGLITCH_MODES.map((m) => m.group)));

const BY_ID: Record<string, FfglitchModeDef> = Object.fromEntries(FFGLITCH_MODES.map((m) => [m.id, m]));

export function getFfglitchMode(id: string): FfglitchModeDef | undefined {
  return BY_ID[id];
}

/** Every knob of a mode at its default -- what mosh_cli.py would use anyway. */
export function defaultFfglitchParams(modeId: string): Record<string, FfglitchParamValue> {
  const mode = BY_ID[modeId];
  if (!mode) return {};
  return Object.fromEntries(mode.params.map((p) => [p.id, p.default]));
}

/**
 * Keep only the knobs this mode reads, clamped to their ranges, so a stale or
 * hand-edited preset cannot hand mosh_cli.py a value it never expected.
 */
export function sanitizeFfglitchParams(
  modeId: string,
  params: Record<string, unknown> | undefined
): Record<string, FfglitchParamValue> {
  const mode = BY_ID[modeId];
  if (!mode) return {};
  const out: Record<string, FfglitchParamValue> = {};
  for (const def of mode.params) {
    const raw = params?.[def.id];
    if (def.type === "number") {
      const n = typeof raw === "number" && Number.isFinite(raw) ? raw : (def.default as number);
      const lo = def.min ?? -Infinity;
      const hi = def.max ?? Infinity;
      out[def.id] = Math.min(hi, Math.max(lo, n));
    } else if (def.type === "boolean") {
      out[def.id] = typeof raw === "boolean" ? raw : (def.default as boolean);
    } else {
      const ok = def.options?.some((o) => o.value === raw);
      out[def.id] = ok ? (raw as string) : (def.default as string);
    }
  }
  return out;
}
