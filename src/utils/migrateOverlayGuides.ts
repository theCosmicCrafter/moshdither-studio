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
      kept.push(entry);
      continue;
    }
    if (entry.enabled) guides[guide] = true;
  }

  return { stack: kept, guides, migrated: kept.length !== stack.length };
}
