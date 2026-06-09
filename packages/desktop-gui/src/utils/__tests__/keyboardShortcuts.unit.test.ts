import { describe, it, expect } from "vitest";
import {
  applyPreset,
  getPreset,
  getPresets,
  getBinding,
  setBinding,
  resetAllBindings,
  eventToKeyString,
} from "../keyboardShortcuts";

describe("keyboardShortcuts", () => {
  it("applies a preset and returns correct bindings", () => {
    applyPreset("premiere");
    expect(getPreset()).toBe("premiere");
    expect(getBinding("edit:undo")).toBe("Ctrl+Z");
    expect(getBinding("app:export")).toBe("Ctrl+M");
  });

  it("allows custom bindings after preset", () => {
    applyPreset("default");
    setBinding("edit:undo", "Ctrl+U");
    expect(getBinding("edit:undo")).toBe("Ctrl+U");
    expect(getPreset()).toBe("custom");
  });

  it("resets to default", () => {
    setBinding("edit:undo", "Ctrl+U");
    resetAllBindings();
    expect(getBinding("edit:undo")).toBe("Ctrl+Z");
    expect(getPreset()).toBe("default");
  });

  it("lists available presets", () => {
    const presets = getPresets();
    expect(presets.map((p) => p.name)).toContain("default");
    expect(presets.map((p) => p.name)).toContain("blender");
    expect(presets.map((p) => p.name)).toContain("finalcut");
  });

  it("converts keyboard events to canonical strings", () => {
    const mockEvent = {
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: true,
      key: "z",
    } as KeyboardEvent;
    expect(eventToKeyString(mockEvent)).toBe("Ctrl+Shift+Z");
  });

  it("handles macOS Cmd key", () => {
    const mockEvent = {
      ctrlKey: false,
      metaKey: true,
      altKey: false,
      shiftKey: false,
      key: "o",
    } as KeyboardEvent;
    expect(eventToKeyString(mockEvent)).toBe("Ctrl+O");
  });
});
