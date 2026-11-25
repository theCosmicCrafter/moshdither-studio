/**
 * effectPipeline — the single source of truth for the pixel / sim / codec
 * chips. Since the backend started declaring `pipeline` on every effect meta
 * (Phase 3 codec layers), the declared value must win; the id/category
 * heuristics remain only for browser-fallback metas and older payloads that
 * carry no `pipeline` field.
 */
import { describe, it, expect } from "vitest";
import { effectPipeline } from "./effectPipeline";

describe("effectPipeline", () => {
  it("trusts a declared codec pipeline", () => {
    // Even with a non-ffglitch id, the backend's word stands.
    expect(
      effectPipeline({ id: "anything.at_all", category: "glitch", pipeline: "codec" })
    ).toBe("codec");
  });

  it("trusts a declared pixel pipeline, refined to sim for datamoshing sims", () => {
    // Rust only knows pixel vs codec; "sim" is the frontend's honest label
    // for pixel effects that merely imitate bitstream corruption, and it must
    // survive the declared field rather than collapsing back to "pixel".
    expect(
      effectPipeline({ id: "datamoshing.classic", category: "datamoshing", pipeline: "pixel" })
    ).toBe("sim");
    expect(
      effectPipeline({ id: "glitch.macroblock_glitch", category: "glitch", pipeline: "pixel" })
    ).toBe("sim");
    expect(
      effectPipeline({ id: "color.invert", category: "color", pipeline: "pixel" })
    ).toBe("pixel");
  });

  it("falls back to the ffglitch.* id heuristic when pipeline is absent", () => {
    expect(effectPipeline({ id: "ffglitch.zoom", category: "datamoshing" })).toBe("codec");
    expect(effectPipeline({ id: "ffglitch.slam zoom", category: "datamoshing" })).toBe("codec");
  });

  it("labels datamoshing.* metas without a pipeline field as sim", () => {
    expect(effectPipeline({ id: "datamoshing.frame_reverse", category: "datamoshing" })).toBe("sim");
  });

  it("labels unrelated effects without a pipeline field as pixel", () => {
    expect(effectPipeline({ id: "dithering.bayer", category: "dithering" })).toBe("pixel");
  });
});
