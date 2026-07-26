import { describe, it, expect } from "vitest";
import {
  rustToWebGL,
  stackToRenderPasses,
  stackToRustPayload,
  resolveMaskId,
  hasWebGLPreview,
  listPreviewableEffects,
  buildShaderMap,
} from "./effectConverter";
import { shaderRegistry } from "../engine/shaders";
import type { StackEntry } from "../store";

function makeStackEntry(
  id: string,
  effectId: string,
  params: Record<string, unknown> = {},
  enabled = true
): StackEntry {
  void effectId;
  return {
    id,
    effectId,
    effectName: effectId,
    params,
    enabled,
    maskId: null,
    maskMode: "inside",
  };
}

describe("Effect Pipeline E2E", () => {
  describe("rustToWebGL mapping completeness", () => {
    const categories = [
      "dithering",
      "analog",
      "color",
      "artistic",
      "noise",
      "glitch",
      "pixel_geo",
      "datamoshing",
      "audio_reactive",
    ];

    for (const cat of categories) {
      it(`category "${cat}" has at least one mapping`, () => {
        const entries = Object.entries(rustToWebGL).filter(
          ([id]) => id.startsWith(cat + ".") || id === cat
        );
        expect(entries.length).toBeGreaterThan(0);
      });
    }

    it("every mapping points to a registered shader", () => {
      for (const [, mapping] of Object.entries(rustToWebGL)) {
        expect(shaderRegistry.has(mapping.shaderId)).toBe(true);
      }
    });

    it("composition guides are not mapped — they are not effects", () => {
      // Demoted to a viewport overlay so framing aids cannot be exported.
      for (const id of [
        "overlay.pixel_grid",
        "overlay.safe_area",
        "overlay.rule_of_thirds",
        "overlay.crosshairs",
      ]) {
        expect(rustToWebGL[id]).toBeUndefined();
      }
    });

    it("every paramMap target uniform is declared in the target shader", () => {
      for (const [effectId, mapping] of Object.entries(rustToWebGL)) {
        if (mapping.shaderId === "pass_through") continue;
        const shader = shaderRegistry.get(mapping.shaderId);
        expect(shader, `Shader ${mapping.shaderId} for effect ${effectId} not registered`).toBeDefined();
        if (!shader) continue;
        const declaredUniforms = new Set(shader.uniforms.map((u) => u.name));
        for (const [rustKey, webglUniform] of Object.entries(mapping.paramMap)) {
          if (webglUniform === "tLUT" || webglUniform === "u_maskTexture") continue;
          expect(
            declaredUniforms.has(webglUniform),
            `Effect ${effectId} maps param '${rustKey}' to uniform '${webglUniform}', but shader '${mapping.shaderId}' does not declare uniform '${webglUniform}'`
          ).toBe(true);
        }
      }
    });
  });

  describe("stackToRenderPasses", () => {
    it("converts a simple stack to render passes", () => {
      const stack: StackEntry[] = [makeStackEntry("s1", "dithering.bayer", { matrix_size: 4 })];
      const passes = stackToRenderPasses(stack);
      expect(passes).toHaveLength(1);
      expect(passes[0].shaderId).toBe("bayer_dither");
      expect(passes[0].inputTexture).toBe("source");
      expect(passes[0].outputFramebuffer).toBe("pass_0");
    });

    it("chains multiple effects with ping-ponging", () => {
      const stack: StackEntry[] = [
        makeStackEntry("s1", "dithering.bayer", { matrix_size: 4 }),
        makeStackEntry("s2", "analog.scanlines", { intensity: 50, gap: 240 }),
      ];
      const passes = stackToRenderPasses(stack);
      expect(passes).toHaveLength(2);
      expect(passes[1].inputTexture).toBe("pass_0");
      expect(passes[1].outputFramebuffer).toBe("pass_1");
    });

    it("skips disabled effects", () => {
      const stack: StackEntry[] = [
        makeStackEntry("s1", "dithering.bayer", { matrix_size: 4 }, false),
        makeStackEntry("s2", "analog.scanlines", { intensity: 50, gap: 240 }),
      ];
      const passes = stackToRenderPasses(stack);
      expect(passes).toHaveLength(1);
      expect(passes[0].shaderId).toBe("scanlines");
      expect(passes[0].inputTexture).toBe("source");
    });

    it("skips effects with no WebGL mapping", () => {
      const stack: StackEntry[] = [
        makeStackEntry("s1", "nonexistent.effect", { foo: 1 }),
        makeStackEntry("s2", "dithering.bayer", { matrix_size: 4 }),
      ];
      const passes = stackToRenderPasses(stack);
      expect(passes).toHaveLength(1);
      expect(passes[0].shaderId).toBe("bayer_dither");
    });

    it("applies transform functions for parameter conversion", () => {
      const stack: StackEntry[] = [
        makeStackEntry("s1", "analog.chromatic_aberration", { shift: 10 }),
      ];
      const passes = stackToRenderPasses(stack);
      expect(passes[0].uniforms.amount).toBe(1);
    });

    it("skips legacy overlay entries left in an old saved stack", () => {
      // migrateOverlayGuides strips these on load, but a stack that slipped
      // through must not produce a render pass for a shader that no longer
      // exists.
      const stack: StackEntry[] = [
        makeStackEntry("s1", "dithering.bayer", { matrix_size: 4 }),
        makeStackEntry("s2", "overlay.pixel_grid", { grid_size: 32, line_width: 1, opacity: 0.5 }),
      ];
      const passes = stackToRenderPasses(stack);
      expect(passes).toHaveLength(1);
      expect(passes[0].shaderId).toBe("bayer_dither");
    });

    it("handles vec3 uniform grouping (lift_gamma_gain)", () => {
      const stack: StackEntry[] = [
        makeStackEntry("s1", "color.lift_gamma_gain", {
          lift_r: 0.1,
          lift_g: 0.2,
          lift_b: 0.3,
          gamma_r: 0.4,
          gamma_g: 0.5,
          gamma_b: 0.6,
          gain_r: 0.7,
          gain_g: 0.8,
          gain_b: 0.9,
        }),
      ];
      const passes = stackToRenderPasses(stack);
      expect(passes[0].uniforms.lift).toEqual([0.1, 0.2, 0.3]);
      expect(passes[0].uniforms.gamma).toEqual([0.4, 0.5, 0.6]);
      expect(passes[0].uniforms.gain).toEqual([0.7, 0.8, 0.9]);
    });

    it("empty stack produces empty passes", () => {
      expect(stackToRenderPasses([])).toHaveLength(0);
    });

    it("provides default sampler2D uniforms (tLUT)", () => {
      const stack: StackEntry[] = [makeStackEntry("s1", "color.lut_grading", { amount: 1.0 })];
      const passes = stackToRenderPasses(stack);
      expect(passes[0].uniforms.tLUT).toBeDefined();
    });
  });

  describe("buildShaderMap", () => {
    it("builds a map of unique shaders needed", () => {
      const stack: StackEntry[] = [
        makeStackEntry("s1", "dithering.bayer", { matrix_size: 4 }),
        makeStackEntry("s2", "dithering.bayer", { matrix_size: 8 }),
        makeStackEntry("s3", "analog.scanlines", { intensity: 50, gap: 240 }),
      ];
      const passes = stackToRenderPasses(stack);
      const map = buildShaderMap(passes);
      expect(map.size).toBe(2);
      expect(map.has("bayer_dither")).toBe(true);
      expect(map.has("scanlines")).toBe(true);
    });
  });

  describe("hasWebGLPreview / listPreviewableEffects", () => {
    it("returns true for effects with valid mappings", () => {
      expect(hasWebGLPreview("dithering.bayer")).toBe(true);
      expect(hasWebGLPreview("pixel_geo.pixelate")).toBe(true);
    });

    it("returns false for unknown effects", () => {
      expect(hasWebGLPreview("nonexistent.effect")).toBe(false);
    });

    it("listPreviewableEffects returns all mapped effects", () => {
      const previewable = listPreviewableEffects();
      expect(previewable.length).toBeGreaterThan(50);
      expect(previewable).toContain("dithering.bayer");
      expect(previewable).toContain("pixel_geo.pixelate");
      // Composition guides are no longer effects and have no mapping.
      expect(previewable).not.toContain("overlay.pixel_grid");
    });
  });

  describe("stackToRustPayload", () => {
    it("converts stack to Rust IPC format", () => {
      const stack: StackEntry[] = [
        makeStackEntry("s1", "dithering.bayer", { matrix_size: 4 }),
        makeStackEntry("s2", "analog.scanlines", { intensity: 50 }),
      ];
      const payload = stackToRustPayload(stack, null, []);
      expect(payload).toHaveLength(2);
      expect(payload[0].effect_id).toBe("dithering.bayer");
      expect(payload[0].params.matrix_size).toBe(4);
      expect(payload[0].mask_b64).toBeNull();
      expect(payload[0].mask_mode).toBe("inside");
    });

    it("injects time param when provided", () => {
      const stack: StackEntry[] = [makeStackEntry("s1", "dithering.bayer", { matrix_size: 4 })];
      const payload = stackToRustPayload(stack, null, [], 2.5);
      expect(payload[0].params.time).toBe(2.5);
    });

    it("filters disabled effects", () => {
      const stack: StackEntry[] = [
        makeStackEntry("s1", "dithering.bayer", {}, false),
        makeStackEntry("s2", "analog.scanlines", {}),
      ];
      const payload = stackToRustPayload(stack, null, []);
      expect(payload).toHaveLength(1);
    });

    it("resolves maskId to base64", () => {
      const stack: StackEntry[] = [makeStackEntry("s1", "dithering.bayer", {})];
      stack[0].maskId = "active";
      const payload = stackToRustPayload(stack, "base64mask", []);
      expect(payload[0].mask_b64).toBe("base64mask");
    });

    it("resolves sam3 mask index", () => {
      const stack: StackEntry[] = [makeStackEntry("s1", "dithering.bayer", {})];
      stack[0].maskId = "sam3-1";
      const payload = stackToRustPayload(stack, null, ["mask0", "mask1", "mask2"]);
      expect(payload[0].mask_b64).toBe("mask1");
    });

    it("propagates mask_mode to Rust payload", () => {
      const stack: StackEntry[] = [makeStackEntry("s1", "dithering.bayer", {})];
      stack[0].maskId = "active";
      stack[0].maskMode = "outside";
      const payload = stackToRustPayload(stack, "mask123", []);
      expect(payload[0].mask_mode).toBe("outside");
    });

    it("supports alpha mask mode", () => {
      const stack: StackEntry[] = [makeStackEntry("s1", "dithering.bayer", {})];
      stack[0].maskId = "active";
      stack[0].maskMode = "alpha";
      const payload = stackToRustPayload(stack, "mask123", []);
      expect(payload[0].mask_mode).toBe("alpha");
    });

    it("per-effect sam3 mask overrides active mask", () => {
      const stack: StackEntry[] = [makeStackEntry("s1", "dithering.bayer", {})];
      stack[0].maskId = "sam3-0";
      stack[0].maskMode = "inside";
      const payload = stackToRustPayload(stack, "globalMask", ["samMask0"]);
      expect(payload[0].mask_b64).toBe("samMask0");
    });

    it("disabled effect with mask is filtered out", () => {
      const stack: StackEntry[] = [
        makeStackEntry("s1", "dithering.bayer", {}, false),
        makeStackEntry("s2", "analog.scanlines", {}),
      ];
      stack[0].maskId = "active";
      stack[1].maskId = "active";
      const payload = stackToRustPayload(stack, "mask123", []);
      expect(payload).toHaveLength(1);
      expect(payload[0].effect_id).toBe("analog.scanlines");
    });

    it("multi-effect stack with different masks and modes", () => {
      const stack: StackEntry[] = [
        makeStackEntry("s1", "dithering.bayer", { matrix_size: 4 }),
        makeStackEntry("s2", "analog.scanlines", { intensity: 50 }),
        makeStackEntry("s3", "glitch.databend", { amount: 10 }),
      ];
      stack[0].maskId = "active";
      stack[0].maskMode = "inside";
      stack[1].maskId = "sam3-2";
      stack[1].maskMode = "outside";
      stack[2].maskId = null;
      stack[2].maskMode = "alpha";

      const payload = stackToRustPayload(stack, "activeMaskB64", ["m0", "m1", "m2"]);
      expect(payload).toHaveLength(3);
      expect(payload[0].mask_b64).toBe("activeMaskB64");
      expect(payload[0].mask_mode).toBe("inside");
      expect(payload[1].mask_b64).toBe("m2");
      expect(payload[1].mask_mode).toBe("outside");
      expect(payload[2].mask_b64).toBeNull();
      expect(payload[2].mask_mode).toBe("alpha");
    });

    it("null activeMask with active maskId resolves to null", () => {
      const stack: StackEntry[] = [makeStackEntry("s1", "dithering.bayer", {})];
      stack[0].maskId = "active";
      const payload = stackToRustPayload(stack, null, []);
      expect(payload[0].mask_b64).toBeNull();
    });

    it("sam3-0 resolves to first mask", () => {
      const stack: StackEntry[] = [makeStackEntry("s1", "dithering.bayer", {})];
      stack[0].maskId = "sam3-0";
      const payload = stackToRustPayload(stack, null, ["firstMask", "secondMask"]);
      expect(payload[0].mask_b64).toBe("firstMask");
    });
  });

  describe("resolveMaskId", () => {
    it("returns null for null maskId", () => {
      expect(resolveMaskId(null, "active", [])).toBeNull();
    });

    it("returns activeMask for 'active'", () => {
      expect(resolveMaskId("active", "activemask", [])).toBe("activemask");
    });

    it("returns sam3 mask by index", () => {
      expect(resolveMaskId("sam3-2", null, ["m0", "m1", "m2"])).toBe("m2");
    });

    it("returns null for invalid sam3 index", () => {
      expect(resolveMaskId("sam3-99", null, ["m0"])).toBeNull();
    });

    it("returns null for unknown maskId format", () => {
      expect(resolveMaskId("unknown", null, [])).toBeNull();
    });
  });
});
