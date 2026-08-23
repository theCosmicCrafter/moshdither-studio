import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { logger } from "../utils/logger";
import { useShallow } from "zustand/react/shallow";
import {
  animateStillAsVideo,
  applyEffectStack,
  applyFfglitch,
  convertFileSrc,
  generateProxy,
  getFrameData,
  getMediaMetadata,
  loadMediaFile,
  loadMediaFromPath,
  sam3LoadImage,
  saveImage,
} from "../lib/tauri";
import { useClickOutside } from "../hooks/useClickOutside";
import { useAppStore } from "../store";
import { stackToRustPayload, stackRequiresCpuPreview } from "../utils/effectConverter";
import WindowControls from "./WindowControls";
import KeyboardShortcutsEditor from "./KeyboardShortcutsEditor";
import UpdateChecker from "./UpdateChecker";
import LabeledSlider from "./LabeledSlider";
import AnimateAsVideoModal from "./AnimateAsVideoModal";
import { PANEL_REGISTRY } from "./DockSystem/panelRegistry";

interface Props {
  readonly onFileLoaded: () => Promise<boolean>;
}

// "Animate as Video" (still image -> looped freeze-frame video) now prompts for
// length and frame rate rather than using fixed 5s/30fps constants. The v1
// reasoning -- that 150 frames is enough material for any video-only effect and
// a still has no source fps to inherit -- justified a sane default, not a fixed
// value: how far an I-frame's corruption smears is a function of how many
// frames follow it, so for datamoshing the clip length is the creative control.
// The old constants survive as the store's defaults (see animateDurationSecs /
// animateFps), and the last values used are remembered.

export default function Toolbar({ onFileLoaded }: Props) {
  const mediaLoaded = useAppStore((s) => s.mediaLoaded);
  const isVideo = useAppStore((s) => s.isVideo);
  const isProcessing = useAppStore((s) => s.isProcessing);
  const setIsVideo = useAppStore((s) => s.setIsVideo);
  const setDuration = useAppStore((s) => s.setDuration);
  const setAnimateDialogOpen = useAppStore((s) => s.setAnimateDialogOpen);
  const setAnimateSourceStillPath = useAppStore((s) => s.setAnimateSourceStillPath);
  const animateSourceStillPath = useAppStore((s) => s.animateSourceStillPath);
  const setProxyUrl = useAppStore((s) => s.setProxyUrl);
  const showBeforeAfter = useAppStore((s) => s.showBeforeAfter);
  const zoom = useAppStore((s) => s.zoom);
  const { effectStack, maskRevision } = useAppStore(
    useShallow((s) => ({ effectStack: s.effectStack, maskRevision: s.maskRevision }))
  );
  const stackCount = effectStack.length;
  // Memoised against the (immutable) effect stack -- matches
  // PreviewViewport's cpuRenderSignature. Without this, computing the
  // signature inline in a bare selector re-runs the map+JSON.stringify over
  // the whole stack on every store update (e.g. every playback frame's
  // currentTime tick), not just on genuine effect-stack edits.
  const processSignature = useMemo(
    () =>
      effectStack
        .map(
          (e) =>
            `${e.id}:${e.enabled}:${JSON.stringify(e.params)}:${e.maskId}:${e.maskMode}`
        )
        .join("|") + `|${maskRevision}`,
    [effectStack, maskRevision]
  );
  const verifyPanelVisible = useAppStore((s) => s.panelVisibility.verify);
  const togglePanel = useAppStore((s) => s.togglePanel);
  const setShowBeforeAfter = useAppStore((s) => s.setShowBeforeAfter);
  const setZoom = useAppStore((s) => s.setZoom);
  const setIsProcessing = useAppStore((s) => s.setIsProcessing);
  const setPreviewDataUrl = useAppStore((s) => s.setPreviewDataUrl);
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);
  const setFilePath = useAppStore((s) => s.setFilePath);
  const setMediaMetadata = useAppStore((s) => s.setMediaMetadata);
  const clearStack = useAppStore((s) => s.clearStack);
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);
  const canUndo = useAppStore((s) => s.canUndo());
  const canRedo = useAppStore((s) => s.canRedo());
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showUpdateChecker, setShowUpdateChecker] = useState(false);
  const [editMenuOpen, setEditMenuOpen] = useState(false);
  const editMenuRef = useClickOutside<HTMLDivElement>(editMenuOpen, () => setEditMenuOpen(false));
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const viewMenuRef = useClickOutside<HTMLDivElement>(viewMenuOpen, () => setViewMenuOpen(false));
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const fileMenuRef = useClickOutside<HTMLDivElement>(fileMenuOpen, () => setFileMenuOpen(false));
  const dockedPanels = useAppStore((s) => s.dockedPanels) || [];
  const triggerLayoutAction = useAppStore((s) => s.triggerLayoutAction);
  const setTheme = useAppStore((s) => s.setTheme);

  const dockedIds = new Set(dockedPanels);
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const panelOpacity = useAppStore((s) => s.panelOpacity);
  const setPanelOpacity = useAppStore((s) => s.setPanelOpacity);
  const renderIdRef = useRef(0);
  const lowQualityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleProcess = useCallback(async (previewScale: number = 0.5) => {
    const state = useAppStore.getState();
    if (!state.mediaLoaded) return;

    if (state.effectStack.length === 0) {
      state.setUseCpuPreview(false);
      try {
        const original = await getFrameData();
        setPreviewDataUrl(original);
        setStatusMessage("Showing original");
      } catch (err) {
        console.error("Failed to load original frame:", err);
      }
      return;
    }

    // Check if any effect in the stack requires CPU rendering (no accurate WebGL shader).
    const needsCpu = stackRequiresCpuPreview(state.effectStack);

    // If all effects have accurate WebGL shaders, skip the CPU roundtrip.
    if (!needsCpu && !state.showBeforeAfter) {
      state.setUseCpuPreview(false);
      setStatusMessage("WebGL preview active");
      return;
    }

    // If CPU preview is already active, the PreviewViewport's CPU effect handles
    // all re-renders (including debounced high-quality). Skip to avoid duplicate renders.
    if (state.useCpuPreview) {
      return;
    }

    // Failsafe: when switching to CPU mode, delay setUseCpuPreview until the render
    // completes to prevent flashing the original image during preset loads.
    // The previous previewDataUrl stays visible until the new CPU render resolves.
    const prevUseCpu = state.useCpuPreview;

    // Increment render ID for cancellation — if a newer render comes in, this one is stale
    const myRenderId = ++renderIdRef.current;
    setIsProcessing(true);
    setStatusMessage("Preview...");
    try {
      const activeStack = stackToRustPayload(
        state.effectStack,
        state.activeMask,
        state.sam3Masks,
        state.currentTime
      );
      const result = await applyEffectStack(activeStack, null, previewScale);
      // Only apply result if this is still the latest render (not stale)
      if (myRenderId === renderIdRef.current) {
        // Now safe to switch to CPU mode — the new render is ready
        if (needsCpu && !prevUseCpu) {
          state.setUseCpuPreview(true);
        }
        setPreviewDataUrl(result);
        setStatusMessage("Preview ready");
      }
    } catch (err) {
      if (myRenderId === renderIdRef.current) {
        setStatusMessage(`Error: ${err}`);
      }
    } finally {
      if (myRenderId === renderIdRef.current) {
        setIsProcessing(false);
      }
    }
  }, [setIsProcessing, setPreviewDataUrl, setStatusMessage]);

  const handleOpen = async () => {
    setStatusMessage("Opening file...");
    try {
      const path = await loadMediaFile();
      if (path) {
        setFilePath(path);
        const synced = await onFileLoaded();

        try {
          const meta = await getMediaMetadata(path);
          setMediaMetadata(meta);
        } catch (e) {
          console.warn("Failed to load metadata", e);
        }

        const state = useAppStore.getState();
        if (state.sam3Ready) {
          setStatusMessage("Loading new image into SAM3...");
          try {
            const b64 = await getFrameData();
            await sam3LoadImage(b64);
          } catch (e) {
            logger.warn("sam3", "Failed to load new image into SAM3", { err: String(e) });
          }
        }

        // A failed preview sync used to read as "Loaded: <path> (preview sync
        // pending)" -- success-shaped text for a backend failure, which neither
        // the log heuristic nor the user could tell had gone wrong.
        if (synced) {
          setStatusMessage(`Loaded: ${path}`);
        } else {
          setStatusMessage(`Loaded ${path}, but the preview did not refresh`, "error");
        }
      } else {
        setStatusMessage("Open cancelled");
      }
    } catch (err) {
      console.error("[Toolbar] handleOpen failed:", err);
      setStatusMessage(`Open error: ${err}`);
    }
  };

  // Turns the currently loaded still image into a real multi-frame video
  // (freeze-frame loop) and loads it back in through the normal
  // video-loading path, so Timeline/playback/video-only effects work on it
  // exactly like any other opened video -- no special-casing needed
  // elsewhere. Only meaningful when a still image (not already a video) is
  // loaded, matching the isVideoOnlyEffect gating used across
  // EffectBrowser/EffectStack.
  // Undo of Animate as Video. The conversion replaced filePath/isVideo with the
  // generated clip, which left no way back short of reopening the original by
  // hand -- the still on disk was never touched, the app had simply forgotten
  // it. Reloads the remembered still through the same path as File > Open so
  // isVideo, duration, proxy and SAM3 are all re-derived rather than patched.
  const handleRevertToStill = async () => {
    const state = useAppStore.getState();
    const stillPath = state.animateSourceStillPath;
    if (!stillPath || isProcessing) return;
    setStatusMessage("Reverting to the original still...");
    setIsProcessing(true);
    try {
      await loadMediaFromPath(stillPath);
      setFilePath(stillPath);
      setIsVideo(false);
      setProxyUrl(null);
      setAnimateSourceStillPath(null);
      const synced = await onFileLoaded();
      try {
        setMediaMetadata(await getMediaMetadata(stillPath));
      } catch (e) {
        console.warn("Failed to load metadata for reverted still", e);
      }
      if (useAppStore.getState().sam3Ready) {
        try {
          await sam3LoadImage(await getFrameData());
        } catch (e) {
          console.warn("Failed to load reverted still into SAM3", e);
        }
      }
      setStatusMessage(
        synced ? `Reverted to still: ${stillPath}` : `Reverted to still: ${stillPath} (preview sync pending)`
      );
    } catch (err) {
      setStatusMessage(`Revert to still failed: ${err}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Opens the prompt; the conversion itself runs from its onConfirm.
  const handleAnimateAsVideo = () => {
    if (!mediaLoaded || isVideo || isProcessing) return;
    if (!useAppStore.getState().filePath) {
      setStatusMessage("Animate as Video: no file path for the loaded image (reopen it via File > Open first)");
      return;
    }
    setAnimateDialogOpen(true);
  };

  const runAnimateAsVideo = async (durationSecs: number, fps: number) => {
    if (!mediaLoaded || isVideo || isProcessing) return;
    const state = useAppStore.getState();
    const path = state.filePath;
    if (!path) {
      setStatusMessage("Animate as Video: no file path for the loaded image (reopen it via File > Open first)");
      return;
    }
    setStatusMessage("Animating still image as video...");
    setIsProcessing(true);
    try {
      const videoPath = await animateStillAsVideo(path, durationSecs, fps);
      // Remember what this was made from so the conversion can be undone
      // without hunting for the original file again.
      setAnimateSourceStillPath(path);
      // Only point filePath at the generated video once it's actually loaded --
      // otherwise a failed loadMediaFromPath below leaves filePath referencing
      // a video while isVideo/mediaLoaded still reflect the prior still image.
      await loadMediaFromPath(videoPath);
      setFilePath(videoPath);

      // The freshly generated file is unambiguously a video -- set this
      // directly instead of re-deriving it from the extension. Mirrors
      // PreviewViewport's own video-loading path (refreshPreviewFromBackend),
      // which is the only other place isVideo/proxyUrl get set for real:
      // the WebGL preview's video texture only activates when both are set.
      setIsVideo(true);
      setDuration(durationSecs);
      try {
        const proxy = await generateProxy(videoPath, 1280, 28);
        setProxyUrl(convertFileSrc(proxy));
      } catch (e) {
        console.warn("Proxy generation failed for animated video:", e);
        setProxyUrl(null);
      }

      const synced = await onFileLoaded();

      const refreshedState = useAppStore.getState();
      if (refreshedState.sam3Ready) {
        setStatusMessage("Loading animated frame into SAM3...");
        try {
          const b64 = await getFrameData();
          await sam3LoadImage(b64);
        } catch (e) {
          console.warn("Failed to load animated frame into SAM3", e);
        }
      }

      setStatusMessage(
        synced
          ? `Animated as video: ${videoPath}`
          : `Animated as video: ${videoPath} (preview sync pending)`
      );
    } catch (err) {
      console.error("[Toolbar] handleAnimateAsVideo failed:", err);
      setStatusMessage(`Animate as Video failed: ${err}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExport = async () => {
    if (!mediaLoaded) return;
    const state = useAppStore.getState();
    const path = state.filePath;
    if (!path) return;

    // Route both video and image sources to the ExportPanel for video export.
    // The backend duplicates single frames to fill the duration (commands.rs).
    state.triggerExport();
    setStatusMessage("Export started from Export panel...");
  };

  // FFglitch/datamosh works by corrupting interframe compression, so it needs a
  // real multi-frame video. Run against a still it produced an unreadable
  // intermediate and surfaced as a raw ffmpeg traceback from mosh_cli.py
  // ("ffmpeg failed: ffmpeg version 8.0-essentials_build ..."), which gave no
  // hint that the input was simply the wrong kind of media. Gate it the same
  // way handleAnimateAsVideo gates the inverse case, and point at the
  // conversion that makes the export possible.
  const handleFfglitchExport = async () => {
    if (!mediaLoaded || isProcessing) return;
    if (!isVideo) {
      setStatusMessage(
        "FFglitch needs a video — it datamoshes between frames. Use File > Animate as Video first to turn this still into one."
      );
      return;
    }
    const state = useAppStore.getState();
    const path = state.filePath;
    if (!path) {
      setStatusMessage("FFglitch export: no file path for the loaded video (reopen it via File > Open first)");
      return;
    }
    setStatusMessage("FFglitch export started...");
    setIsProcessing(true);
    try {
      const outPath = await applyFfglitch(path, "classic", {});
      setStatusMessage(`FFglitch exported: ${outPath}`);
    } catch (err) {
      setStatusMessage(`FFglitch export failed: ${err}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Saves exactly one processed frame to disk, unlike Export Video (which
  // always duplicates the source into a multi-frame clip, even for a still
  // image) -- this is the only path in the app that actually writes a
  // still-image file.
  const handleSaveImage = async () => {
    if (!mediaLoaded) return;
    const state = useAppStore.getState();
    if (state.effectStack.length === 0) return;
    setStatusMessage("Saving image...");
    setIsProcessing(true);
    try {
      const activeStack = stackToRustPayload(
        state.effectStack,
        state.activeMask,
        state.sam3Masks,
        state.currentTime
      );
      const outPath = await saveImage(activeStack, null);
      setStatusMessage(`Image saved: ${outPath}`);
    } catch (err) {
      if (err instanceof Error && err.message === "Save cancelled") {
        setStatusMessage("Ready");
      } else {
        setStatusMessage(`Save image failed: ${err}`);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUndo = async () => {
    undo();
    setTimeout(handleProcess, 0);
  };

  const handleRedo = async () => {
    redo();
    setTimeout(handleProcess, 0);
  };

  const handleClearAll = async () => {
    clearStack();
    setTimeout(handleProcess, 0);
  };

  useEffect(() => {
    if (!mediaLoaded) return;

    // Single medium-quality render for immediate feedback.
    // Full-quality (1.0) render is handled by the CPU preview effect in PreviewViewport
    // which has its own debounce and in-flight queue management.
    if (lowQualityTimerRef.current) clearTimeout(lowQualityTimerRef.current);
    lowQualityTimerRef.current = setTimeout(() => {
      handleProcess(0.5);
    }, 50);

    return () => {
      if (lowQualityTimerRef.current) clearTimeout(lowQualityTimerRef.current);
    };
  }, [processSignature, handleProcess, mediaLoaded]);

  return (
    <header
      data-tauri-drag-region
      className="flex justify-between items-center h-header-height px-container-padding w-full z-50 bg-surface/80 backdrop-blur-xl border-b border-outline-variant/30"
      role="toolbar"
      aria-label="Main toolbar"
    >
      {/* Left: Logo + Nav */}
      <div className="flex items-center gap-6">
        {theme === "custom" ? (
          <img
            src="/logo.png"
            alt="Brand Logo"
            className="h-7 ml-6 object-contain"
            aria-hidden="true"
            onError={(e) => {
              // Fallback to text if no custom logo is found
              e.currentTarget.style.display = 'none';
              if (e.currentTarget.nextElementSibling) {
                e.currentTarget.nextElementSibling.classList.remove('hidden');
              }
            }}
          />
        ) : null}
        <span
          className={`font-headline-lg text-headline-lg solar-text filigree-header cursor-default toolbar-logo ${theme === "custom" ? "hidden ml-2" : "ml-6"}`}
          aria-hidden="true"
        >
          MoshDither Studio
        </span>
        <nav className="hidden md:flex gap-4 ml-6" aria-label="Menu bar">
          <div ref={fileMenuRef} className="relative">
            <button
              onClick={() => setFileMenuOpen((v) => !v)}
              className="font-label-md text-label-md text-accent-pink font-medium border-b-2 border-accent-pink pb-1 hover:text-accent-teal transition-colors flex items-center gap-1"
              aria-haspopup="menu"
              aria-expanded={fileMenuOpen}
              aria-label="File menu"
            >
              File
              <span
                className={`material-symbols-outlined menu-chevron ${fileMenuOpen ? "menu-chevron-open" : ""}`}
                aria-hidden="true"
              >
                expand_more
              </span>
            </button>
            {fileMenuOpen && (
              <div
                className="absolute left-0 top-full mt-1 z-[200] min-w-[220px] neo-flat rounded-lg bg-surface/90 backdrop-blur-xl border border-outline/20 py-1 shadow-xl"
                role="menu"
                aria-label="File menu"
              >
                <button
                  onClick={() => { handleOpen(); setFileMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 font-label-md text-label-md text-on-surface hover:bg-accent-teal/10 transition-colors"
                  role="menuitem"
                >
                  <span className="material-symbols-outlined menu-item-icon" aria-hidden="true">folder_open</span>
                  Open File
                </button>
                <button
                  onClick={() => { handleAnimateAsVideo(); setFileMenuOpen(false); }}
                  disabled={!mediaLoaded || isVideo || isProcessing}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 font-label-md text-label-md text-on-surface hover:bg-accent-teal/10 transition-colors ${mediaLoaded && !isVideo && !isProcessing ? "toolbar-enabled" : "toolbar-disabled"}`}
                  role="menuitem"
                  aria-disabled={!mediaLoaded || isVideo || isProcessing}
                  title="Turn the loaded still image into a looped video so video-only effects (frame reverse, shuffle, motion transfer, ...) can be applied"
                >
                  <span className="material-symbols-outlined menu-item-icon" aria-hidden="true">animation</span>
                  Animate as Video
                </button>
                {animateSourceStillPath && (
                  <button
                    onClick={() => { handleRevertToStill(); setFileMenuOpen(false); }}
                    disabled={isProcessing}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 font-label-md text-label-md text-on-surface hover:bg-accent-teal/10 transition-colors ${isProcessing ? "toolbar-disabled" : "toolbar-enabled"}`}
                    role="menuitem"
                    aria-disabled={isProcessing}
                    title="Load the still this clip was animated from. The generated video file is left on disk."
                  >
                    <span className="material-symbols-outlined menu-item-icon" aria-hidden="true">undo</span>
                    Revert to Still
                  </button>
                )}
                <div className="border-t border-outline/10 my-1" />
                <button
                  onClick={() => { handleExport(); setFileMenuOpen(false); }}
                  disabled={!mediaLoaded}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 font-label-md text-label-md text-on-surface hover:bg-accent-teal/10 transition-colors ${mediaLoaded ? "toolbar-enabled" : "toolbar-disabled"}`}
                  role="menuitem"
                  aria-disabled={!mediaLoaded}
                >
                  <span className="material-symbols-outlined menu-item-icon">movie</span>
                  Export Video
                </button>
                <button
                  onClick={() => { handleFfglitchExport(); setFileMenuOpen(false); }}
                  disabled={!mediaLoaded || !isVideo}
                  title={
                    mediaLoaded && !isVideo
                      ? "FFglitch datamoshes between video frames — use Animate as Video first"
                      : undefined
                  }
                  className={`w-full flex items-center gap-2 px-3 py-1.5 font-label-md text-label-md text-on-surface hover:bg-accent-teal/10 transition-colors ${mediaLoaded && isVideo ? "toolbar-enabled" : "toolbar-disabled"}`}
                  role="menuitem"
                  aria-disabled={!mediaLoaded || !isVideo}
                >
                  <span className="material-symbols-outlined menu-item-icon">bug_report</span>
                  Export FFglitch
                </button>
                <button
                  onClick={() => { handleSaveImage(); setFileMenuOpen(false); }}
                  disabled={!mediaLoaded || stackCount === 0}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 font-label-md text-label-md text-on-surface hover:bg-accent-teal/10 transition-colors ${mediaLoaded && stackCount > 0 ? "toolbar-enabled" : "toolbar-disabled"}`}
                  role="menuitem"
                  aria-disabled={!mediaLoaded || stackCount === 0}
                >
                  <span className="material-symbols-outlined menu-item-icon">image</span>
                  Save Image
                </button>
                <div className="border-t border-outline/10 my-1" />
                <button
                  onClick={() => { setShowUpdateChecker(true); setFileMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 font-label-md text-label-md text-on-surface hover:bg-accent-teal/10 transition-colors"
                  role="menuitem"
                >
                  <span className="material-symbols-outlined menu-item-icon" aria-hidden="true">system_update</span>
                  Check for Updates
                </button>
              </div>
            )}
          </div>
          <div ref={editMenuRef} className="relative">
            <button
              onClick={() => setEditMenuOpen((v) => !v)}
              className="font-label-md text-label-md text-on-surface-variant font-medium hover:text-accent-teal transition-colors flex items-center gap-1"
            >
              Edit
              <span
                className={`material-symbols-outlined menu-chevron ${editMenuOpen ? "menu-chevron-open" : ""}`}
              >
                expand_more
              </span>
            </button>
            {editMenuOpen && (
              <div className="absolute left-0 top-full mt-1 z-[200] min-w-[200px] neo-flat rounded-lg bg-surface/90 backdrop-blur-xl border border-outline/20 py-1 shadow-xl">
                <button
                  onClick={() => { handleUndo(); setEditMenuOpen(false); }}
                  disabled={!canUndo}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 font-label-md text-label-md text-on-surface hover:bg-accent-teal/10 transition-colors ${canUndo ? "toolbar-enabled" : "toolbar-disabled"}`}
                >
                  <span className="material-symbols-outlined menu-item-icon">undo</span>
                  Undo
                </button>
                <button
                  onClick={() => { handleRedo(); setEditMenuOpen(false); }}
                  disabled={!canRedo}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 font-label-md text-label-md text-on-surface hover:bg-accent-teal/10 transition-colors ${canRedo ? "toolbar-enabled" : "toolbar-disabled"}`}
                >
                  <span className="material-symbols-outlined menu-item-icon">redo</span>
                  Redo
                </button>
                <button
                  onClick={() => { handleClearAll(); setEditMenuOpen(false); }}
                  disabled={stackCount === 0}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 font-label-md text-label-md text-on-surface hover:bg-accent-teal/10 transition-colors ${stackCount > 0 ? "toolbar-enabled" : "toolbar-disabled"}`}
                >
                  <span className="material-symbols-outlined menu-item-icon">delete_sweep</span>
                  Clear Stack
                </button>
                <div className="border-t border-outline/10 my-1" />
                <div className="px-3 py-1 font-label-sm text-label-sm text-on-surface-variant uppercase">
                  Panels
                </div>
                {PANEL_REGISTRY.map((p) => {
                  const isDocked = dockedIds.has(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        if (isDocked) {
                          triggerLayoutAction("remove", p.id);
                        } else {
                          triggerLayoutAction("add", p.id);
                        }
                      }}
                      className="w-full flex items-center justify-between px-3 py-1.5 font-label-md text-label-md text-on-surface hover:bg-accent-teal/10 transition-colors"
                    >
                      <span className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined panel-menu-icon">{p.icon}</span>
                        {p.label}
                      </span>
                      <span
                        className={`material-symbols-outlined ${isDocked ? "panel-checkbox-on" : "panel-checkbox-off"}`}
                      >
                        {isDocked ? "check_box" : "check_box_outline_blank"}
                      </span>
                    </button>
                  );
                })}
                <div className="border-t border-outline/10 mt-1 pt-1 flex gap-2 px-3">
                  <button
                    onClick={() => {
                      PANEL_REGISTRY.forEach((p) => {
                        if (!dockedIds.has(p.id)) {
                          useAppStore.getState().triggerLayoutAction("add", p.id);
                        }
                      });
                    }}
                    className="font-label-md text-label-md text-on-surface-variant hover:text-accent-teal transition-colors"
                  >
                    Show All
                  </button>
                  <button
                    onClick={() => {
                      PANEL_REGISTRY.forEach((p) => {
                        useAppStore.getState().triggerLayoutAction("remove", p.id);
                      });
                    }}
                    className="font-label-md text-label-md text-on-surface-variant hover:text-accent-pink transition-colors"
                  >
                    Hide All
                  </button>
                </div>
              </div>
            )}
          </div>
          <div ref={viewMenuRef} className="relative">
            <button
              onClick={() => setViewMenuOpen((v) => !v)}
              className={`font-label-md text-label-md font-medium hover:text-accent-teal transition-colors flex items-center gap-1 ${showBeforeAfter ? "text-accent-pink" : "text-on-surface-variant"}`}
            >
              View
              <span
                className={`material-symbols-outlined menu-chevron ${viewMenuOpen ? "menu-chevron-open" : ""}`}
              >
                expand_more
              </span>
            </button>
            {viewMenuOpen && (
              <div className="absolute left-0 top-full mt-1 z-[200] min-w-[220px] neo-flat rounded-lg bg-surface/90 backdrop-blur-xl border border-outline/20 py-2 shadow-xl">
                <button
                  onClick={() => { setShowBeforeAfter(!showBeforeAfter); setViewMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 font-label-md text-label-md text-on-surface hover:bg-accent-teal/10 transition-colors"
                >
                  <span className="material-symbols-outlined menu-item-icon">{showBeforeAfter ? "toggle_on" : "toggle_off"}</span>
                  Before/After Split
                </button>
                <div className="border-t border-outline/20 my-1" />
                <div className="px-3 py-1.5">
                  <LabeledSlider
                    layout="stacked"
                    icon="opacity"
                    label="Panel Opacity"
                    ariaLabel="Panel opacity"
                    title="Panel opacity"
                    value={panelOpacity}
                    displayValue={Math.round(panelOpacity * 100)}
                    min={0.2}
                    max={1}
                    step={0.05}
                    onChange={setPanelOpacity}
                    unit="%"
                  />
                </div>
                <div className="border-t border-outline/20 my-1" />
                <div className="px-3 py-1 font-label-sm text-label-sm uppercase text-on-surface-variant/70">
                  Theme Presets
                </div>
                {(["cosmic", "dark", "high-contrast", "light", "custom"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      if (t === "custom") {
                        useAppStore.getState().setCustomUiModalOpen(true);
                      } else {
                        setTheme(t);
                      }
                      setViewMenuOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-1.5 font-label-md text-label-md transition-colors ${theme === t ? "text-accent-teal font-bold bg-accent-teal/10" : "text-on-surface hover:bg-accent-teal/5"}`}
                  >
                    <span className="capitalize">{t === "custom" ? "Custom UI..." : t.replace("-", " ")}</span>
                    {theme === t && <span className="material-symbols-outlined text-xs">check</span>}
                  </button>
                ))}
                <div className="border-t border-outline/20 my-1" />

                <button
                  onClick={() => {
                    useAppStore.getState().triggerLayoutAction("reset");
                    setViewMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 font-label-md text-label-md text-on-surface hover:bg-accent-teal/10 transition-colors"
                >
                  <span className="material-symbols-outlined menu-item-icon">dashboard_customize</span>
                  Reset Standard Layout
                </button>
                <div className="border-t border-outline/20 my-1" />
                <div className="px-3 py-1 font-label-sm text-label-sm uppercase text-on-surface-variant/70">
                  Advanced
                </div>
                <button
                  onClick={() => { togglePanel("verify"); setViewMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 font-label-md text-label-md text-on-surface hover:bg-accent-teal/10 transition-colors"
                  title="Effect self-test suite for diagnosing a broken install"
                >
                  <span className="material-symbols-outlined menu-item-icon">
                    {verifyPanelVisible ? "toggle_on" : "toggle_off"}
                  </span>
                  Diagnostics Panel
                </button>
              </div>
            )}
          </div>
        </nav>
      </div>

      {/* Center: Transport controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleUndo}
          disabled={!canUndo}
          className={`material-symbols-outlined text-on-surface-variant hover:text-accent-teal transition-colors active:scale-95 duration-100 neo-btn p-1.5 rounded-full transport-icon ${canUndo ? "toolbar-enabled" : "toolbar-disabled"}`}
          title="Undo"
          aria-label="Undo"
        >
          undo
        </button>
        <button
          onClick={handleRedo}
          disabled={!canRedo}
          className={`material-symbols-outlined text-on-surface-variant hover:text-accent-teal transition-colors active:scale-95 duration-100 neo-btn p-1.5 rounded-full transport-icon ${canRedo ? "toolbar-enabled" : "toolbar-disabled"}`}
          title="Redo"
          aria-label="Redo"
        >
          redo
        </button>
        <button
          onClick={handleClearAll}
          disabled={stackCount === 0}
          className={`material-symbols-outlined text-on-surface-variant hover:text-accent-pink transition-colors active:scale-95 duration-100 neo-btn p-1.5 rounded-full transport-icon ${stackCount > 0 ? "toolbar-enabled" : "toolbar-disabled"}`}
          title="Clear Stack"
          aria-label="Clear effect stack"
        >
          delete_sweep
        </button>
        <div className="w-px h-5 bg-outline-variant/50 mx-1" />
        <button
          onClick={() => setZoom(zoom - 0.25)}
          className="material-symbols-outlined text-on-surface-variant hover:text-accent-teal transition-colors active:scale-95 duration-100 neo-btn p-1.5 rounded-full transport-icon"
          title="Zoom Out"
          aria-label="Zoom out"
        >
          zoom_out
        </button>
        <span
          className="text-code-sm font-code-sm text-on-surface-variant tabular-nums zoom-display"
        >
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom(zoom + 0.25)}
          className="material-symbols-outlined text-on-surface-variant hover:text-accent-teal transition-colors active:scale-95 duration-100 neo-btn p-1.5 rounded-full transport-icon"
          title="Zoom In"
          aria-label="Zoom in"
        >
          zoom_in
        </button>
      </div>

      {/* Right: Window controls */}
      <div className="flex items-center gap-4">
        <div className="w-px h-5 bg-outline-variant/50 mx-1" />
        <button
          onClick={() => setShowShortcuts(true)}
          className="font-label-md text-label-md text-primary hover:text-accent-teal transition-colors active:scale-95 duration-100"
          title="Keyboard shortcuts"
          aria-label="Open keyboard shortcuts"
        >
          <span className="material-symbols-outlined">keyboard</span>
        </button>
        <button
          onClick={toggleTheme}
          className="font-label-md text-label-md text-primary hover:text-accent-teal transition-colors active:scale-95 duration-100"
          title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        >
          <span className="material-symbols-outlined">{theme === "dark" ? "light_mode" : "dark_mode"}</span>
        </button>
        <WindowControls />
      </div>
      <AnimateAsVideoModal onConfirm={runAnimateAsVideo} />
      {showShortcuts && <KeyboardShortcutsEditor onClose={() => setShowShortcuts(false)} />}
      {showUpdateChecker && <UpdateChecker onClose={() => setShowUpdateChecker(false)} />}
    </header>
  );
}
