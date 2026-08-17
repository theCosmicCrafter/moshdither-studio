/**
 * Duplicate / solo / copy / paste for effect-stack entries.
 *
 * These are stacking-order and aliasing sensitive: a duplicate that shares its
 * params object with the source silently edits both, and a duplicate appended
 * to the end composites over different layers than the one it copied.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "./index";

function addEffect(name: string): string {
  useAppStore.getState().addToStack({
    id: `test.${name}`,
    name,
    category: "test",
    parameters: [{ id: "amount", name: "Amount", type: "slider", default: 5 }],
  } as never);
  const stack = useAppStore.getState().effectStack;
  return stack[stack.length - 1].id;
}

const ids = () => useAppStore.getState().effectStack.map((e) => e.id);
const names = () => useAppStore.getState().effectStack.map((e) => e.effectName);
const enabled = () => useAppStore.getState().effectStack.map((e) => e.enabled);

describe("effect stack clipboard and isolation", () => {
  beforeEach(() => useAppStore.setState(useAppStore.getInitialState()));

  describe("duplicate", () => {
    it("inserts the copy directly above its source, not at the end", () => {
      addEffect("A");
      const b = addEffect("B");
      addEffect("C");
      useAppStore.getState().duplicateStackItem(b);
      expect(names()).toEqual(["A", "B", "B", "C"]);
    });

    it("gives the copy its own instance id and selects it", () => {
      const a = addEffect("A");
      useAppStore.getState().duplicateStackItem(a);
      const [first, second] = ids();
      expect(second).not.toBe(first);
      expect(useAppStore.getState().selectedStackId).toBe(second);
    });

    it("does not alias params — editing the copy leaves the source alone", () => {
      const a = addEffect("A");
      useAppStore.getState().duplicateStackItem(a);
      const copyId = ids()[1];
      useAppStore.getState().updateStackParams(copyId, { amount: 99 });
      const [src, copy] = useAppStore.getState().effectStack;
      expect(copy.params.amount).toBe(99);
      expect(src.params.amount).toBe(5);
    });

    it("is a no-op for an unknown id", () => {
      addEffect("A");
      useAppStore.getState().duplicateStackItem("nope");
      expect(ids()).toHaveLength(1);
    });
  });

  describe("solo", () => {
    it("disables every other entry", () => {
      addEffect("A");
      const b = addEffect("B");
      addEffect("C");
      useAppStore.getState().soloStackItem(b);
      expect(enabled()).toEqual([false, true, false]);
    });

    it("restores everything when the same entry is soloed again", () => {
      addEffect("A");
      const b = addEffect("B");
      addEffect("C");
      useAppStore.getState().soloStackItem(b);
      useAppStore.getState().soloStackItem(b);
      expect(enabled()).toEqual([true, true, true]);
    });

    it("soloing a different entry moves the isolation rather than restoring", () => {
      const a = addEffect("A");
      const b = addEffect("B");
      useAppStore.getState().soloStackItem(a);
      useAppStore.getState().soloStackItem(b);
      expect(enabled()).toEqual([false, true]);
    });

    it("re-enables a disabled entry when soloing it", () => {
      const a = addEffect("A");
      addEffect("B");
      useAppStore.getState().toggleStackItem(a); // disable A
      useAppStore.getState().soloStackItem(a);
      expect(enabled()).toEqual([true, false]);
    });
  });

  describe("copy / paste", () => {
    it("pastes a detached copy at the end with a new id", () => {
      const a = addEffect("A");
      addEffect("B");
      useAppStore.getState().copyStackItem(a);
      useAppStore.getState().pasteStackItem();
      expect(names()).toEqual(["A", "B", "A"]);
      expect(new Set(ids()).size).toBe(3);
    });

    it("paste with an empty clipboard is a no-op", () => {
      addEffect("A");
      useAppStore.getState().pasteStackItem();
      expect(ids()).toHaveLength(1);
    });

    it("the clipboard snapshots values, so later edits to the source do not follow", () => {
      const a = addEffect("A");
      useAppStore.getState().copyStackItem(a);
      useAppStore.getState().updateStackParams(a, { amount: 42 });
      useAppStore.getState().pasteStackItem();
      const pasted = useAppStore.getState().effectStack[1];
      expect(pasted.params.amount).toBe(5);
    });

    it("supports pasting repeatedly", () => {
      const a = addEffect("A");
      useAppStore.getState().copyStackItem(a);
      useAppStore.getState().pasteStackItem();
      useAppStore.getState().pasteStackItem();
      expect(names()).toEqual(["A", "A", "A"]);
      expect(new Set(ids()).size).toBe(3);
    });
  });

  it("duplicate, solo and paste are all undoable", () => {
    const a = addEffect("A");
    addEffect("B");
    useAppStore.getState().duplicateStackItem(a);
    expect(ids()).toHaveLength(3);
    useAppStore.getState().undo();
    expect(ids()).toHaveLength(2);

    useAppStore.getState().soloStackItem(a);
    expect(enabled()).toEqual([true, false]);
    useAppStore.getState().undo();
    expect(enabled()).toEqual([true, true]);
  });
});
