/**
 * Keyboard shortcut manager for MoshDither Studio.
 *
 * Supports custom keybindings, preset profiles (Premiere / Blender / Final Cut),
 * and persistence to localStorage.
 */

export interface ShortcutPreset {
  name: string;
  label: string;
  bindings: Record<string, string>;
}

const PRESETS: ShortcutPreset[] = [
  {
    name: "default",
    label: "MoshDither Default",
    bindings: {
      "edit:undo": "Ctrl+Z",
      "edit:redo": "Ctrl+Shift+Z",
      "view:fullscreen": "F11",
      "accessibility:zoomIn": "Ctrl++",
      "accessibility:zoomOut": "Ctrl+-",
      "app:open": "Ctrl+O",
      "app:export": "Ctrl+Shift+E",
    },
  },
  {
    name: "premiere",
    label: "Adobe Premiere",
    bindings: {
      "edit:undo": "Ctrl+Z",
      "edit:redo": "Ctrl+Shift+Z",
      "view:fullscreen": "~",
      "accessibility:zoomIn": "Ctrl++",
      "accessibility:zoomOut": "Ctrl+-",
      "app:open": "Ctrl+O",
      "app:export": "Ctrl+M",
    },
  },
  {
    name: "blender",
    label: "Blender",
    bindings: {
      "edit:undo": "Ctrl+Z",
      "edit:redo": "Ctrl+Shift+Z",
      "view:fullscreen": "Ctrl+Space",
      "accessibility:zoomIn": "Ctrl++",
      "accessibility:zoomOut": "Ctrl+-",
      "app:open": "Ctrl+O",
      "app:export": "F12",
    },
  },
  {
    name: "finalcut",
    label: "Final Cut Pro",
    bindings: {
      "edit:undo": "Cmd+Z",
      "edit:redo": "Cmd+Shift+Z",
      "view:fullscreen": "Ctrl+Cmd+F",
      "accessibility:zoomIn": "Cmd++",
      "accessibility:zoomOut": "Cmd+-",
      "app:open": "Cmd+O",
      "app:export": "Cmd+E",
    },
  },
];

let activeBindings: Record<string, string> = {};
let activePreset = "default";

function loadFromStorage(): void {
  try {
    const saved = localStorage.getItem("moshdither:shortcuts");
    if (saved) {
      const parsed = JSON.parse(saved);
      activeBindings = parsed.bindings || {};
      activePreset = parsed.preset || "default";
      return;
    }
  } catch {
    /* ignore corrupt storage */
  }
  applyPreset("default");
}

function saveToStorage(): void {
  try {
    localStorage.setItem(
      "moshdither:shortcuts",
      JSON.stringify({ bindings: activeBindings, preset: activePreset }),
    );
  } catch {
    /* ignore quota exceeded */
  }
}

export function applyPreset(presetName: string): void {
  const preset = PRESETS.find((p) => p.name === presetName);
  if (!preset) return;
  activePreset = presetName;
  activeBindings = { ...preset.bindings };
  saveToStorage();
}

export function getPreset(): string {
  return activePreset;
}

export function getPresets(): ShortcutPreset[] {
  return PRESETS;
}

export function setBinding(commandId: string, keys: string | null): void {
  if (keys) {
    activeBindings[commandId] = keys;
  } else {
    delete activeBindings[commandId];
  }
  activePreset = "custom";
  saveToStorage();
}

export function getBinding(commandId: string): string | undefined {
  return activeBindings[commandId];
}

export function getAllBindings(): Record<string, string> {
  return { ...activeBindings };
}

export function resetAllBindings(): void {
  applyPreset("default");
}

/**
 * Normalize a keyboard event into a canonical key string.
 * e.g. Ctrl+Shift+Z, Cmd+A, F11, Escape
 */
export function eventToKeyString(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  if (key !== "Control" && key !== "Alt" && key !== "Shift" && key !== "Meta") {
    parts.push(key);
  }
  return parts.join("+");
}

/**
 * Check if a keyboard event matches a binding string.
 */
export function matchesBinding(e: KeyboardEvent, binding: string): boolean {
  return eventToKeyString(e) === binding;
}

// Load on module init
loadFromStorage();
