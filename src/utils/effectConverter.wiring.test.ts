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

import { rustToWebGL, stackToRustPayload } from "./effectConverter";
import type { StackEntry, Keyframe } from "../store";
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
