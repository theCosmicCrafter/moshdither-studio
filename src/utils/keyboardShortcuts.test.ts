import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  applyPreset,
  getPreset,
  getPresets,
  setBinding,
  getBinding,
  getAllBindings,
  resetAllBindings,
  eventToKeyString,
  matchesBinding,
} from "./keyboardShortcuts";

async function reloadModule(): Promise<typeof import("./keyboardShortcuts")> {
  vi.resetModules();
  return import("./keyboardShortcuts");
}

describe("Keyboard Shortcuts", () => {
  beforeEach(() => {
    localStorage.clear();
    resetAllBindings();
  });

  describe("Presets", () => {
    it("returns 4 presets (default, premiere, blender, finalcut)", () => {
      const presets = getPresets();
      expect(presets).toHaveLength(4);
      expect(presets.map((p) => p.name)).toEqual(["default", "premiere", "blender", "finalcut"]);
    });

    it("starts on default preset", () => {
      expect(getPreset()).toBe("default");
    });

    it("applyPreset switches active preset", () => {
      applyPreset("premiere");
      expect(getPreset()).toBe("premiere");
      // Premiere export is Ctrl+M
      expect(getBinding("app:export")).toBe("Ctrl+M");
    });

    it("applyPreset for blender sets F12 export", () => {
      applyPreset("blender");
      expect(getPreset()).toBe("blender");
      expect(getBinding("app:export")).toBe("F12");
    });

    it("applyPreset for finalcut uses Cmd prefix", () => {
      applyPreset("finalcut");
      expect(getPreset()).toBe("finalcut");
      expect(getBinding("edit:undo")).toBe("Cmd+Z");
    });

    it("applyPreset with invalid name does nothing", () => {
      applyPreset("nonexistent");
      expect(getPreset()).toBe("default");
    });

    it("applyPreset persists to localStorage", () => {
      applyPreset("blender");
      const saved = localStorage.getItem("moshdither:shortcuts");
      expect(saved).not.toBeNull();
      const parsed = JSON.parse(saved!);
      expect(parsed.preset).toBe("blender");
    });
  });

  describe("Bindings", () => {
    it("getBinding returns undefined for unknown command", () => {
      expect(getBinding("nonexistent:command")).toBeUndefined();
    });

    it("setBinding adds a new binding", () => {
      setBinding("custom:action", "Ctrl+K");
      expect(getBinding("custom:action")).toBe("Ctrl+K");
    });

    it("setBinding sets preset to custom", () => {
      setBinding("custom:action", "Ctrl+K");
      expect(getPreset()).toBe("custom");
    });

    it("setBinding with null removes the binding", () => {
      setBinding("custom:action", "Ctrl+K");
      expect(getBinding("custom:action")).toBe("Ctrl+K");
      setBinding("custom:action", null);
      expect(getBinding("custom:action")).toBeUndefined();
    });

    it("getAllBindings returns a copy (not reference)", () => {
      const bindings = getAllBindings();
      bindings["injected"] = "Ctrl+Hacked";
      expect(getBinding("injected")).toBeUndefined();
    });

    it("resetAllBindings restores default preset", () => {
      setBinding("custom:action", "Ctrl+K");
      expect(getPreset()).toBe("custom");
      resetAllBindings();
      expect(getPreset()).toBe("default");
      expect(getBinding("custom:action")).toBeUndefined();
      expect(getBinding("edit:undo")).toBe("Ctrl+Z");
    });
  });

  describe("Persistence", () => {
    it("loads from localStorage on module init", async () => {
      localStorage.setItem(
        "moshdither:shortcuts",
        JSON.stringify({
          bindings: { "edit:undo": "Ctrl+Y" },
          preset: "custom",
        })
      );
      const mod = await reloadModule();
      expect(mod.getBinding("edit:undo")).toBe("Ctrl+Y");
      expect(mod.getPreset()).toBe("custom");
    });

    it("handles corrupt localStorage gracefully", async () => {
      localStorage.setItem("moshdither:shortcuts", "{invalid json}");
      const mod = await reloadModule();
      expect(mod.getPreset()).toBe("default");
    });
  });

  describe("eventToKeyString", () => {
    function makeKeyEvent(
      key: string,
      opts: { ctrl?: boolean; meta?: boolean; alt?: boolean; shift?: boolean } = {}
    ): KeyboardEvent {
      return new KeyboardEvent("keydown", {
        key,
        ctrlKey: opts.ctrl ?? false,
        metaKey: opts.meta ?? false,
        altKey: opts.alt ?? false,
        shiftKey: opts.shift ?? false,
      });
    }

    it("converts simple key", () => {
      expect(eventToKeyString(makeKeyEvent("a"))).toBe("A");
    });

    it("converts Ctrl+Z", () => {
      expect(eventToKeyString(makeKeyEvent("z", { ctrl: true }))).toBe("Ctrl+Z");
    });

    it("converts Ctrl+Shift+Z", () => {
      expect(eventToKeyString(makeKeyEvent("z", { ctrl: true, shift: true }))).toBe("Ctrl+Shift+Z");
    });

    it("converts F11 (non-character key)", () => {
      expect(eventToKeyString(makeKeyEvent("F11"))).toBe("F11");
    });

    it("converts Alt+F4", () => {
      expect(eventToKeyString(makeKeyEvent("F4", { alt: true }))).toBe("Alt+F4");
    });

    it("ignores modifier-only keys", () => {
      expect(eventToKeyString(makeKeyEvent("Control", { ctrl: true }))).toBe("Ctrl");
      expect(eventToKeyString(makeKeyEvent("Shift", { shift: true }))).toBe("Shift");
      expect(eventToKeyString(makeKeyEvent("Alt", { alt: true }))).toBe("Alt");
    });

    it("converts Meta (Cmd) to Ctrl prefix", () => {
      expect(eventToKeyString(makeKeyEvent("a", { meta: true }))).toBe("Ctrl+A");
    });

    it("converts Space key", () => {
      expect(eventToKeyString(makeKeyEvent(" "))).toBe(" ");
    });

    it("converts ArrowLeft", () => {
      expect(eventToKeyString(makeKeyEvent("ArrowLeft"))).toBe("ArrowLeft");
    });
  });

  describe("matchesBinding", () => {
    it("matches a correct binding", () => {
      const e = new KeyboardEvent("keydown", { key: "z", ctrlKey: true });
      expect(matchesBinding(e, "Ctrl+Z")).toBe(true);
    });

    it("does not match incorrect binding", () => {
      const e = new KeyboardEvent("keydown", { key: "z", ctrlKey: true });
      expect(matchesBinding(e, "Ctrl+Y")).toBe(false);
    });

    it("matches complex binding with shift", () => {
      const e = new KeyboardEvent("keydown", {
        key: "z",
        ctrlKey: true,
        shiftKey: true,
      });
      expect(matchesBinding(e, "Ctrl+Shift+Z")).toBe(true);
    });
  });
});
