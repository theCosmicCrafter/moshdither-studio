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

  // The live-preview render loop (PreviewViewport.tsx) only keeps rendering
  // every frame when the active stack has a shader marked `animated: true` --
  // otherwise it renders once and stops, since a static image produces
  // identical output on every subsequent frame regardless. Tying `animated`
  // directly to whether the shader's own GLSL reads u_time/u_frame (rather
  // than hand-maintaining a separate list) means this test fails the moment
  // either goes out of sync with the other, in either direction.
  describe("animated flag matches actual time-uniform usage", () => {
    // Strip `//` comments first -- chromatic_aberration's fragmentSource, for
    // example, has an explanatory comment about a u_time pulse that was
    // deliberately removed, which would otherwise read as "still uses it."
    const readsTimeUniform = (fragmentSource: string) => {
      const code = fragmentSource.replace(/\/\/.*$/gm, "");
      return /\bu_time\b|\bu_frame\b/.test(code);
    };

    for (const shader of shaderRegistry.list()) {
      it(`"${shader.id}": animated flag agrees with fragment source`, () => {
        const usesTime = readsTimeUniform(shader.fragmentSource);
        if (usesTime) {
          expect(
            shader.animated,
            `"${shader.id}" reads u_time/u_frame but is not marked animated: true -- ` +
              `the live-preview loop would render it once and never update it again.`
          ).toBe(true);
        } else {
          expect(
            shader.animated,
            `"${shader.id}" is marked animated: true but never reads u_time/u_frame -- ` +
              `the live-preview loop will render it forever at 60fps for no visual benefit.`
          ).not.toBe(true);
        }
      });
    }
  });
});
