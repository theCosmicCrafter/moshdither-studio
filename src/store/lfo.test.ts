/**
 * Store contract for per-parameter LFO modulators.
 *
 * The guarantees that matter: edits are single-step undoable (the LFO map
 * rides every history entry next to the effect stack), the spec is sanitized
 * on the way in, and `resolveModulatedValue` -- the one function
 * useKeyframePlayback and the export bake both go through -- composes
 * keyframes and LFO with the parameter's declared range, so a param's depth
 * means the same thing on a 0..1 mix as on a 0..255 threshold.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore, type EffectMeta, type LfoSpec } from "./index";

const mockEffect: EffectMeta = {
  id: "test.lfo",
  name: "LFO Test",
  category: "test",
  media_type: "both",
  parameters: [
    { id: "amount", name: "Amount", type: "slider", default: 50, min: 0, max: 100 },
  ],
};

const spec = (over: Partial<LfoSpec> = {}): LfoSpec => ({
  id: "s1.amount",
  waveform: "sine",
  rateHz: 1,
  depth: 0.5,
  offset: 50,
  ...over,
});

function stackWithEffect(meta: EffectMeta = mockEffect): string {
  // resolveModulatedValue scales depth by the DECLARED range, which lives in
  // the allEffects registry -- adding a stack entry alone is not enough.
  useAppStore.setState({ allEffects: [...useAppStore.getState().allEffects, meta] });
  useAppStore.getState().addToStack(meta);
  return useAppStore.getState().effectStack[useAppStore.getState().effectStack.length - 1].id;
}

describe("LFO modulators", () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState());
  });

  it("setLfo writes the spec and removeLfo prunes emptied maps", () => {
    const stackId = stackWithEffect();
    useAppStore.getState().setLfo(stackId, "amount", spec());
    expect(useAppStore.getState().lfos[stackId].amount).toMatchObject({ depth: 0.5 });
    useAppStore.getState().removeLfo(stackId, "amount");
    expect(useAppStore.getState().lfos[stackId]).toBeUndefined();
  });

  it("setLfo and removeLfo are each one undo step", () => {
    const stackId = stackWithEffect();
    const depth = useAppStore.getState().pastStacks.length;
    useAppStore.getState().setLfo(stackId, "amount", spec());
    expect(useAppStore.getState().pastStacks.length).toBe(depth + 1);
    useAppStore.getState().removeLfo(stackId, "amount");
    expect(useAppStore.getState().pastStacks.length).toBe(depth + 2);
  });

  it("undo restores the LFO map alongside the stack", () => {
    const stackId = stackWithEffect();
    useAppStore.getState().setLfo(stackId, "amount", spec());
    useAppStore.getState().undo();
    expect(useAppStore.getState().lfos[stackId]?.amount).toBeUndefined();
    useAppStore.getState().redo();
    expect(useAppStore.getState().lfos[stackId].amount.depth).toBe(0.5);
  });

  it("undoing the ADD of the stack entry doesn't strand an LFO written after it", () => {
    const stackId = stackWithEffect();
    useAppStore.getState().setLfo(stackId, "amount", spec());
    useAppStore.getState().undo(); // removes the LFO
    useAppStore.getState().undo(); // removes the stack entry
    expect(useAppStore.getState().effectStack).toHaveLength(0);
    // The LFO snapshot that predates the entry is the empty map -- a bare
    // undo of stack state must not resurrect a modulator for a dead entry.
    expect(useAppStore.getState().lfos[stackId]).toBeUndefined();
  });

  it("setLfoSilent writes without an undo entry", () => {
    const stackId = stackWithEffect();
    const depth = useAppStore.getState().pastStacks.length;
    useAppStore.getState().setLfoSilent(stackId, "amount", spec({ rateHz: 2 }));
    expect(useAppStore.getState().lfos[stackId].amount.rateHz).toBe(2);
    expect(useAppStore.getState().pastStacks.length).toBe(depth);
  });

  it("sanitizes out-of-contract fields on the way in", () => {
    const stackId = stackWithEffect();
    useAppStore
      .getState()
      .setLfo(stackId, "amount", spec({ rateHz: 5000, depth: 4, offset: NaN }));
    const saved = useAppStore.getState().lfos[stackId].amount;
    expect(saved.rateHz).toBe(100);
    expect(saved.depth).toBe(1);
    expect(saved.offset).toBe(0);
  });

  describe("resolveModulatedValue", () => {
    it("returns null for an untouched param", () => {
      const stackId = stackWithEffect();
      expect(useAppStore.getState().resolveModulatedValue(stackId, "amount", 1)).toBeNull();
    });

    it("resolves an LFO against the param's declared range", () => {
      const stackId = stackWithEffect();
      // sine 1Hz depth 0.5 over 0..100 => amplitude 50; at t=0.25 the wave
      // is at its +1 peak: offset 50 + 50 = 100.
      useAppStore.getState().setLfo(stackId, "amount", spec());
      expect(useAppStore.getState().resolveModulatedValue(stackId, "amount", 0.25)).toBeCloseTo(100, 8);
      // Deterministic across calls -- no wall-clock in the phase.
      expect(useAppStore.getState().resolveModulatedValue(stackId, "amount", 0.25)).toBeCloseTo(100, 8);
    });

    it("composes a keyframe track as the centre plus the LFO wave", () => {
      const stackId = stackWithEffect();
      useAppStore.getState().setKeyframesForTrack(stackId, "amount", [
        { id: "a", time: 0, value: 20, easing: "linear" },
      ]);
      useAppStore.getState().setLfo(stackId, "amount", spec({ depth: 0.1 }));
      // Centre is the keyframed 20, not offset 50: 20 + 0.1*100*(+1) = 30.
      expect(useAppStore.getState().resolveModulatedValue(stackId, "amount", 0.25)).toBeCloseTo(30, 8);
      // And the keyframe-only path still resolves.
      expect(useAppStore.getState().getKeyframeValue(stackId, "amount", 0)).toBe(20);
    });

    it("uses the param's range when scaling depth -- a 0..1 param gets a small swing", () => {
      const meta: EffectMeta = {
        ...mockEffect,
        id: "test.unit",
        parameters: [{ id: "mix", name: "Mix", type: "slider", default: 0.5, min: 0, max: 1 }],
      };
      const stackId = stackWithEffect(meta);
      useAppStore.getState().setLfo(stackId, "mix", spec({ depth: 0.25, offset: 0.5 }));
      // 0.5 + 0.25*1*(+1) = 0.75 -- NOT 0.5+25, which is what depth-of-range
      // prevents on a unit param.
      expect(useAppStore.getState().resolveModulatedValue(stackId, "mix", 0.25)).toBeCloseTo(0.75, 8);
    });
  });
});
