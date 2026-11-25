/**
 * Pipeline provenance — which engine actually produces an effect's output.
 *
 * Three values:
 * - "pixel": deterministic per-frame pixel processing (Rust effects, or a
 *   WebGL shader computing the same math). Preview and export agree.
 * - "codec": real bitstream corruption via the FFglitch path (ffgac/ffedit).
 *   The honest mosh — needs compressed video, can never preview live.
 * - "sim": pixel-domain simulation of a codec technique. The `datamoshing.*`
 *   stack effects (Frame Stutter, MV Zoom, etc.) operate on decoded frames —
 *   their own doc comments say so. Real mosh lives behind apply_ffglitch.
 *
 * This is the single source of truth for the CODEC / ~sim chips in the
 * library and on layer cards. Keep it honest: the moment an effect's
 * underlying engine changes, this map is wrong.
 */

export type EffectPipeline = "pixel" | "codec" | "sim";

export function effectPipeline(meta: {
  id: string;
  category: string;
  pipeline?: "pixel" | "codec";
}): EffectPipeline {
  // The backend declares the real pipeline on every registered effect. Trust
  // it — Rust knows which effects it built as pass-throughs — and keep the
  // heuristics below for browser-fallback metas and older payloads that
  // carry no `pipeline` field.
  if (meta.pipeline === "codec") return "codec";
  if (meta.pipeline === "pixel") {
    // "sim" stays a frontend refinement: Rust only knows pixel vs codec, and
    // the datamoshing.* stack effects ARE pixel effects that merely imitate
    // bitstream corruption. The chip must keep saying ~sim.
    if (meta.category === "datamoshing" || SIM_EFFECT_IDS.has(meta.id)) return "sim";
    return "pixel";
  }
  if (meta.id.startsWith("ffglitch.")) return "codec";
  // Every datamoshing.* stack effect is a pixel-domain simulation of codec
  // corruption — see the doc comments in src-tauri/src/effects/datamoshing/*.
  // Real bitstream mosh is only reachable via the FFglitch subprocess path.
  if (meta.category === "datamoshing") return "sim";
  // Corruption sims outside the datamoshing category — self-described in
  // their Rust doc comments as simulating codec/file-format damage.
  if (SIM_EFFECT_IDS.has(meta.id)) return "sim";
  return "pixel";
}

const SIM_EFFECT_IDS = new Set([
  "glitch.macroblock_glitch", // "simulates H.264-style block corruption"
  "glitch.png_chunk",         // "simulates ... byte-level PNG corruption"
]);
