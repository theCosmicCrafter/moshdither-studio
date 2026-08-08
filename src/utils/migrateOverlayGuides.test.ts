import { describe, expect, it } from "vitest";
import type { StackEntry } from "../store";
import { isLegacyOverlayEffect, migrateOverlayGuides } from "./migrateOverlayGuides";

function entry(
  effectId: string,
  enabled = true,
  params: Record<string, unknown> = {}
): StackEntry {
  return {
    id: `${effectId}-1`,
    effectId,
    effectName: effectId,
    params,
    enabled,
    maskId: null,
    maskMode: "inside",
  };
}

describe("migrateOverlayGuides", () => {
  it("leaves a stack with no legacy overlays untouched", () => {
    const stack = [entry("dithering.bayer"), entry("analog.scanlines")];
    const result = migrateOverlayGuides(stack);
    expect(result.migrated).toBe(false);
    expect(result.stack).toEqual(stack);
    expect(result.guides).toEqual({});
  });

  it("strips legacy overlay entries and turns on the matching guides", () => {
    const result = migrateOverlayGuides([
      entry("dithering.bayer"),
      entry("overlay.safe_area"),
      entry("overlay.rule_of_thirds"),
    ]);

    expect(result.migrated).toBe(true);
    expect(result.stack.map((e) => e.effectId)).toEqual(["dithering.bayer"]);
    expect(result.guides).toEqual({ safeArea: true, ruleOfThirds: true });
  });

  it("maps every legacy overlay ID to a guide", () => {
    const result = migrateOverlayGuides([
      entry("overlay.safe_area"),
      entry("overlay.rule_of_thirds"),
      entry("overlay.crosshairs"),
      entry("overlay.pixel_grid"),
    ]);

    expect(result.stack).toEqual([]);
    expect(result.guides).toEqual({
      safeArea: true,
      ruleOfThirds: true,
      crosshairs: true,
      pixelGrid: true,
    });
  });

  it("does not enable a guide for a disabled overlay entry", () => {
    // A disabled overlay effect was not being drawn. Turning its guide on would
    // show the user something that was not there before the migration.
    const result = migrateOverlayGuides([entry("overlay.crosshairs", false)]);

    expect(result.migrated).toBe(true);
    expect(result.stack).toEqual([]);
    expect(result.guides).toEqual({});
  });

  it("preserves the order of the effects it keeps", () => {
    const result = migrateOverlayGuides([
      entry("color.invert"),
      entry("overlay.pixel_grid"),
      entry("dithering.bayer"),
      entry("overlay.crosshairs"),
      entry("glitch.databend"),
    ]);

    expect(result.stack.map((e) => e.effectId)).toEqual([
      "color.invert",
      "dithering.bayer",
      "glitch.databend",
    ]);
  });

  it("recognises exactly the four legacy overlay IDs", () => {
    for (const id of [
      "overlay.safe_area",
      "overlay.rule_of_thirds",
      "overlay.crosshairs",
      "overlay.pixel_grid",
    ]) {
      expect(isLegacyOverlayEffect(id)).toBe(true);
    }
    // composite.overlay is a real effect and must survive the migration.
    expect(isLegacyOverlayEffect("composite.overlay")).toBe(false);
    expect(isLegacyOverlayEffect("dithering.bayer")).toBe(false);
  });

  it("keeps composite.overlay, which is a genuine effect", () => {
    const result = migrateOverlayGuides([entry("composite.overlay")]);
    expect(result.migrated).toBe(false);
    expect(result.stack.map((e) => e.effectId)).toEqual(["composite.overlay"]);
  });

  it("updates historical effect IDs before they reach the strict Rust registry", () => {
    const result = migrateOverlayGuides([
      entry("noise.gaussian_noise"),
      entry("color.contrast_brightness"),
      entry("dithering.palette_dither"),
      entry("analog.scanlines"),
    ]);

    expect(result.migrated).toBe(true);
    expect(result.stack.map((e) => e.effectId)).toEqual([
      "noise.gaussian",
      "color.brightness_contrast",
      "dithering.palette",
      "analog.scanlines",
    ]);
  });

  // An ID rename alone is not enough: the renamed effect's parameters are
  // named or shaped differently on four of the seven targets, so the old
  // params matched nothing on the new effect and were silently ignored --
  // rendering at the new effect's defaults with no indication anything had
  // changed. Each case below pins the actual translation, not just that
  // *some* value survives.
  it("renames noise.gaussian_noise's amount to std_dev", () => {
    const result = migrateOverlayGuides([
      entry("noise.gaussian_noise", true, { amount: 42 }),
    ]);
    expect(result.stack).toEqual([
      expect.objectContaining({ effectId: "noise.gaussian", params: { std_dev: 42 } }),
    ]);
  });

  it("renames analog.film_grain's intensity to std_dev", () => {
    const result = migrateOverlayGuides([
      entry("analog.film_grain", true, { intensity: 30 }),
    ]);
    expect(result.stack).toEqual([
      expect.objectContaining({ effectId: "noise.gaussian", params: { std_dev: 30 } }),
    ]);
  });

  it("renames audio_reactive.chromatic's intensity to spectral_shift's shift_amount", () => {
    const result = migrateOverlayGuides([
      entry("audio_reactive.chromatic", true, { intensity: 0.8 }),
    ]);
    expect(result.stack).toEqual([
      expect.objectContaining({
        effectId: "audio_reactive.spectral_shift",
        params: { shift_amount: 0.8 },
      }),
    ]);
  });

  it("drops dithering.ordered's scale, which has no equivalent on ordered_variants", () => {
    // ordered_variants replaced a continuous scale with a named matrix
    // pattern plus a level count -- a different parameter model, not a
    // rename. There is no honest translation, so the stale key is dropped
    // rather than left inert.
    const result = migrateOverlayGuides([
      entry("dithering.ordered", true, { scale: 8 }),
    ]);
    expect(result.stack).toEqual([
      expect.objectContaining({ effectId: "dithering.ordered_variants", params: {} }),
    ]);
  });

  it("carries scale/angle/palette_size/amount through unchanged but drops palette_0..7", () => {
    // dithering.palette's parameters already match palette_dither's names
    // exactly. Its custom per-swatch colors have no destination on the new
    // effect (it derives its palette from palette_size instead), so they
    // cannot be preserved under any renaming.
    const result = migrateOverlayGuides([
      entry("dithering.palette_dither", true, {
        scale: 4,
        angle: 45,
        palette_size: 8,
        amount: 0.9,
        palette_0: [0, 0, 0],
        palette_7: [255, 255, 255],
      }),
    ]);
    expect(result.stack).toEqual([
      expect.objectContaining({
        effectId: "dithering.palette",
        params: { scale: 4, angle: 45, palette_size: 8, amount: 0.9 },
      }),
    ]);
  });

  it("leaves params of a legacy ID with no remap function untouched", () => {
    const result = migrateOverlayGuides([
      entry("color.contrast_brightness", true, { brightness: 10, contrast: 5 }),
    ]);
    expect(result.stack).toEqual([
      expect.objectContaining({
        effectId: "color.brightness_contrast",
        params: { brightness: 10, contrast: 5 },
      }),
    ]);
  });
});
