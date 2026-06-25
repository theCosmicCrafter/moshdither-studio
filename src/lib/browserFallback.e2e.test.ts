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

    it("includes overlay effects", () => {
      const effects = getFallbackEffects();
      const ids = effects.map((e) => e.id);
      expect(ids).toContain("overlay.pixel_grid");
      expect(ids).toContain("overlay.safe_area");
      expect(ids).toContain("overlay.rule_of_thirds");
      expect(ids).toContain("overlay.crosshairs");
    });

    it("derives correct categories from effect IDs", () => {
      const effects = getFallbackEffects();
      const overlay = effects.find((e) => e.id === "overlay.pixel_grid");
      expect(overlay?.category).toBe("overlay");

      const dithering = effects.find((e) => e.id === "dithering.bayer");
      expect(dithering?.category).toBe("dithering");

      const analog = effects.find((e) => e.id === "analog.scanlines");
      expect(analog?.category).toBe("analog");
    });

    it("derives parameters from shader uniforms", () => {
      const effects = getFallbackEffects();
      const pixelGrid = effects.find((e) => e.id === "overlay.pixel_grid");
      expect(pixelGrid).toBeDefined();
      const paramIds = pixelGrid!.parameters.map((p) => p.id);
      expect(paramIds).toContain("grid_size");
      expect(paramIds).toContain("line_width");
      expect(paramIds).toContain("opacity");
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
