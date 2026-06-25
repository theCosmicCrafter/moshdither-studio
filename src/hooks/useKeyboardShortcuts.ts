import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef } from "react";
import { useAppStore } from "../store";
import { eventToKeyString, getAllBindings } from "../utils/keyboardShortcuts";
import { useProject } from "./useProject";

/**
 * useKeyboardShortcuts — Global keyboard shortcut handler driven by the
 * keyboardShortcuts utility so the KeyboardShortcutsEditor has effect.
 * Mount once at the app level.
 */
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

      const keyString = eventToKeyString(e);
      const bindings = getAllBindings();
      const matchedCommand = Object.entries(bindings).find(
        ([, binding]) => binding === keyString
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
          case "app:export":
            // Export is handled by the toolbar; this is reserved for future wiring
            setStatusMessage("Export shortcut triggered (use toolbar to export)");
            break;
          case "view:fullscreen":
            void toggleFullscreen();
            break;
          default:
            break;
        }
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
            setCurrentTime(currentTimeRef.current + 1 / 30);
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
            setCurrentTime(300);
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
          if (isMeta) {
            e.preventDefault();
            saveProject();
          }
          break;

        case "i":
          if (!isInput && !isMeta) {
            e.preventDefault();
            setInPoint(Math.round(currentTimeRef.current));
            setStatusMessage(`In point set at frame ${Math.round(currentTimeRef.current)}`);
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
            setOutPoint(Math.round(currentTimeRef.current));
            setStatusMessage(`Out point set at frame ${Math.round(currentTimeRef.current)}`);
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

        case "1":
          if (!isInput && !isMeta) {
            setActiveCategory("dithering");
            setStatusMessage("Category: Dithering");
          }
          break;
        case "2":
          if (!isInput && !isMeta) {
            setActiveCategory("analog");
            setStatusMessage("Category: Analog");
          }
          break;
        case "3":
          if (!isInput && !isMeta) {
            setActiveCategory("color");
            setStatusMessage("Category: Color");
          }
          break;
        case "4":
          if (!isInput && !isMeta) {
            setActiveCategory("glitch");
            setStatusMessage("Category: Glitch");
          }
          break;
        case "5":
          if (!isInput && !isMeta) {
            setActiveCategory("pixel_geo");
            setStatusMessage("Category: Pixel Geometry");
          }
          break;
        case "6":
          if (!isInput && !isMeta) {
            setActiveCategory("datamoshing");
            setStatusMessage("Category: Datamoshing");
          }
          break;
        case "7":
          if (!isInput && !isMeta) {
            setActiveCategory("noise");
            setStatusMessage("Category: Noise");
          }
          break;
        case "8":
          if (!isInput && !isMeta) {
            setActiveCategory("artistic");
            setStatusMessage("Category: Artistic");
          }
          break;
        case "9":
          if (!isInput && !isMeta) {
            setActiveCategory("segmentation");
            setStatusMessage("Category: Segmentation");
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
      let appWindow: {
        isFullscreen: () => Promise<boolean>;
        setFullscreen: (v: boolean) => Promise<void>;
      } | null = null;
      if (
        typeof globalThis !== "undefined" &&
        (globalThis as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
      ) {
        try {
          appWindow = getCurrentWindow();
        } catch {
          appWindow = null;
        }
      }
      if (appWindow) {
        const fs = await appWindow.isFullscreen();
        await appWindow.setFullscreen(!fs);
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
