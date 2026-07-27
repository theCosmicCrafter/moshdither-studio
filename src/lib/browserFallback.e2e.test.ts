import { describe, it, expect } from "vitest";
import { getFallbackEffects, isTauriAvailable } from "./browserFallback";
import { shaderRegistry } from "../engine/shaders";
import { rustToWebGL } from "../utils/effectConverter";

describe("Browser Fallback E2E", () => {
  describe("getFallbackEffects", () => {
    it("returns effects for all rustToWebGL mappings with registered shaders", () => {
      const effects = getFallbackEffects();
      expect(effects.length).toBeGreaterThan(50);
    });

    it("every fallback effect has a valid EffectMeta shape", () => {
      const effects = getFallbackEffects();
      for (const eff of effects) {
        expect(eff.id).toBeTruthy();
        expect(eff.name).toBeTruthy();
        expect(eff.category).toBeTruthy();
        expect(eff.media_type).toBeTruthy();
        expect(Array.isArray(eff.parameters)).toBe(true);
      }
    });

    it("excludes composition guides — they are not effects", () => {
      // safe area / rule of thirds / crosshairs / pixel grid were demoted out of
      // the registry to a viewport overlay so they cannot reach an export.
      const ids = getFallbackEffects().map((e) => e.id);
      for (const id of [
        "overlay.pixel_grid",
        "overlay.safe_area",
        "overlay.rule_of_thirds",
        "overlay.crosshairs",
      ]) {
        expect(ids).not.toContain(id);
      }
    });

    it("derives correct categories from effect IDs", () => {
      const effects = getFallbackEffects();
      const dithering = effects.find((e) => e.id === "dithering.bayer");
      expect(dithering?.category).toBe("dithering");

      const analog = effects.find((e) => e.id === "analog.scanlines");
      expect(analog?.category).toBe("analog");
    });

    it("derives parameters from shader uniforms", () => {
      const effects = getFallbackEffects();
      const pixelate = effects.find((e) => e.id === "pixel_geo.pixelate");
      expect(pixelate).toBeDefined();
      expect(pixelate!.parameters.map((p) => p.id)).toContain("block_size");
    });

    it("every fallback effect's shaderId exists in registry", () => {
      for (const [effectId, mapping] of Object.entries(rustToWebGL)) {
        if (shaderRegistry.has(mapping.shaderId)) {
          const effects = getFallbackEffects();
          const eff = effects.find((e) => e.id === effectId);
          expect(eff).toBeDefined();
        }
      }
    });
  });

  describe("isTauriAvailable", () => {
    it("returns false in test environment (no __TAURI_INTERNALS__)", () => {
      expect(isTauriAvailable()).toBe(false);
    });
  });
});
