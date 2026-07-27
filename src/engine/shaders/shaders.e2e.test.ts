import { describe, it, expect } from "vitest";
import "./index";
import { shaderRegistry } from "./registry";

describe("WebGL Shader Registry E2E", () => {
  describe("Registry operations", () => {
    it("has shaders registered", () => {
      // Was >60 before the seven dead error-diffusion shaders and the four
      // composition-guide shaders were removed.
      expect(shaderRegistry.list().length).toBeGreaterThan(50);
    });

    it("get returns shader by id", () => {
      const shader = shaderRegistry.get("pass_through");
      expect(shader).toBeDefined();
      expect(shader?.id).toBe("pass_through");
    });

    it("has returns true for registered, false for unknown", () => {
      expect(shaderRegistry.has("pass_through")).toBe(true);
      expect(shaderRegistry.has("nonexistent_shader")).toBe(false);
    });
  });


  describe("Shader structure validity", () => {
    const requiredShaders = [
      "pass_through",
      "bayer_dither",
      "scanlines",
      "vhs_crt",
      "chromatic_aberration",
      "pixelate",
      "invert",
      "posterize",
      "audioBassPulse",
      "audioGlitchBeat",
      "temporalDatamoshing",
      "motionVectorGlitch",
    ];

    for (const shaderId of requiredShaders) {
      it(`shader "${shaderId}" has valid vertex and fragment sources`, () => {
        const shader = shaderRegistry.get(shaderId);
        expect(shader).toBeDefined();
        expect(shader!.vertexSource).toBeTruthy();
        expect(shader!.fragmentSource).toBeTruthy();
        expect(shader!.vertexSource.length).toBeGreaterThan(50);
        expect(shader!.fragmentSource.length).toBeGreaterThan(50);
      });
    }

    it("all shaders have unique IDs", () => {
      const all = shaderRegistry.list();
      const ids = all.map((s) => s.id);
      const unique = new Set(ids);
      expect(unique.size).toBe(ids.length);
    });

  });


  describe("listByCategory", () => {
    it("filters shaders by category prefix", () => {
      const dithering = shaderRegistry.listByCategory("bayer");
      expect(dithering.length).toBeGreaterThan(0);
    });
  });
});
