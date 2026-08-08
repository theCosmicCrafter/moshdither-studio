import type { StackEntry, ViewportGuides } from "../store";

/**
 * Migration for stacks saved before the composition guides left the effect
 * registry.
 *
 * `overlay.safe_area`, `overlay.rule_of_thirds`, `overlay.crosshairs` and
 * `overlay.pixel_grid` used to be effects, so they appear inside saved presets
 * and auto-saved sessions. They no longer exist in the Rust registry, and an
 * unknown effect ID is a hard error there — `Effect '...' not found` aborts the
 * entire render rather than skipping the entry. Without this migration, loading
 * an affected preset would break preview and export outright.
 *
 * So the entries are stripped from the stack and turned back on as viewport
 * guides, which is what they were always for. The user sees the same guides in
 * the preview; they simply stop being burned into the exported file.
 */

const OVERLAY_TO_GUIDE: Record<string, keyof ViewportGuides> = {
  "overlay.safe_area": "safeArea",
  "overlay.rule_of_thirds": "ruleOfThirds",
  "overlay.crosshairs": "crosshairs",
  "overlay.pixel_grid": "pixelGrid",
};

/**
 * Effect IDs emitted by builds before the registry names were consolidated.
 * These aliases must be normalized before a preset reaches Rust, where an
 * unknown ID aborts the complete effect stack.
 */
const LEGACY_EFFECT_IDS: Record<string, string> = {
  "noise.gaussian_noise": "noise.gaussian",
  "color.contrast_brightness": "color.brightness_contrast",
  "color.saturation": "color.brightness_contrast",
  "dithering.palette_dither": "dithering.palette",
  "dithering.ordered": "dithering.ordered_variants",
  "audio_reactive.chromatic": "audio_reactive.spectral_shift",
  "analog.film_grain": "noise.gaussian",
};

// These effects were removed without a direct equivalent. Dropping them is
// preferable to making the entire saved stack unrenderable.
const REMOVED_LEGACY_EFFECT_IDS = new Set([
  "analog.vignette",
  "color.temperature_tint",
]);

/**
 * Per-legacy-ID parameter remaps, keyed by the OLD effect ID.
 *
 * Renaming an effect ID is not enough on its own: the ID rename above swaps
 * which Rust effect receives the stored `params` object, but does nothing
 * about the KEYS inside it. Four of the seven renames land on an effect whose
 * parameters are named or shaped differently, so the old params matched no
 * ParameterDef on the new effect and were silently ignored -- the migrated
 * entry rendered at the new effect's declared defaults, discarding whatever
 * the user had actually set, with no error and no visible change in behavior
 * to suggest anything was lost.
 *
 * Every legacy effect's own Rust source is gone -- that is what "legacy"
 * means here -- so where a value is renamed rather than dropped, its exact
 * original range is unverifiable. Renaming is still the better choice than
 * silently discarding it: it preserves the user's stored magnitude on the
 * (disclosed, not certain) assumption that both sides are the same
 * continuous 0-ish-to-declared-max strength slider this codebase uses
 * elsewhere for this class of parameter. Where the shapes are structurally
 * incompatible rather than just renamed, the unmappable keys are dropped
 * outright instead of being left as dead keys the new effect will never
 * read -- a stale key silently doing nothing is exactly today's bug.
 */
const LEGACY_PARAM_REMAP: Record<
  string,
  (params: Record<string, unknown>) => Record<string, unknown>
> = {
  // noise.gaussian and its `std_dev` (0-100, default 15) absorbed both of
  // these. `amount`/`intensity` are the closest continuous-strength
  // equivalent either legacy effect had.
  "noise.gaussian_noise": ({ amount, ...rest }) =>
    amount === undefined ? rest : { ...rest, std_dev: amount },
  "analog.film_grain": ({ intensity, ...rest }) =>
    intensity === undefined ? rest : { ...rest, std_dev: intensity },

  // audio_reactive.spectral_shift's `shift_amount` (0-2, default 0.5) is the
  // closest equivalent to chromatic's old `intensity`.
  "audio_reactive.chromatic": ({ intensity, ...rest }) =>
    intensity === undefined ? rest : { ...rest, shift_amount: intensity },

  // dithering.ordered_variants replaced a continuous `scale` with a named
  // matrix pattern (`matrix`) plus a level count (`levels`) -- a different
  // parameter MODEL, not a rename. There is no honest way to derive a matrix
  // choice from a scale number, so `scale` is dropped and the effect falls
  // back to its own defaults.
  "dithering.ordered": ({ scale: _scale, ...rest }) => rest,

  // dithering.palette's scale/angle/palette_size/amount already match
  // palette_dither's parameter IDs exactly and need no translation. Its
  // per-swatch palette_0..palette_7 custom colors do not: the new effect has
  // no per-color parameters at all (it derives its palette from
  // palette_size instead), so a user's custom palette colors cannot be
  // preserved under any renaming and are dropped rather than left as dead
  // keys.
  "dithering.palette_dither": (params) => {
    const kept: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(params)) {
      if (!/^palette_\d+$/.test(key)) kept[key] = value;
    }
    return kept;
  },
};

export interface OverlayMigrationResult {
  /** The stack with any legacy `overlay.*` entries removed. */
  stack: StackEntry[];
  /** Guides that should be switched on because the stack contained them. */
  guides: Partial<ViewportGuides>;
  /** True when anything was migrated, so callers can inform the user. */
  migrated: boolean;
}

/** Whether an effect ID is a legacy composition-guide overlay. */
export function isLegacyOverlayEffect(effectId: string): boolean {
  return effectId in OVERLAY_TO_GUIDE;
}

/**
 * Strip legacy `overlay.*` entries from a stack, reporting which guides they
 * map to. Only entries that were *enabled* turn their guide on — a disabled
 * overlay effect was not being drawn, so enabling its guide would change what
 * the user sees.
 */
export function migrateOverlayGuides(stack: StackEntry[]): OverlayMigrationResult {
  const guides: Partial<ViewportGuides> = {};
  const kept: StackEntry[] = [];

  for (const entry of stack) {
    const guide = OVERLAY_TO_GUIDE[entry.effectId];
    if (!guide) {
      if (REMOVED_LEGACY_EFFECT_IDS.has(entry.effectId)) continue;
      const effectId = LEGACY_EFFECT_IDS[entry.effectId];
      if (!effectId) {
        kept.push(entry);
        continue;
      }
      const remap = LEGACY_PARAM_REMAP[entry.effectId];
      kept.push({
        ...entry,
        effectId,
        params: remap ? remap(entry.params) : entry.params,
      });
      continue;
    }
    if (entry.enabled) guides[guide] = true;
  }

  return {
    stack: kept,
    guides,
    migrated: kept.length !== stack.length || kept.some((entry, index) => entry.effectId !== stack[index]?.effectId),
  };
}
