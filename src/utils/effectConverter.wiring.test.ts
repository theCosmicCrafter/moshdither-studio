/**
 * Preview/export parameter-wiring contract.
 *
 * `stackToRenderPasses` resolves uniforms by reading `entry.params[rustParam]`
 * for every key in a mapping's `paramMap`. If a key is not an actual Rust
 * `ParameterDef` id the lookup yields `undefined`, the uniform is never set,
 * and the shader silently keeps its compiled-in default — the slider moves,
 * the preview does not, and the export diverges from what the user sees.
 *
 * Nothing in the type system catches that: `paramMap` is `Record<string,
 * string>` on both sides. These tests are the guard. They parse the Rust effect
 * sources directly rather than using a checked-in fixture, so they cannot go
 * stale when an effect gains or renames a parameter.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { rustToWebGL, stackToRenderPasses, stackToRustPayload } from "./effectConverter";
import type { StackEntry, Keyframe, EffectMeta } from "../store";
import { shaderRegistry } from "../engine/shaders";

const HERE = dirname(fileURLToPath(import.meta.url));
const EFFECTS_DIR = resolve(HERE, "../../src-tauri/src/effects");

/** Params that are file paths — they are resolved by the Rust export pipeline
 *  and have no meaningful WebGL uniform, so they are exempt from coverage. */
const PATH_PARAM = /(_path|_paths)$/;

function walkRustFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkRustFiles(full));
    else if (entry.name.endsWith(".rs")) out.push(full);
  }
  return out;
}

/**
 * Map every `<category>.<effect>` id found in the Rust sources to the set of
 * `ParameterDef { id: "..." }` values declared after it in the same file.
 */
function parseRustEffectParams(): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  // Anchor on `EffectMeta { id: ... }` rather than a bare `id:` field —
  // ParameterDef literals use the same field name, and matching those too
  // would mis-attribute every parameter to itself.
  //
  // Almost every effect id is `<category>.<effect>`; `mask_isolate` predates
  // that convention and has no category prefix, so the prefix is optional.
  const effectId = /EffectMeta\s*\{\s*id:\s*"([a-z0-9_]+(?:\.[a-z0-9_]+)?)"/g;
  const paramDef = /ParameterDef\s*\{\s*id:\s*"([a-z0-9_]+)"/g;

  for (const file of walkRustFiles(EFFECTS_DIR)) {
    const src = readFileSync(file, "utf8");

    const ids: { at: number; id: string }[] = [];
    for (const m of src.matchAll(effectId)) {
      ids.push({ at: m.index ?? 0, id: m[1] });
    }
    if (ids.length === 0) continue;
    for (const { id } of ids) if (!result.has(id)) result.set(id, new Set());

    for (const m of src.matchAll(paramDef)) {
      const at = m.index ?? 0;
      let owner: string | null = null;
      for (const candidate of ids) {
        if (candidate.at < at) owner = candidate.id;
        else break;
      }
      if (owner) result.get(owner)!.add(m[1]);
    }
  }
  return result;
}

describe("effect parameter wiring (Rust <-> WebGL preview)", () => {
  it("can locate the Rust effect sources", () => {
    expect(existsSync(EFFECTS_DIR)).toBe(true);
  });

  const rustParams = parseRustEffectParams();
  const entries = Object.entries(rustToWebGL);

  it("parses a plausible number of Rust effects", () => {
    // Guards against the parser silently matching nothing and turning every
    // assertion below into a vacuous pass.
    expect(rustParams.size).toBeGreaterThan(90);
    expect(entries.length).toBeGreaterThan(90);
  });

  it("maps only effect ids that exist in the Rust registry", () => {
    const unknown = entries.map(([id]) => id).filter((id) => !rustParams.has(id));
    expect(unknown).toEqual([]);
  });

  it("references only shaders that are registered", () => {
    const missing = entries
      .filter(([, m]) => !shaderRegistry.has(m.shaderId))
      .map(([id, m]) => `${id} -> ${m.shaderId}`);
    expect(missing).toEqual([]);
  });

  it("uses only real Rust parameter ids as paramMap keys", () => {
    const dead: string[] = [];
    for (const [effectId, mapping] of entries) {
      const real = rustParams.get(effectId);
      if (!real) continue;
      for (const key of Object.keys(mapping.paramMap)) {
        if (!real.has(key)) dead.push(`${effectId}.paramMap["${key}"]`);
      }
    }
    // A dead key means the uniform is never written and the shader silently
    // keeps its default — the exact preview/export divergence this guards.
    expect(dead).toEqual([]);
  });

  it("targets only uniforms the shader actually declares", () => {
    const bogus: string[] = [];
    for (const [effectId, mapping] of entries) {
      const shader = shaderRegistry.get(mapping.shaderId);
      if (!shader) continue;
      const declared = new Set(shader.uniforms.map((u) => u.name));
      for (const uniform of Object.values(mapping.paramMap)) {
        if (!declared.has(uniform)) {
          bogus.push(`${effectId} -> ${mapping.shaderId}.${uniform}`);
        }
      }
    }
    expect(bogus).toEqual([]);
  });

  it("forwards every Rust parameter for effects claiming an accurate preview", () => {
    const dropped: string[] = [];
    for (const [effectId, mapping] of entries) {
      if (mapping.accurate === false) continue; // honestly labelled as approximate
      const real = rustParams.get(effectId);
      if (!real) continue;
      const mapped = new Set(Object.keys(mapping.paramMap));
      for (const param of real) {
        if (PATH_PARAM.test(param)) continue;
        if (!mapped.has(param)) dropped.push(`${effectId}.${param}`);
      }
    }
    // An effect that drops a parameter is still allowed to exist — it just has
    // to say so with `accurate: false`, which lights the APPROXIMATE badge in
    // PreviewViewport instead of claiming LIVE PREVIEW.
    expect(dropped).toEqual([]);
  });

  it("marks pass_through previews as approximate", () => {
    const lying = entries
      .filter(([, m]) => m.shaderId === "pass_through" && m.accurate !== false)
      .map(([id]) => id);
    // pass_through renders the source unchanged. Claiming that is an accurate
    // preview tells the user the effect is doing nothing.
    expect(lying).toEqual([]);
  });

  it("branches transforms only on keys of their own paramMap", () => {
    // stackToRenderPasses calls transform(rustParam, value). A branch that
    // compares the first argument against anything else -- e.g. the uniform
    // name "u_blockSize" -- can never fire, and the value silently falls
    // through to whichever branch comes last.
    const unreachable: string[] = [];
    let comparisons = 0;
    for (const [id, m] of entries) {
      if (!m.transform) continue;
      const src = m.transform.toString();
      const arg = /^\s*(?:function\s*[\w$]*\s*)?\(?\s*([A-Za-z_$][\w$]*)/.exec(src)?.[1];
      if (!arg) continue;
      const cmp = new RegExp(String.raw`\b${arg}\s*===?\s*["']([^"']+)["']`, "g");
      for (const [, key] of src.matchAll(cmp)) {
        comparisons++;
        if (!(key in m.paramMap)) unreachable.push(`${id}: ${arg} === "${key}"`);
      }
    }
    expect(comparisons).toBeGreaterThan(0);
    expect(unreachable).toEqual([]);
  });

  it("applies the size/scale branch of datamoshing transforms", () => {
    const uniformsFor = (effectId: string, params: Record<string, unknown>) =>
      stackToRenderPasses([
        {
          id: "s1",
          effectId,
          effectName: effectId,
          params,
          enabled: true,
          maskId: null,
          maskMode: "inside",
        },
      ])[0].uniforms;

    expect(uniformsFor("datamoshing.classic", { chunk_size: 16, repeats: 5 })).toMatchObject({
      u_blockSize: 16,
      u_intensity: 0.5,
    });
    expect(uniformsFor("datamoshing.stop", { threshold: 50, n_frames: 3 })).toMatchObject({
      u_blockSize: 12,
      u_intensity: 0.5,
    });
    expect(uniformsFor("datamoshing.motion_transfer", { strength: 30, block_size: 20 })).toMatchObject({
      u_scale: 2,
      u_intensity: 0.3,
    });
  });
});

/**
 * Keyframes have to reach the exporter. The UI has offered a diamond on every
 * numeric parameter for a long time and the preview honoured them, but the
 * export payload carried one static params map per effect -- so a rendered file
 * froze every animated parameter at whatever the playhead held when Export was
 * clicked.
 */
describe("stackToRustPayload keyframes", () => {
  const entry = (id: string): StackEntry => ({
    id,
    effectId: "dither.bayer",
    effectName: "Bayer",
    params: { amount: 5 },
    enabled: true,
    maskId: null,
    maskB64: null,
    maskMode: "inside",
  });

  const kf = (time: number, value: number, easing: Keyframe["easing"] = "linear"): Keyframe => ({
    id: `k${time}`,
    time,
    value,
    easing,
  });

  it("omits the field entirely when nothing is animated", () => {
    const out = stackToRustPayload([entry("s1")], null, []);
    expect(out[0]).not.toHaveProperty("keyframes");
    const withEmpty = stackToRustPayload([entry("s1")], null, [], undefined, { s1: { amount: [] } });
    expect(withEmpty[0]).not.toHaveProperty("keyframes");
  });

  it("carries a track for the matching stack entry only", () => {
    const out = stackToRustPayload([entry("s1"), entry("s2")], null, [], undefined, {
      s1: { amount: [kf(0, 1), kf(2, 9)] },
    });
    expect(out[0].keyframes).toEqual({
      amount: [
        { time: 0, value: 1, easing: "linear" },
        { time: 2, value: 9, easing: "linear" },
      ],
    });
    expect(out[1]).not.toHaveProperty("keyframes");
  });

  it("sorts a track by time, because the Rust side walks it in order", () => {
    const out = stackToRustPayload([entry("s1")], null, [], undefined, {
      s1: { amount: [kf(5, 50), kf(1, 10), kf(3, 30)] },
    });
    expect(out[0].keyframes!.amount.map((k) => k.time)).toEqual([1, 3, 5]);
  });

  it("preserves the easing of each key", () => {
    const out = stackToRustPayload([entry("s1")], null, [], undefined, {
      s1: { amount: [kf(0, 1, "hold"), kf(2, 9, "easeInOut")] },
    });
    expect(out[0].keyframes!.amount.map((k) => k.easing)).toEqual(["hold", "easeInOut"]);
  });

  it("leaves a disabled effect out, keyframes and all", () => {
    const disabled = { ...entry("s1"), enabled: false };
    const out = stackToRustPayload([disabled], null, [], undefined, {
      s1: { amount: [kf(0, 1), kf(2, 9)] },
    });
    expect(out).toHaveLength(0);
  });
});

/**
 * LFO export parity. Rust `EffectCall` understands keyframes and audio
 * bindings but has no LFO concept and cannot grow one from this side of the
 * IPC -- so `stackToRustPayload` bakes each modulated parameter into a dense
 * keyframe track on the same transport-time grid the backend evaluates
 * (`trim_start + idx/fps`). What the file plays is then exactly what
 * `resolveModulatedValue` showed in the preview, because the bake walks the
 * same `modulatedParamValue`.
 */
describe("stackToRustPayload LFO bake", () => {
  const entry = (id: string): StackEntry => ({
    id,
    effectId: "dither.bayer",
    effectName: "Bayer",
    params: { amount: 50 },
    enabled: true,
    maskId: null,
    maskB64: null,
    maskMode: "inside",
  });

  const meta: EffectMeta = {
    id: "dither.bayer",
    name: "Bayer",
    category: "dithering",
    media_type: "both",
    parameters: [{ id: "amount", name: "Amount", type: "slider", default: 50, min: 0, max: 100 }],
  };

  const lfo = { id: "s1.amount", waveform: "sine" as const, rateHz: 1, depth: 0.5, offset: 50 };
  const bake = { fps: 30, trimStart: 0, trimEnd: 1 };

  it("does nothing without a bake grid -- preview callers' params are already resolved", () => {
    const out = stackToRustPayload([entry("s1")], null, [], 0.5, undefined, undefined, {
      lfos: { s1: { amount: lfo } },
      effects: [meta],
      // no bake
    });
    expect(out[0]).not.toHaveProperty("keyframes");
  });

  it("bakes one key per export frame on the trim_start + idx/fps grid", () => {
    const out = stackToRustPayload([entry("s1")], null, [], undefined, undefined, undefined, {
      lfos: { s1: { amount: lfo } },
      effects: [meta],
      bake,
    });
    const track = out[0].keyframes!.amount;
    expect(track.length).toBeGreaterThanOrEqual(31);
    expect(track[0].time).toBe(0);
    expect(track[1].time).toBeCloseTo(1 / 30, 12);
    expect(track.every((k) => k.easing === "linear")).toBe(true);
  });

  it("bakes exactly what resolveModulatedValue produces at each grid time", () => {
    const out = stackToRustPayload([entry("s1")], null, [], undefined, undefined, undefined, {
      lfos: { s1: { amount: lfo } },
      effects: [meta],
      bake,
    });
    const track = out[0].keyframes!.amount;
    for (const k of track) {
      // offset 50 + 0.5 * 100 * sin(2*pi*1*t), clamped to [0, 100]
      const expected = Math.max(0, Math.min(100, 50 + 50 * Math.sin(2 * Math.PI * k.time)));
      expect(k.value).toBeCloseTo(expected, 8);
    }
  });

  it("combines a keyframe track with the LFO instead of dropping either", () => {
    const out = stackToRustPayload([entry("s1")], null, [], undefined, {
      s1: { amount: [{ id: "a", time: 0, value: 20, easing: "linear" }] },
    }, undefined, {
      lfos: { s1: { amount: { ...lfo, depth: 0.1 } } },
      effects: [meta],
      bake,
    });
    const track = out[0].keyframes!.amount;
    // Centre is the keyframed 20 (held), wave is +-10 -- evaluated on the
    // 1/30 grid, so the peak lands at t=7/30 or 8/30, not exactly 0.25.
    for (const k of track) {
      expect(k.value).toBeCloseTo(
        Math.max(0, Math.min(100, 20 + 10 * Math.sin(2 * Math.PI * k.time))),
        8
      );
    }
    // The plain track was replaced by the bake, not appended beside it.
    expect(track.length).toBeGreaterThanOrEqual(31);
  });

  it("keeps an audio binding beside the baked track -- the backend's audio pass wins, as in preview", () => {
    const binding = {
      source: "bass",
      inputMin: 0,
      inputMax: 1,
      outputMin: 0,
      outputMax: 100,
      attack: 0.05,
      decay: 0.2,
      gateEnabled: false,
      gateThreshold: 0.1,
      invert: false,
    };
    const out = stackToRustPayload(
      [entry("s1")],
      null,
      [],
      undefined,
      undefined,
      { s1: { amount: binding } },
      { lfos: { s1: { amount: lfo } }, effects: [meta], bake }
    );
    expect(out[0].audio_bindings).toEqual({ amount: binding });
    expect(out[0].keyframes!.amount.length).toBeGreaterThanOrEqual(31);
  });

  it("bakes nothing for LFOs on other stack entries or disabled effects", () => {
    const out = stackToRustPayload([entry("s1"), { ...entry("s2"), enabled: false }], null, [], undefined, undefined, undefined, {
      lfos: { s2: { amount: lfo } },
      effects: [meta],
      bake,
    });
    expect(out).toHaveLength(1);
    expect(out[0]).not.toHaveProperty("keyframes");
  });
});
