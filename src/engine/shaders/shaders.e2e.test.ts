import { describe, it, expect } from "vitest";
import "./index";
import { shaderRegistry } from "./registry";

describe("WebGL Shader Registry E2E", () => {
  describe("Registry operations", () => {
    it("has shaders registered", () => {
      expect(shaderRegistry.list().length).toBeGreaterThan(60);
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

  describe("Overlay shaders", () => {
    it("pixel_grid_overlay shader is registered with correct id", () => {
      const shader = shaderRegistry.get("pixel_grid_overlay");
      expect(shader).toBeDefined();
      expect(shader?.name).toBe("Pixel Grid Overlay");
    });

    it("safe_area shader is registered with correct id", () => {
      const shader = shaderRegistry.get("safe_area");
      expect(shader).toBeDefined();
      expect(shader?.name).toBe("Safe Area Guides");
    });

    it("rule_of_thirds shader is registered with correct id", () => {
      const shader = shaderRegistry.get("rule_of_thirds");
      expect(shader).toBeDefined();
      expect(shader?.name).toBe("Rule of Thirds Grid");
    });

    it("crosshairs shader is registered with correct id", () => {
      const shader = shaderRegistry.get("crosshairs");
      expect(shader).toBeDefined();
      expect(shader?.name).toBe("Corner Crosshairs");
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
      "pixel_grid_overlay",
      "safe_area",
      "rule_of_thirds",
      "crosshairs",
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

    it("overlay shaders have uniforms with defaults", () => {
      const overlays = ["pixel_grid_overlay", "safe_area", "rule_of_thirds", "crosshairs"];
      for (const id of overlays) {
        const shader = shaderRegistry.get(id);
        expect(shader).toBeDefined();
        expect(shader!.uniforms.length).toBeGreaterThan(0);
        for (const u of shader!.uniforms) {
          if (u.type !== "sampler2D") {
            expect(u.default).toBeDefined();
          }
        }
      }
    });
  });

  describe("Overlay shader uniform definitions", () => {
    it("pixel_grid_overlay has gridSize, lineWidth, opacity, gridColor uniforms", () => {
      const shader = shaderRegistry.get("pixel_grid_overlay");
      const names = shader!.uniforms.map((u) => u.name);
      expect(names).toContain("gridSize");
      expect(names).toContain("lineWidth");
      expect(names).toContain("opacity");
      expect(names).toContain("gridColor");
    });

    it("safe_area has margin, lineWidth, opacity uniforms", () => {
      const shader = shaderRegistry.get("safe_area");
      const names = shader!.uniforms.map((u) => u.name);
      expect(names).toContain("margin");
      expect(names).toContain("lineWidth");
      expect(names).toContain("opacity");
    });

    it("rule_of_thirds has lineWidth, opacity uniforms", () => {
      const shader = shaderRegistry.get("rule_of_thirds");
      const names = shader!.uniforms.map((u) => u.name);
      expect(names).toContain("lineWidth");
      expect(names).toContain("opacity");
    });

    it("crosshairs has size, lineWidth, opacity uniforms", () => {
      const shader = shaderRegistry.get("crosshairs");
      const names = shader!.uniforms.map((u) => u.name);
      expect(names).toContain("size");
      expect(names).toContain("lineWidth");
      expect(names).toContain("opacity");
    });
  });

  describe("listByCategory", () => {
    it("filters shaders by category prefix", () => {
      const dithering = shaderRegistry.listByCategory("bayer");
      expect(dithering.length).toBeGreaterThan(0);
    });
  });
});
