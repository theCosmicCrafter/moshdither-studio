import { create } from "zustand";

export interface EffectMeta {
  id: string;
  name: string;
  category: string;
  media_type: string;
  parameters: ParameterDef[];
}

export interface ParameterDef {
  id: string;
  name: string;
  type: "slider" | "select" | "toggle" | "color" | "palette" | "mask";
  default: unknown;
  min?: number;
  max?: number;
  step?: number;
  options?: string[] | null;
}

export interface StackEntry {
  id: string; // unique instance id
  effectId: string;
  effectName: string;
  params: Record<string, unknown>;
  enabled: boolean;
}

export interface AudioBinding {
  /** Which audio feature drives this parameter */
  source: string;
  inputMin: number;
  inputMax: number;
  outputMin: number;
  outputMax: number;
  attack: number;
  decay: number;
  gateEnabled: boolean;
  gateThreshold: number;
  invert: boolean;
}

export type EasingType = "linear" | "easeIn" | "easeOut" | "easeInOut" | "hold";

export interface Keyframe {
  id: string;
  time: number;
  value: number;
  easing: EasingType;
}

/** Per-stack-entry-id, per-parameter-id keyframes */
export type KeyframeTrack = Record<string, Keyframe[]>;

export interface AppState {
  // Timeline
  currentTime: number;
  setCurrentTime: (t: number) => void;

  // Media
  mediaLoaded: boolean;
  mediaInfo: { width: number; height: number } | null;
  previewDataUrl: string | null;
  originalDataUrl: string | null;
  filePath: string | null;

  // Effects
  allEffects: EffectMeta[];
  activeCategory: string;
  searchQuery: string;
  effectStack: StackEntry[];
  pastStacks: StackEntry[][];
  futureStacks: StackEntry[][];
  selectedStackId: string | null;

  // Audio-Reactive
  audioEnabled: boolean;
  audioFilePath: string | null;
  audioPlaying: boolean;
  audioVolume: number;
  audioBpm: number | null;
  audioBandEnergies: Record<string, number>;
  audioBeatFlags: { bass: boolean; mid: boolean; treble: boolean };
  /** Per-stack-entry-id, per-parameter-id audio binding config */
  audioBindings: Record<string, Record<string, AudioBinding>>;
  /** Latest mapped audio values per channel name */
  audioMappedValues: Record<string, number>;

  // Mask / Segmentation
  activeMask: string | null; // base64 PNG of current mask
  maskVisible: boolean;
  sam3Ready: boolean;
  sam3Mode: "text" | "point" | "box" | "auto";
  /** When true, the next left-click on the viewport fires a point prompt */
  sam3Clicking: boolean;

  // Tree masking — accumulated positive (1) and negative (0) point prompts
  sam3Points: Array<{ x: number; y: number; label: 1 | 0 }>;
  sam3HoverMask: string | null; // temporary hover preview mask
  sam3OverlayOpacity: number;
  sam3OverlayColor: string;

  // Multi-mask output from SAM3 (3 masks sorted by score, highest first)
  sam3Masks: string[]; // base64 PNG masks
  sam3MaskScores: number[];
  sam3MaskIndex: number; // which mask is currently active (0 = best)

  // Keyframes
  keyframes: Record<string, KeyframeTrack>;

  // UI
  isProcessing: boolean;
  showBeforeAfter: boolean;
  zoom: number;
  statusMessage: string;
  playbackSpeed: number;

  // Export
  exportProgress: number;
  exportIsRunning: boolean;
  exportCancelRequested: boolean;

  // Actions
  setMediaLoaded: (loaded: boolean) => void;
  setMediaInfo: (info: { width: number; height: number } | null) => void;
  setPreviewDataUrl: (url: string | null) => void;
  setOriginalDataUrl: (url: string | null) => void;
  setFilePath: (path: string | null) => void;
  setAllEffects: (effects: EffectMeta[]) => void;
  setActiveCategory: (cat: string) => void;
  setSearchQuery: (q: string) => void;
  addToStack: (effect: EffectMeta) => void;
  removeFromStack: (id: string) => void;
  moveStackItem: (fromIndex: number, toIndex: number) => void;
  updateStackParams: (id: string, params: Record<string, unknown>) => void;
  toggleStackItem: (id: string) => void;
  selectStackItem: (id: string | null) => void;
  setIsProcessing: (v: boolean) => void;
  setShowBeforeAfter: (v: boolean) => void;
  setZoom: (z: number) => void;
  setStatusMessage: (msg: string) => void;
  setPlaybackSpeed: (speed: number) => void;
  setExportProgress: (progress: number) => void;
  setExportIsRunning: (v: boolean) => void;
  requestExportCancel: () => void;
  resetExport: () => void;
  clearStack: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Audio actions
  setAudioEnabled: (v: boolean) => void;
  setAudioFilePath: (path: string | null) => void;
  setAudioPlaying: (v: boolean) => void;
  setAudioVolume: (v: number) => void;
  setAudioBpm: (bpm: number | null) => void;
  setAudioBandEnergies: (bands: Record<string, number>) => void;
  setAudioBeatFlags: (flags: { bass: boolean; mid: boolean; treble: boolean }) => void;
  setAudioBinding: (stackId: string, paramId: string, binding: AudioBinding | null) => void;
  setAudioMappedValues: (values: Record<string, number>) => void;

  // Keyframe actions
  addKeyframe: (stackId: string, paramId: string, keyframe: Keyframe) => void;
  removeKeyframe: (stackId: string, paramId: string, keyframeId: string) => void;
  updateKeyframe: (
    stackId: string,
    paramId: string,
    keyframeId: string,
    patch: Partial<Keyframe>
  ) => void;
  clearKeyframes: (stackId?: string, paramId?: string) => void;
  getKeyframeValue: (stackId: string, paramId: string, time: number) => number | null;

  // Mask actions
  setActiveMask: (maskB64: string | null) => void;
  setMaskVisible: (v: boolean) => void;
  setSam3Ready: (v: boolean) => void;
  setSam3Mode: (mode: "text" | "point" | "box" | "auto") => void;
  setSam3Clicking: (v: boolean) => void;

  // Tree masking actions
  addSam3Point: (point: { x: number; y: number; label: 1 | 0 }) => void;
  removeSam3Point: (index: number) => void;
  clearSam3Points: () => void;
  setSam3HoverMask: (mask: string | null) => void;
  setSam3OverlayOpacity: (v: number) => void;
  setSam3OverlayColor: (color: string) => void;

  // Multi-mask actions
  setSam3Masks: (masks: string[], scores: number[]) => void;
  setSam3MaskIndex: (index: number) => void;
}

let instanceIdCounter = 0;

export const useAppStore = create<AppState>((set, get) => ({
  currentTime: 0,
  mediaLoaded: false,
  mediaInfo: null,
  previewDataUrl: null,
  originalDataUrl: null,
  filePath: null,
  allEffects: [],
  activeCategory: "dithering",
  searchQuery: "",
  effectStack: [],
  pastStacks: [],
  futureStacks: [],
  selectedStackId: null,
  audioEnabled: false,
  audioFilePath: null,
  audioPlaying: false,
  audioVolume: 1,
  audioBpm: null,
  audioBandEnergies: {},
  audioBeatFlags: { bass: false, mid: false, treble: false },
  audioBindings: {},
  audioMappedValues: {},
  isProcessing: false,
  showBeforeAfter: false,
  zoom: 1,
  statusMessage: "Ready",
  playbackSpeed: 1,
  activeMask: null,
  maskVisible: true,
  sam3Ready: false,
  sam3Mode: "text",
  sam3Clicking: false,
  sam3Points: [],
  sam3HoverMask: null,
  sam3OverlayOpacity: 0.45,
  sam3OverlayColor: "#00ffff",
  sam3Masks: [],
  sam3MaskScores: [],
  sam3MaskIndex: 0,
  keyframes: {},
  exportProgress: 0,
  exportIsRunning: false,
  exportCancelRequested: false,

  setCurrentTime: (t) => set({ currentTime: t }),
  setMediaLoaded: (loaded) => set({ mediaLoaded: loaded }),
  setMediaInfo: (info) => set({ mediaInfo: info }),
  setPreviewDataUrl: (url) => set({ previewDataUrl: url }),
  setOriginalDataUrl: (url) => set({ originalDataUrl: url }),
  setFilePath: (path) => set({ filePath: path }),
  setAllEffects: (effects) => set({ allEffects: effects }),
  setActiveCategory: (cat) => set({ activeCategory: cat }),
  setSearchQuery: (q) => set({ searchQuery: q }),

  addToStack: (effect) => {
    instanceIdCounter += 1;
    const defaults: Record<string, unknown> = {};
    for (const p of effect.parameters) {
      defaults[p.id] = p.default;
    }
    const entry: StackEntry = {
      id: `stack-${instanceIdCounter}`,
      effectId: effect.id,
      effectName: effect.name,
      params: defaults,
      enabled: true,
    };
    set((state) => ({
      pastStacks: [...state.pastStacks, state.effectStack],
      futureStacks: [],
      effectStack: [...state.effectStack, entry],
      selectedStackId: entry.id,
    }));
  },

  removeFromStack: (id) =>
    set((state) => {
      const newStack = state.effectStack.filter((e) => e.id !== id);
      return {
        pastStacks: [...state.pastStacks, state.effectStack],
        futureStacks: [],
        effectStack: newStack,
        selectedStackId:
          state.selectedStackId === id
            ? (newStack[newStack.length - 1]?.id ?? null)
            : state.selectedStackId,
      };
    }),

  moveStackItem: (fromIndex, toIndex) =>
    set((state) => {
      const arr = [...state.effectStack];
      const [item] = arr.splice(fromIndex, 1);
      arr.splice(toIndex, 0, item);
      return {
        pastStacks: [...state.pastStacks, state.effectStack],
        futureStacks: [],
        effectStack: arr,
      };
    }),

  updateStackParams: (id, params) =>
    set((state) => ({
      pastStacks: [...state.pastStacks, state.effectStack],
      futureStacks: [],
      effectStack: state.effectStack.map((e) =>
        e.id === id ? { ...e, params: { ...e.params, ...params } } : e
      ),
    })),

  toggleStackItem: (id) =>
    set((state) => ({
      pastStacks: [...state.pastStacks, state.effectStack],
      futureStacks: [],
      effectStack: state.effectStack.map((e) => (e.id === id ? { ...e, enabled: !e.enabled } : e)),
    })),

  selectStackItem: (id) => set({ selectedStackId: id }),
  setIsProcessing: (v) => set({ isProcessing: v }),
  setShowBeforeAfter: (v) => set({ showBeforeAfter: v }),
  setZoom: (z) => set({ zoom: Math.max(0.1, Math.min(5, z)) }),
  setStatusMessage: (msg) => set({ statusMessage: msg }),
  setPlaybackSpeed: (speed) => set({ playbackSpeed: Math.max(0.25, Math.min(4, speed)) }),
  setExportProgress: (progress) => set({ exportProgress: Math.max(0, Math.min(100, progress)) }),
  setExportIsRunning: (v) => set({ exportIsRunning: v }),
  requestExportCancel: () => set({ exportCancelRequested: true }),
  resetExport: () =>
    set({ exportProgress: 0, exportIsRunning: false, exportCancelRequested: false }),
  clearStack: () =>
    set((state) => ({
      pastStacks: [...state.pastStacks, state.effectStack],
      futureStacks: [],
      effectStack: [],
      selectedStackId: null,
    })),

  undo: () =>
    set((state) => {
      if (state.pastStacks.length === 0) return state;
      const newPast = [...state.pastStacks];
      const previous = newPast.pop()!;
      return {
        pastStacks: newPast,
        futureStacks: [state.effectStack, ...state.futureStacks],
        effectStack: previous,
      };
    }),

  redo: () =>
    set((state) => {
      if (state.futureStacks.length === 0) return state;
      const newFuture = [...state.futureStacks];
      const next = newFuture.shift()!;
      return {
        pastStacks: [...state.pastStacks, state.effectStack],
        futureStacks: newFuture,
        effectStack: next,
      };
    }),

  canUndo: () => get().pastStacks.length > 0,
  canRedo: () => get().futureStacks.length > 0,

  // Audio actions
  setAudioEnabled: (v) => set({ audioEnabled: v }),
  setAudioFilePath: (path) => set({ audioFilePath: path }),
  setAudioPlaying: (v) => set({ audioPlaying: v }),
  setAudioVolume: (v) => set({ audioVolume: Math.max(0, Math.min(1, v)) }),
  setAudioBpm: (bpm) => set({ audioBpm: bpm }),
  setAudioBandEnergies: (bands) => set({ audioBandEnergies: bands }),
  setAudioBeatFlags: (flags) => set({ audioBeatFlags: flags }),
  setAudioBinding: (stackId, paramId, binding) =>
    set((state) => {
      const entryBindings = { ...(state.audioBindings[stackId] || {}) };
      if (binding) {
        entryBindings[paramId] = binding;
      } else {
        delete entryBindings[paramId];
      }
      return {
        audioBindings: { ...state.audioBindings, [stackId]: entryBindings },
      };
    }),
  setAudioMappedValues: (values) => set({ audioMappedValues: values }),

  addKeyframe: (stackId, paramId, keyframe) =>
    set((state) => {
      const entry = state.keyframes[stackId] || {};
      const track = entry[paramId] ? [...entry[paramId]] : [];
      track.push(keyframe);
      track.sort((a, b) => a.time - b.time);
      return { keyframes: { ...state.keyframes, [stackId]: { ...entry, [paramId]: track } } };
    }),

  removeKeyframe: (stackId, paramId, keyframeId) =>
    set((state) => {
      const entry = state.keyframes[stackId];
      if (!entry) return state;
      const track = entry[paramId];
      if (!track) return state;
      const filtered = track.filter((k) => k.id !== keyframeId);
      const newEntry = { ...entry };
      if (filtered.length === 0) delete newEntry[paramId];
      else newEntry[paramId] = filtered;
      const newKeyframes = { ...state.keyframes };
      if (Object.keys(newEntry).length === 0) delete newKeyframes[stackId];
      else newKeyframes[stackId] = newEntry;
      return { keyframes: newKeyframes };
    }),

  updateKeyframe: (stackId, paramId, keyframeId, patch) =>
    set((state) => {
      const entry = state.keyframes[stackId];
      if (!entry) return state;
      const track = entry[paramId];
      if (!track) return state;
      const updated = track.map((k) => (k.id === keyframeId ? { ...k, ...patch } : k));
      updated.sort((a, b) => a.time - b.time);
      return { keyframes: { ...state.keyframes, [stackId]: { ...entry, [paramId]: updated } } };
    }),

  clearKeyframes: (stackId, paramId) =>
    set((state) => {
      if (!stackId) return { keyframes: {} };
      const newKeyframes = { ...state.keyframes };
      if (paramId && newKeyframes[stackId]) {
        const entry = { ...newKeyframes[stackId] };
        delete entry[paramId];
        if (Object.keys(entry).length === 0) delete newKeyframes[stackId];
        else newKeyframes[stackId] = entry;
      } else delete newKeyframes[stackId];
      return { keyframes: newKeyframes };
    }),

  getKeyframeValue: (stackId, paramId, time) => {
    const state = get();
    const entry = state.keyframes[stackId];
    if (!entry) return null;
    const track = entry[paramId];
    if (!track || track.length === 0) return null;
    let idx = 0;
    while (idx < track.length && track[idx].time < time) idx++;
    if (idx < track.length && track[idx].time === time) return track[idx].value;
    if (idx === 0) return track[0].value;
    if (idx >= track.length) return track[track.length - 1].value;
    const k1 = track[idx - 1];
    const k2 = track[idx];
    const t = (time - k1.time) / (k2.time - k1.time);
    const eased = applyEasing(t, k1.easing);
    return k1.value + (k2.value - k1.value) * eased;
  },

  // Mask actions
  setActiveMask: (maskB64) => set({ activeMask: maskB64 }),
  setMaskVisible: (v) => set({ maskVisible: v }),
  setSam3Ready: (v) => set({ sam3Ready: v }),
  setSam3Mode: (mode) => set({ sam3Mode: mode }),
  setSam3Clicking: (v) => set({ sam3Clicking: v }),

  // Tree masking actions
  addSam3Point: (point) => set((state) => ({ sam3Points: [...state.sam3Points, point] })),
  removeSam3Point: (index) =>
    set((state) => ({ sam3Points: state.sam3Points.filter((_, i) => i !== index) })),
  clearSam3Points: () => set({ sam3Points: [] }),
  setSam3HoverMask: (mask) => set({ sam3HoverMask: mask }),
  setSam3OverlayOpacity: (v) => set({ sam3OverlayOpacity: v }),
  setSam3OverlayColor: (color) => set({ sam3OverlayColor: color }),

  // Multi-mask actions
  setSam3Masks: (masks, scores) =>
    set({
      sam3Masks: masks,
      sam3MaskScores: scores,
      sam3MaskIndex: 0,
      activeMask: masks.length > 0 ? masks[0] : null,
    }),
  setSam3MaskIndex: (index) =>
    set((state) => {
      const safeIndex = Math.max(0, Math.min(state.sam3Masks.length - 1, index));
      return {
        sam3MaskIndex: safeIndex,
        activeMask: state.sam3Masks[safeIndex] ?? null,
      };
    }),
}));

/** Easing function for keyframe interpolation */
export function applyEasing(t: number, easing: EasingType): number {
  if (easing === "hold") return 0;
  if (easing === "linear") return t;
  if (easing === "easeIn") return t * t;
  if (easing === "easeOut") return 1 - (1 - t) * (1 - t);
  // easeInOut
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
