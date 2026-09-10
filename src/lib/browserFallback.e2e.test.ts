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

    it("gives every effect a name unique to it, not its shader's name", () => {
      // A shader is an implementation shared by many effects, so its name
      // identifies none of them. Naming effects after their shader collapsed 29
      // of the 96 mappings onto duplicates -- twelve datamoshing effects all
      // read "Temporal Datamoshing" and were indistinguishable in the list.
      const effects = getFallbackEffects();
      const byName = new Map<string, string[]>();
      for (const e of effects) {
        byName.set(e.name, [...(byName.get(e.name) ?? []), e.id]);
      }
      const duplicated = [...byName.entries()].filter(([, ids]) => ids.length > 1);
      expect(duplicated).toEqual([]);
    });

    it("warns when an effect is waiting on a file selection", async () => {
      // composite.overlay and a browser-added lut_grading sit in the stack
      // behaving exactly like a disabled effect until their path is chosen,
      // with nothing on screen saying so.
      const { unsetSelectionWarning } = await import("../utils/effectConverter");
      expect(unsetSelectionWarning("composite.overlay", {})).toContain("overlay");
      expect(unsetSelectionWarning("composite.overlay", { overlay_path: "" })).toContain("overlay");
      expect(unsetSelectionWarning("composite.overlay", { overlay_path: "x.png" })).toBeNull();

      expect(unsetSelectionWarning("color.lut_grading", { lut_path: "" })).toContain("LUTs tab");
      expect(unsetSelectionWarning("color.lut_grading", { lut_path: "lut/gotham.png" })).toBeNull();

      // Effects with no required selection never warn.
      expect(unsetSelectionWarning("dithering.bayer", {})).toBeNull();
    });

    it("offers every export format in the save dialog, selected one first", async () => {
      // Listing only the selected format meant the dialog showed MP4/MOV/MKV
      // unless the user had already found the right chip elsewhere in the UI,
      // so GIF and the sequences looked like they did not exist.
      const { saveFiltersFor } = await import("./tauri");
      const gif = saveFiltersFor("gif");
      expect(gif[0].extensions).toEqual(["gif"]);
      expect(gif.length).toBeGreaterThan(5);
      expect(gif.some((f) => f.extensions.includes("mp4"))).toBe(true);

      const dflt = saveFiltersFor("mp4");
      expect(dflt[0].extensions).toEqual(["mp4"]);
      expect(dflt.some((f) => f.extensions.includes("gif"))).toBe(true);
    });

    it("lets the chosen file extension decide the export format", async () => {
      const { formatFromPath } = await import("./tauri");
      // Extension wins over the panel's selection.
      expect(formatFromPath("C:/out/clip.gif", "mp4")).toBe("gif");
      expect(formatFromPath("C:/out/clip.webm", "mp4")).toBe("webm");
      expect(formatFromPath("C:/out/clip.jpg", "mp4")).toBe("jpg_seq");

      // Ambiguous extensions keep the current selection when it already uses
      // them: .png is both a PNG sequence and an APNG, .webp is both.
      expect(formatFromPath("C:/out/clip.png", "apng")).toBe("apng");
      expect(formatFromPath("C:/out/clip.png", "mp4")).toBe("png_seq");
      expect(formatFromPath("C:/out/clip.webp", "webp_seq")).toBe("webp_seq");
      expect(formatFromPath("C:/out/clip.webp", "mp4")).toBe("webp");

      // An unknown extension changes nothing.
      expect(formatFromPath("C:/out/clip.xyz", "mp4")).toBe("mp4");
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
