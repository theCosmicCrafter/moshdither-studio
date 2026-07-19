import { useCallback, useEffect, useRef, useState } from "react";
import {
  applyEffectStack,
  applyFfglitch,
  getFrameData,
  getMediaMetadata,
  loadMediaFile,
  sam3LoadImage,
} from "../lib/tauri";
import { useAppStore } from "../store";
import { stackToRustPayload, stackRequiresCpuPreview } from "../utils/effectConverter";
import WindowControls from "./WindowControls";
import KeyboardShortcutsEditor from "./KeyboardShortcutsEditor";
import { PANEL_REGISTRY } from "./DockSystem/panelRegistry";

interface Props {
  onFileLoaded: () => Promise<boolean>;
}

export default function Toolbar({ onFileLoaded }: Props) {
  const mediaLoaded = useAppStore((s) => s.mediaLoaded);
  const showBeforeAfter = useAppStore((s) => s.showBeforeAfter);
  const zoom = useAppStore((s) => s.zoom);
  const stackCount = useAppStore((s) => s.effectStack.length);
  const processSignature = useAppStore((s) => {
    const stackSig = s.effectStack
      .map(
        (e) =>
          `${e.id}:${e.enabled}:${JSON.stringify(e.params)}:${e.maskId}:${e.maskMode}`
      )
      .join("|");
    return `${stackSig}|${s.maskRevision}`;
  });
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
  const currentTime = useAppStore((s) => s.currentTime);
  const setCurrentTime = useAppStore((s) => s.setCurrentTime);
  const playbackSpeed = useAppStore((s) => s.playbackSpeed);
  const setPlaybackSpeed = useAppStore((s) => s.setPlaybackSpeed);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const togglePlay = useAppStore((s) => s.togglePlay);
  const [fps, setFps] = useState(12);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [editMenuOpen, setEditMenuOpen] = useState(false);
  const editMenuRef = useRef<HTMLDivElement>(null);
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const viewMenuRef = useRef<HTMLDivElement>(null);
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const fileMenuRef = useRef<HTMLDivElement>(null);
  const dockLayout = useAppStore((s) => s.dockLayout);
  const addPanelToDock = useAppStore((s) => s.addPanelToDock);
  const removePanelFromDock = useAppStore((s) => s.removePanelFromDock);

  const dockedIds = new Set<string>();
  for (const z of ["left", "right", "bottom"] as const) {
    for (const g of dockLayout[z]) {
      for (const p of g.panels) dockedIds.add(p);
    }
  }

  useEffect(() => {
    if (!fileMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (fileMenuRef.current && !fileMenuRef.current.contains(e.target as Node)) {
        setFileMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [fileMenuOpen]);
  useEffect(() => {
    if (!editMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (editMenuRef.current && !editMenuRef.current.contains(e.target as Node)) {
        setEditMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [editMenuOpen]);
  useEffect(() => {
    if (!viewMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (viewMenuRef.current && !viewMenuRef.current.contains(e.target as Node)) {
        setViewMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [viewMenuOpen]);
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
            console.warn("Failed to load new image into SAM3", e);
          }
        }

        setStatusMessage(synced ? `Loaded: ${path}` : `Loaded: ${path} (preview sync pending)`);
      } else {
        setStatusMessage("Open cancelled");
      }
    } catch (err) {
      console.error("[Toolbar] handleOpen failed:", err);
      setStatusMessage(`Open error: ${err}`);
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

  const handleFfglitchExport = async () => {
    if (!mediaLoaded) return;
    const state = useAppStore.getState();
    const path = state.filePath;
    if (!path) return;
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
    >
      {/* Left: Logo + Nav */}
      <div className="flex items-center gap-6">
        <span
          className="font-headline-lg text-headline-lg solar-text tracking-wider filigree-header ml-6 cursor-default toolbar-logo"
        >
          MoshDither Studio
        </span>
        <nav className="hidden md:flex gap-4 ml-6">
          <div ref={fileMenuRef} className="relative">
            <button
              onClick={() => setFileMenuOpen((v) => !v)}
              className="font-label-md text-label-md text-accent-pink font-bold border-b-2 border-accent-pink pb-1 hover:text-accent-teal transition-colors flex items-center gap-1"
            >
              File
              <span
                className={`material-symbols-outlined menu-chevron ${fileMenuOpen ? "menu-chevron-open" : ""}`}
              >
                expand_more
              </span>
            </button>
            {fileMenuOpen && (
              <div className="absolute left-0 top-full mt-1 z-[200] min-w-[220px] neo-flat rounded-lg bg-surface/90 backdrop-blur-xl border border-outline/20 py-1 shadow-xl">
                <button
                  onClick={() => { handleOpen(); setFileMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-on-surface hover:bg-accent-teal/10 transition-colors"
                >
                  <span className="material-symbols-outlined menu-item-icon">folder_open</span>
                  Open File
                </button>
                <div className="border-t border-outline/10 my-1" />
                <button
                  onClick={() => { handleExport(); setFileMenuOpen(false); }}
                  disabled={!mediaLoaded}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-on-surface hover:bg-accent-teal/10 transition-colors ${mediaLoaded ? "toolbar-enabled" : "toolbar-disabled"}`}
                >
                  <span className="material-symbols-outlined menu-item-icon">movie_export</span>
                  Export Video
                </button>
                <button
                  onClick={() => { handleFfglitchExport(); setFileMenuOpen(false); }}
                  disabled={!mediaLoaded}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-on-surface hover:bg-accent-teal/10 transition-colors ${mediaLoaded ? "toolbar-enabled" : "toolbar-disabled"}`}
                >
                  <span className="material-symbols-outlined menu-item-icon">bug_report</span>
                  Export FFglitch
                </button>
                <button
                  onClick={() => { handleProcess(); setFileMenuOpen(false); }}
                  disabled={!mediaLoaded || stackCount === 0}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-on-surface hover:bg-accent-teal/10 transition-colors ${mediaLoaded && stackCount > 0 ? "toolbar-enabled" : "toolbar-disabled"}`}
                >
                  <span className="material-symbols-outlined menu-item-icon">image</span>
                  Save Image
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
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-on-surface hover:bg-accent-teal/10 transition-colors ${canUndo ? "toolbar-enabled" : "toolbar-disabled"}`}
                >
                  <span className="material-symbols-outlined menu-item-icon">undo</span>
                  Undo
                </button>
                <button
                  onClick={() => { handleRedo(); setEditMenuOpen(false); }}
                  disabled={!canRedo}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-on-surface hover:bg-accent-teal/10 transition-colors ${canRedo ? "toolbar-enabled" : "toolbar-disabled"}`}
                >
                  <span className="material-symbols-outlined menu-item-icon">redo</span>
                  Redo
                </button>
                <button
                  onClick={() => { handleClearAll(); setEditMenuOpen(false); }}
                  disabled={stackCount === 0}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-on-surface hover:bg-accent-teal/10 transition-colors ${stackCount > 0 ? "toolbar-enabled" : "toolbar-disabled"}`}
                >
                  <span className="material-symbols-outlined menu-item-icon">delete_sweep</span>
                  Clear Stack
                </button>
                <div className="border-t border-outline/10 my-1" />
                <div className="px-3 py-1 text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider">
                  Panels
                </div>
                {PANEL_REGISTRY.map((p) => {
                  const isDocked = dockedIds.has(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        if (isDocked) {
                          removePanelFromDock(p.id);
                        } else {
                          addPanelToDock(p.id, p.defaultZone);
                        }
                      }}
                      className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] text-on-surface hover:bg-accent-teal/10 transition-colors"
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
                          useAppStore.getState().addPanelToDock(p.id, p.defaultZone);
                        }
                      });
                    }}
                    className="text-[10px] text-on-surface-variant hover:text-accent-teal transition-colors"
                  >
                    Show All
                  </button>
                  <button
                    onClick={() => {
                      PANEL_REGISTRY.forEach((p) => {
                        useAppStore.getState().removePanelFromDock(p.id);
                      });
                    }}
                    className="text-[10px] text-on-surface-variant hover:text-accent-pink transition-colors"
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
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-on-surface hover:bg-accent-teal/10 transition-colors"
                >
                  <span className="material-symbols-outlined menu-item-icon">{showBeforeAfter ? "toggle_on" : "toggle_off"}</span>
                  Before/After Split
                </button>
                <div className="border-t border-outline/20 my-1" />
                <div className="px-3 py-1.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-on-surface-variant flex items-center gap-1.5">
                      <span className="material-symbols-outlined panel-menu-icon">opacity</span>
                      Panel Opacity
                    </span>
                    <span className="text-[10px] font-mono text-on-surface-variant">{Math.round(panelOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.2}
                    max={1}
                    step={0.05}
                    value={panelOpacity}
                    onChange={(e) => setPanelOpacity(parseFloat(e.target.value))}
                    className="w-full accent-[var(--accent-teal)]"
                    title="Panel opacity"
                    aria-label="Panel opacity"
                  />
                </div>
                <div className="border-t border-outline/20 my-1" />
                <button
                  onClick={() => { toggleTheme(); setViewMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-on-surface hover:bg-accent-teal/10 transition-colors"
                >
                  <span className="material-symbols-outlined menu-item-icon">{theme === "dark" ? "light_mode" : "dark_mode"}</span>
                  {theme === "dark" ? "Light Theme" : "Dark Theme"}
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
        >
          undo
        </button>
        <button
          onClick={handleRedo}
          disabled={!canRedo}
          className={`material-symbols-outlined text-on-surface-variant hover:text-accent-teal transition-colors active:scale-95 duration-100 neo-btn p-1.5 rounded-full transport-icon ${canRedo ? "toolbar-enabled" : "toolbar-disabled"}`}
          title="Redo"
        >
          redo
        </button>
        <button
          onClick={handleClearAll}
          disabled={stackCount === 0}
          className={`material-symbols-outlined text-on-surface-variant hover:text-accent-pink transition-colors active:scale-95 duration-100 neo-btn p-1.5 rounded-full transport-icon ${stackCount > 0 ? "toolbar-enabled" : "toolbar-disabled"}`}
          title="Clear Stack"
        >
          delete_sweep
        </button>
        <div className="w-px h-5 bg-outline-variant/50 mx-1" />
        <button
          onClick={() => setZoom(zoom - 0.25)}
          className="material-symbols-outlined text-on-surface-variant hover:text-accent-teal transition-colors active:scale-95 duration-100 neo-btn p-1.5 rounded-full transport-icon"
          title="Zoom Out"
        >
          zoom_out
        </button>
        <span
          className="text-label-sm font-label-sm text-on-surface-variant tabular-nums zoom-display"
        >
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom(zoom + 0.25)}
          className="material-symbols-outlined text-on-surface-variant hover:text-accent-teal transition-colors active:scale-95 duration-100 neo-btn p-1.5 rounded-full transport-icon"
          title="Zoom In"
        >
          zoom_in
        </button>
        <div className="w-px h-5 bg-outline-variant/50 mx-1" />
        <button
          onClick={() => togglePlay()}
          className={`material-symbols-outlined transition-colors active:scale-95 duration-100 neo-btn p-1.5 rounded-full transport-icon ${isPlaying ? "text-accent-pink neo-pressed" : "text-on-surface-variant hover:text-accent-teal"}`}
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? "pause" : "play_arrow"}
        </button>
        <div className="flex items-center gap-1.5">
          <span className="text-label-sm font-label-sm text-on-surface-variant uppercase">
            TIME
          </span>
          <input
            type="range"
            min="0"
            max="99"
            step="1"
            value={currentTime}
            onChange={(e) => {
              setCurrentTime(parseInt(e.target.value));
              handleProcess();
            }}
            className="slider-thumb w-20"
            title={`Frame ${currentTime}`}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-label-sm font-label-sm text-on-surface-variant uppercase">FPS</span>
          <input
            type="range"
            min="1"
            max="30"
            step="1"
            value={fps}
            onChange={(e) => setFps(parseInt(e.target.value))}
            className="slider-thumb w-16"
            title={`${fps} FPS`}
          />
          <span className="text-label-sm font-label-sm text-accent-pink w-4 text-right">{fps}</span>
        </div>
        <select
          value={playbackSpeed}
          onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
          className="themed-select text-label-sm font-label-sm cursor-pointer"
          title="Playback speed"
        >
          <option value={0.25}>0.25x</option>
          <option value={0.5}>0.5x</option>
          <option value={1}>1x</option>
          <option value={2}>2x</option>
          <option value={4}>4x</option>
        </select>
      </div>

      {/* Right: Window controls */}
      <div className="flex items-center gap-4">
        <div className="w-px h-5 bg-outline-variant/50 mx-1" />
        <button
          onClick={() => setShowShortcuts(true)}
          className="font-label-md text-label-md text-primary hover:text-accent-teal transition-colors active:scale-95 duration-100"
          title="Keyboard shortcuts"
        >
          <span className="material-symbols-outlined">keyboard</span>
        </button>
        <button
          onClick={toggleTheme}
          className="font-label-md text-label-md text-primary hover:text-accent-teal transition-colors active:scale-95 duration-100"
          title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        >
          <span className="material-symbols-outlined">{theme === "dark" ? "light_mode" : "dark_mode"}</span>
        </button>
        <WindowControls />
      </div>
      {showShortcuts && <KeyboardShortcutsEditor onClose={() => setShowShortcuts(false)} />}
    </header>
  );
}
