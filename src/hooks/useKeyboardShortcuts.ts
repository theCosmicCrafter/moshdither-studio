import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef } from "react";
import { useAppStore } from "../store";
import { getAllBindings, matchesBinding } from "../utils/keyboardShortcuts";
import { getCommands } from "../utils/commands";
import { formatTimecode } from "../utils/timecode";
import { isTauriAvailable } from "../lib/browserFallback";
import { logger } from "../utils/logger";
import { useProject } from "./useProject";

/**
 * useKeyboardShortcuts — Global keyboard shortcut handler driven by the
 * keyboardShortcuts utility so the KeyboardShortcutsEditor has effect.
 * Mount once at the app level.
 */
// Number keys jump to library categories in the accordion's visual order.
// Category ids are the accordion's namespace (e.g. "pixel_geometry"), not
// the effect-id prefix ("pixel_geo") — writing the prefix once made key 5
// select a category that exists nowhere.
const CATEGORY_KEYMAP: Record<string, [string, string]> = {
  "1": ["datamoshing", "Datamosh"],
  "2": ["dithering", "Dither"],
  "3": ["analog", "Analog"],
  "4": ["color", "Color"],
  "5": ["pixel_geometry", "Pixel"],
  "6": ["glitch", "Glitch"],
  "7": ["noise", "Noise"],
  "8": ["artistic", "Art"],
  "9": ["audio_reactive", "Audio"],
};

export function useKeyboardShortcuts() {
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);
  const canUndo = useAppStore((s) => s.canUndo);
  const canRedo = useAppStore((s) => s.canRedo);
  const setCurrentTime = useAppStore((s) => s.setCurrentTime);
  const currentTimeRef = useRef(useAppStore.getState().currentTime);
  const selectedStackId = useAppStore((s) => s.selectedStackId);
  const removeFromStack = useAppStore((s) => s.removeFromStack);
  const setAudioPlaying = useAppStore((s) => s.setAudioPlaying);
  const audioPlayingRef = useRef(useAppStore.getState().audioPlaying);
  const togglePlay = useAppStore((s) => s.togglePlay);
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);
  const setInPoint = useAppStore((s) => s.setInPoint);
  const setOutPoint = useAppStore((s) => s.setOutPoint);
  const clearInOut = useAppStore((s) => s.clearInOut);
  const showBeforeAfter = useAppStore((s) => s.showBeforeAfter);
  const setShowBeforeAfter = useAppStore((s) => s.setShowBeforeAfter);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const setActiveCategory = useAppStore((s) => s.setActiveCategory);
  const { saveProject, openProject } = useProject();

  // Keep transient values fresh without re-registering the global keydown listener every frame
  useEffect(() => {
    return useAppStore.subscribe((state) => {
      currentTimeRef.current = state.currentTime;
      audioPlayingRef.current = state.audioPlaying;
    });
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMeta = e.ctrlKey || e.metaKey;
      const isInput =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement;

      const bindings = getAllBindings();
      const matchedCommand = Object.entries(bindings).find(
        ([, binding]) => matchesBinding(e, binding)
      )?.[0];

      // Hardcoded transport + editing shortcuts remain active regardless of binding config.
      if (isInput && !(isMeta && (e.key === "z" || e.key === "y" || e.key === "s"))) {
        return;
      }

      // Custom bindings override defaults
      if (matchedCommand) {
        e.preventDefault();
        switch (matchedCommand) {
          case "edit:undo":
            if (canUndo()) {
              undo();
              setStatusMessage("Undo");
            }
            break;
          case "edit:redo":
            if (canRedo()) {
              redo();
              setStatusMessage("Redo");
            }
            break;
          case "app:open":
            void openProject();
            break;
          case "app:export": {
            // Same open-or-trigger funnel as the toolbar/status-bar Export
            // buttons: the panel must be docked to receive the trigger.
            const st = useAppStore.getState();
            if (!st.mediaLoaded) {
              setStatusMessage("Export needs loaded media");
            } else if (!st.dockedPanels.includes("export")) {
              st.triggerLayoutAction("add", "export");
            } else {
              st.triggerExport();
            }
            break;
          }
          case "view:fullscreen":
            void toggleFullscreen();
            break;
          case "accessibility:zoomIn":
            // Matches the toolbar's own zoom-in step (Toolbar.tsx).
            useAppStore.getState().setZoom(useAppStore.getState().zoom + 0.25);
            break;
          case "accessibility:zoomOut":
            useAppStore.getState().setZoom(useAppStore.getState().zoom - 0.25);
            break;
          default: {
            // Anything else came from the Keyboard Shortcuts editor, which
            // lists the COMMAND PALETTE registry -- ids like "undo",
            // "play-pause", "clear-stack" -- while the seven built-in bindings
            // above use a namespaced set ("edit:undo", "app:open"). So every
            // shortcut a user recorded wrote an id this switch had no case for
            // and was silently swallowed. Worse, bindings are matched by KEY,
            // so recording Ctrl+Z against "undo" could win the lookup over
            // "edit:undo" and disable a working default.
            //
            // Dispatching through the registry makes the editor honest: every
            // command it offers is now actually bindable.
            const cmd = getCommands().find((c) => c.id === matchedCommand);
            if (cmd) cmd.action();
            break;
          }
        }
        return;
      }

      const category = CATEGORY_KEYMAP[e.key];
      if (category && !isInput && !isMeta) {
        // Writing "" first forces a transition even when the category is
        // already active — the accordion's subscription only reacts to
        // changes, so a repeat press after a manual collapse still
        // re-expands it.
        setActiveCategory("");
        setActiveCategory(category[0]);
        setStatusMessage(`Category: ${category[1]}`);
        return;
      }

      switch (e.key) {
        case " ":
          if (!isInput) {
            e.preventDefault();
            togglePlay();
            setAudioPlaying(!audioPlayingRef.current);
          }
          break;

        case "ArrowLeft":
          if (!isInput) {
            e.preventDefault();
            setCurrentTime(Math.max(0, currentTimeRef.current - 1 / 30));
          }
          break;

        case "ArrowRight":
          if (!isInput) {
            e.preventDefault();
            // Bounded by duration, mirroring ArrowLeft's Math.max(0, ...).
            // Without it, holding the key walked the playhead indefinitely past
            // the end of the clip.
            setCurrentTime(
              Math.min(useAppStore.getState().duration, currentTimeRef.current + 1 / 30)
            );
          }
          break;

        case "Home":
          if (!isInput) {
            e.preventDefault();
            setCurrentTime(0);
          }
          break;

        case "End":
          if (!isInput) {
            e.preventDefault();
            setCurrentTime(useAppStore.getState().duration);
          }
          break;

        case "Delete":
        case "Backspace":
          if (!isInput && selectedStackId) {
            e.preventDefault();
            removeFromStack(selectedStackId);
            setStatusMessage("Effect removed");
          }
          break;

        case "z":
          if (isMeta && !e.shiftKey) {
            e.preventDefault();
            if (canUndo()) {
              undo();
              setStatusMessage("Undo");
            }
          } else if (isMeta && e.shiftKey) {
            e.preventDefault();
            if (canRedo()) {
              redo();
              setStatusMessage("Redo");
            }
          }
          break;

        case "y":
          if (isMeta) {
            e.preventDefault();
            if (canRedo()) {
              redo();
              setStatusMessage("Redo");
            }
          }
          break;

        case "s":
        case "S":
          if (isMeta) {
            e.preventDefault();
            if (e.shiftKey) {
              saveProject(true);
            } else {
              saveProject(false);
            }
          }
          break;

        case "i":
          if (!isInput && !isMeta) {
            e.preventDefault();
            // Frame-accurate. Rounding to whole seconds made a trim at 1.5 s
            // impossible, and the message called that second a "frame".
            setInPoint(currentTimeRef.current);
            setStatusMessage(`In point set at ${formatTimecode(currentTimeRef.current)}`);
          }
          break;

        case "I":
          if (!isInput && e.altKey) {
            e.preventDefault();
            clearInOut();
            setStatusMessage("In/Out points cleared");
          }
          break;

        case "o":
          if (isMeta) {
            e.preventDefault();
            openProject();
          } else if (!isInput) {
            e.preventDefault();
            setOutPoint(currentTimeRef.current);
            setStatusMessage(`Out point set at ${formatTimecode(currentTimeRef.current)}`);
          }
          break;

        case "x":
          if (!isInput && !isMeta) {
            e.preventDefault();
            clearInOut();
            setStatusMessage("In/Out points cleared");
          }
          break;

        case "v":
          if (!isInput && !isMeta) {
            e.preventDefault();
            setShowBeforeAfter(!showBeforeAfter);
            setStatusMessage(showBeforeAfter ? "Original/Preview off" : "Original/Preview on");
          }
          break;

        case "t":
          if (!isInput && !isMeta) {
            e.preventDefault();
            toggleTheme();
            setStatusMessage("Theme toggled");
          }
          break;

        case "F11":
          if (!isInput) {
            e.preventDefault();
            void toggleFullscreen();
          }
          break;

        default:
          break;
      }
    };

    const toggleFullscreen = async () => {
      if (!isTauriAvailable()) return;
      try {
        const appWindow = getCurrentWindow();
        const fs = await appWindow.isFullscreen();
        await appWindow.setFullscreen(!fs);
      } catch (err) {
        logger.warn("shortcuts", "toggle fullscreen failed", { error: String(err) });
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    undo,
    redo,
    canUndo,
    canRedo,
    setCurrentTime,
    selectedStackId,
    removeFromStack,
    setAudioPlaying,
    togglePlay,
    setStatusMessage,
    saveProject,
    openProject,
    setInPoint,
    setOutPoint,
    clearInOut,
    showBeforeAfter,
    setShowBeforeAfter,
    toggleTheme,
    setActiveCategory,
  ]);
}
