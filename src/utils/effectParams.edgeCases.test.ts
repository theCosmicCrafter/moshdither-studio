import { describe, it, expect } from "vitest";
import { resolveMaskId, stackToRustPayload } from "./effectConverter";
import type { StackEntry } from "../store";

describe("Effect Parameter Validation Edge Cases", () => {
  // ── resolveMaskId edge cases ──
  describe("resolveMaskId", () => {
    it("returns null for null maskId", () => {
      expect(resolveMaskId(null, "active_data", ["m0"])).toBeNull();
    });

    it("returns null for empty string maskId", () => {
      expect(resolveMaskId("", "active_data", ["m0"])).toBeNull();
    });

    it("returns activeMask for 'active'", () => {
      expect(resolveMaskId("active", "my_mask", [])).toBe("my_mask");
    });

    it("returns null for 'active' when activeMask is null", () => {
      expect(resolveMaskId("active", null, [])).toBeNull();
    });

    it("resolves sam3-0 correctly", () => {
      expect(resolveMaskId("sam3-0", null, ["mask_a", "mask_b"])).toBe("mask_a");
    });

    it("resolves sam3-1 correctly", () => {
      expect(resolveMaskId("sam3-1", null, ["mask_a", "mask_b"])).toBe("mask_b");
    });

    it("returns null for out-of-range sam3 index", () => {
      expect(resolveMaskId("sam3-99", null, ["only_one"])).toBeNull();
    });

    it("returns null for negative sam3 index (sam3--1)", () => {
      expect(resolveMaskId("sam3--1", null, ["m0", "m1"])).toBeNull();
    });

    it("returns null for empty sam3 masks array", () => {
      expect(resolveMaskId("sam3-0", null, [])).toBeNull();
    });

    it("returns null for unknown maskId format", () => {
      expect(resolveMaskId("unknown-format", "active_data", ["m0"])).toBeNull();
    });

    it("returns null for maskId that is just 'sam3-'", () => {
      // parseInt("") → NaN, sam3Masks[NaN] → undefined → null
      expect(resolveMaskId("sam3-", null, ["m0"])).toBeNull();
    });

    it("handles sam3 index with leading zeros", () => {
      expect(resolveMaskId("sam3-01", null, ["m0", "m1"])).toBe("m1");
    });
  });

  // ── stackToRustPayload with invalid params ──
  describe("stackToRustPayload with invalid parameter values", () => {
    const makeStack = (params: Record<string, unknown>): StackEntry[] => [
      {
        id: "s1",
        effectId: "color.brightness",
        effectName: "Brightness",
        params,
        enabled: true,
        maskId: null,
        maskMode: "inside",
      },
    ];

    it("passes NaN param values through to payload", () => {
      const payload = stackToRustPayload(makeStack({ brightness: NaN }), null, []);
      expect(payload[0].params.brightness).toBeNaN();
    });

    it("passes Infinity param values through to payload", () => {
      const payload = stackToRustPayload(makeStack({ brightness: Infinity }), null, []);
      expect(payload[0].params.brightness).toBe(Infinity);
    });

    it("passes negative param values through", () => {
      const payload = stackToRustPayload(makeStack({ brightness: -100 }), null, []);
      expect(payload[0].params.brightness).toBe(-100);
    });

    it("passes string param values through", () => {
      const payload = stackToRustPayload(makeStack({ brightness: "invalid" }), null, []);
      expect(payload[0].params.brightness).toBe("invalid");
    });

    it("passes null param values through", () => {
      const payload = stackToRustPayload(makeStack({ brightness: null }), null, []);
      expect(payload[0].params.brightness).toBeNull();
    });

    it("passes undefined param values through (they get spread)", () => {
      const payload = stackToRustPayload(makeStack({ brightness: undefined }), null, []);
      // undefined values are preserved in object spread
      expect("brightness" in payload[0].params).toBe(true);
      expect(payload[0].params.brightness).toBeUndefined();
    });

    it("passes object param values through", () => {
      const payload = stackToRustPayload(
        makeStack({ nested: { a: 1, b: 2 } }),
        null,
        [],
      );
      expect(payload[0].params.nested).toEqual({ a: 1, b: 2 });
    });

    it("passes array param values through", () => {
      const payload = stackToRustPayload(makeStack({ values: [1, 2, 3] }), null, []);
      expect(payload[0].params.values).toEqual([1, 2, 3]);
    });

    it("preserves boolean param values", () => {
      const payload = stackToRustPayload(makeStack({ enabled: true, flag: false }), null, []);
      expect(payload[0].params.enabled).toBe(true);
      expect(payload[0].params.flag).toBe(false);
    });

    it("preserves very large numbers", () => {
      const payload = stackToRustPayload(
        makeStack({ value: Number.MAX_SAFE_INTEGER }),
        null,
        [],
      );
      expect(payload[0].params.value).toBe(Number.MAX_SAFE_INTEGER);
    });

    it("preserves -0", () => {
      const payload = stackToRustPayload(makeStack({ value: -0 }), null, []);
      expect(Object.is(payload[0].params.value, -0)).toBe(true);
    });
  });

  // ── stackToRustPayload with all entries disabled ──
  describe("stackToRustPayload with all disabled entries", () => {
    it("all disabled entries produce empty payload", () => {
      const stack: StackEntry[] = [
        { id: "s1", effectId: "a", effectName: "A", params: {}, enabled: false, maskId: null, maskMode: "inside" },
        { id: "s2", effectId: "b", effectName: "B", params: {}, enabled: false, maskId: null, maskMode: "inside" },
      ];
      const payload = stackToRustPayload(stack, null, []);
      expect(payload).toEqual([]);
    });

    it("mixed enabled/disabled filters correctly", () => {
      const stack: StackEntry[] = [
        { id: "s1", effectId: "a", effectName: "A", params: {}, enabled: false, maskId: null, maskMode: "inside" },
        { id: "s2", effectId: "b", effectName: "B", params: {}, enabled: true, maskId: null, maskMode: "inside" },
        { id: "s3", effectId: "c", effectName: "C", params: {}, enabled: false, maskId: null, maskMode: "inside" },
        { id: "s4", effectId: "d", effectName: "D", params: {}, enabled: true, maskId: null, maskMode: "inside" },
      ];
      const payload = stackToRustPayload(stack, null, []);
      expect(payload.length).toBe(2);
      expect(payload[0].effect_id).toBe("b");
      expect(payload[1].effect_id).toBe("d");
    });
  });

  // ── stackToRustPayload with time param ──
  describe("stackToRustPayload time injection", () => {
    it("injects time=0", () => {
      const stack: StackEntry[] = [
        { id: "s1", effectId: "a", effectName: "A", params: {}, enabled: true, maskId: null, maskMode: "inside" },
      ];
      const payload = stackToRustPayload(stack, null, [], 0);
      expect(payload[0].params.time).toBe(0);
    });

    it("injects negative time", () => {
      const stack: StackEntry[] = [
        { id: "s1", effectId: "a", effectName: "A", params: {}, enabled: true, maskId: null, maskMode: "inside" },
      ];
      const payload = stackToRustPayload(stack, null, [], -1);
      expect(payload[0].params.time).toBe(-1);
    });

    it("injects very large time", () => {
      const stack: StackEntry[] = [
        { id: "s1", effectId: "a", effectName: "A", params: {}, enabled: true, maskId: null, maskMode: "inside" },
      ];
      const payload = stackToRustPayload(stack, null, [], 999999);
      expect(payload[0].params.time).toBe(999999);
    });

    it("does not inject time when undefined", () => {
      const stack: StackEntry[] = [
        { id: "s1", effectId: "a", effectName: "A", params: {}, enabled: true, maskId: null, maskMode: "inside" },
      ];
      const payload = stackToRustPayload(stack, null, []);
      expect("time" in payload[0].params).toBe(false);
    });

    it("time param overrides existing time in params", () => {
      const stack: StackEntry[] = [
        { id: "s1", effectId: "a", effectName: "A", params: { time: 10 }, enabled: true, maskId: null, maskMode: "inside" },
      ];
      const payload = stackToRustPayload(stack, null, [], 5);
      expect(payload[0].params.time).toBe(5);
    });
  });

  // ── stackToRustPayload mask_mode preservation ──
  describe("stackToRustPayload mask mode preservation", () => {
    it("preserves 'inside' mask mode", () => {
      const stack: StackEntry[] = [
        { id: "s1", effectId: "a", effectName: "A", params: {}, enabled: true, maskId: "active", maskMode: "inside" },
      ];
      const payload = stackToRustPayload(stack, "mask_data", []);
      expect(payload[0].mask_mode).toBe("inside");
    });

    it("preserves 'outside' mask mode", () => {
      const stack: StackEntry[] = [
        { id: "s1", effectId: "a", effectName: "A", params: {}, enabled: true, maskId: "active", maskMode: "outside" },
      ];
      const payload = stackToRustPayload(stack, "mask_data", []);
      expect(payload[0].mask_mode).toBe("outside");
    });

    it("preserves 'alpha' mask mode", () => {
      const stack: StackEntry[] = [
        { id: "s1", effectId: "a", effectName: "A", params: {}, enabled: true, maskId: "active", maskMode: "alpha" },
      ];
      const payload = stackToRustPayload(stack, "mask_data", []);
      expect(payload[0].mask_mode).toBe("alpha");
    });
  });
});
