import { describe, expect, it } from "vitest";
import type { StackEntry } from "../store";
import { isLegacyOverlayEffect, migrateOverlayGuides } from "./migrateOverlayGuides";

function entry(effectId: string, enabled = true): StackEntry {
  return {
    id: `${effectId}-1`,
    effectId,
    effectName: effectId,
    params: {},
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
});
