import { useEffect } from "react";
import { useAppStore } from "../store";
import { useProject } from "./useProject";

/**
 * useKeyboardShortcuts — Global keyboard shortcut handler.
 * Mount once at the app level.
 */
export function useKeyboardShortcuts() {
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);
  const canUndo = useAppStore((s) => s.canUndo);
  const canRedo = useAppStore((s) => s.canRedo);
  const setCurrentTime = useAppStore((s) => s.setCurrentTime);
  const currentTime = useAppStore((s) => s.currentTime);
  const selectedStackId = useAppStore((s) => s.selectedStackId);
  const removeFromStack = useAppStore((s) => s.removeFromStack);
  const setAudioPlaying = useAppStore((s) => s.setAudioPlaying);
  const audioPlaying = useAppStore((s) => s.audioPlaying);
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);
  const { saveProject, openProject } = useProject();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMeta = e.ctrlKey || e.metaKey;
      const isInput =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement;

      // Ignore shortcuts when typing in inputs
      if (isInput && !(isMeta && (e.key === "z" || e.key === "y" || e.key === "s"))) {
        return;
      }

      switch (e.key) {
        case " ":
          // Space: play/pause audio (but not if typing)
          if (!isInput) {
            e.preventDefault();
            setAudioPlaying(!audioPlaying);
          }
          break;

        case "ArrowLeft":
          if (!isInput) {
            e.preventDefault();
            setCurrentTime(Math.max(0, currentTime - 1 / 30));
          }
          break;

        case "ArrowRight":
          if (!isInput) {
            e.preventDefault();
            setCurrentTime(currentTime + 1 / 30);
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
            setCurrentTime(300); // placeholder max duration
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

        case "o":
          if (isMeta) {
            e.preventDefault();
            openProject();
          }
          break;

        default:
          break;
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
    currentTime,
    selectedStackId,
    removeFromStack,
    setAudioPlaying,
    audioPlaying,
    setStatusMessage,
    saveProject,
    openProject,
  ]);
}
