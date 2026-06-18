import { Eye, EyeOff, FolderOpen, Loader2, Play, Redo2, Save, Square, Trash2, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { applyEffectStack, exportVideo, getFrameData, loadMediaFile, sam3LoadImage, saveMedia } from "../lib/tauri";
import { useAppStore } from "../store";

interface Props {
  onFileLoaded: () => Promise<boolean>;
}

export default function Toolbar({ onFileLoaded }: Props) {
  const mediaLoaded = useAppStore((s) => s.mediaLoaded);
  const isProcessing = useAppStore((s) => s.isProcessing);
  const showBeforeAfter = useAppStore((s) => s.showBeforeAfter);
  const zoom = useAppStore((s) => s.zoom);
  const effectStack = useAppStore((s) => s.effectStack);
  const activeMask = useAppStore((s) => s.activeMask);
  const setShowBeforeAfter = useAppStore((s) => s.setShowBeforeAfter);
  const setZoom = useAppStore((s) => s.setZoom);
  const setIsProcessing = useAppStore((s) => s.setIsProcessing);
  const setPreviewDataUrl = useAppStore((s) => s.setPreviewDataUrl);
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);
  const setFilePath = useAppStore((s) => s.setFilePath);
  const clearStack = useAppStore((s) => s.clearStack);
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);
  const canUndo = useAppStore((s) => s.canUndo());
  const canRedo = useAppStore((s) => s.canRedo());
  const currentTime = useAppStore((s) => s.currentTime);
  const setCurrentTime = useAppStore((s) => s.setCurrentTime);
  const [isLooping, setIsLooping] = useState(false);
  const [fps, setFps] = useState(12);
  const processRef = useRef(false);

  const handleProcess = useCallback(async () => {
    const state = useAppStore.getState();
    if (!state.mediaLoaded) return;

    if (processRef.current) return;

    if (state.effectStack.length === 0) {
      try {
        const original = await getFrameData();
        setPreviewDataUrl(original);
        setStatusMessage("Showing original");
      } catch (err) {
        console.error("Failed to load original frame:", err);
      }
      return;
    }

    // WebGL preview renders effects in real-time; skip slow Rust CPU roundtrip
    // unless before/after mode is active (needs CPU-processed "after" image).
    if (!state.showBeforeAfter) {
      setStatusMessage("WebGL preview active");
      return;
    }

    processRef.current = true;
    setIsProcessing(true);
    setStatusMessage("Processing effect stack...");
    try {
      const activeStack = state.effectStack
        .filter((e) => e.enabled)
        .map((e) => ({ effect_id: e.effectId, params: { ...e.params, time: state.currentTime } }));
      const result = await applyEffectStack(activeStack, state.activeMask);
      setPreviewDataUrl(result);
      setStatusMessage("Processing complete");
    } catch (err) {
      setStatusMessage(`Error: ${err}`);
    } finally {
      setIsProcessing(false);
      processRef.current = false;
    }
  }, [setIsProcessing, setPreviewDataUrl, setStatusMessage]);

  const handleOpen = async () => {
    setStatusMessage("Opening file...");
    try {
      const path = await loadMediaFile();
      if (path) {
        setFilePath(path);
        const synced = await onFileLoaded();
        
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

    const isVideo = /\.(mp4|avi|mov|mkv|webm|m4v|flv|wmv|mpeg|mpg)$/i.test(path);

    if (isVideo) {
      setStatusMessage("Exporting video...");
      setIsProcessing(true);
      try {
        const activeStack = state.effectStack
          .filter((e) => e.enabled)
          .map((e) => ({ effect_id: e.effectId, params: { ...e.params, time: state.currentTime } }));
        const outPath = await exportVideo(path, activeStack, {
          maskB64: state.activeMask,
        });
        setStatusMessage(`Video exported: ${outPath}`);
      } catch (err) {
        setStatusMessage(`Export error: ${err}`);
      } finally {
        setIsProcessing(false);
      }
    } else {
      setStatusMessage("Exporting image...");
      await saveMedia();
      setStatusMessage("Image exported successfully");
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
    if (isLooping) return;
    const timer = setTimeout(() => {
      handleProcess();
    }, 200);
    return () => clearTimeout(timer);
  }, [effectStack, activeMask, handleProcess, mediaLoaded, isLooping]);

  useEffect(() => {
    let intervalId: number;
    if (isLooping && mediaLoaded && effectStack.length > 0) {
      intervalId = window.setInterval(() => {
        const s = useAppStore.getState();
        s.setCurrentTime((s.currentTime + 1) % 100);
        handleProcess();
      }, 1000 / fps);
    }
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isLooping, mediaLoaded, effectStack, activeMask, fps, handleProcess]);

  return (
    <div
      className="flex items-center justify-between px-3 h-10 flex-shrink-0"
      style={{
        borderBottom: "1px solid var(--border-primary)",
        background: "linear-gradient(180deg, #111 0%, #0e0e0e 100%)",
      }}
    >
      <div className="flex items-center gap-1">
        <button onClick={handleOpen} className="btn-icon" title="Open File">
          <FolderOpen size={15} />
        </button>
        <button
          onClick={handleExport}
          disabled={!mediaLoaded}
          className="btn-icon"
          title="Export"
          style={{ opacity: mediaLoaded ? 1 : 0.3 }}
        >
          <Save size={15} />
        </button>
        <div
          className="w-px h-5 mx-1"
          style={{ background: "var(--border-secondary)" }}
        />
        <button
          onClick={handleUndo}
          disabled={!canUndo}
          className="btn-icon"
          title="Undo"
          style={{ opacity: canUndo ? 1 : 0.3 }}
        >
          <Undo2 size={15} />
        </button>
        <button
          onClick={handleRedo}
          disabled={!canRedo}
          className="btn-icon"
          title="Redo"
          style={{ opacity: canRedo ? 1 : 0.3 }}
        >
          <Redo2 size={15} />
        </button>
        <button
          onClick={handleClearAll}
          disabled={effectStack.length === 0}
          className="btn-icon"
          title="Clear Stack"
          style={{ opacity: effectStack.length > 0 ? 1 : 0.3 }}
        >
          <Trash2 size={15} />
        </button>
      </div>

      <div
        className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2"
        style={{ pointerEvents: "none" }}
      >
        <span
          className="text-xs font-bold tracking-widest uppercase"
          style={{ color: "var(--text-muted)", fontFamily: "var(--font-display)" }}
        >
          MoshDither
        </span>
        <span
          className="text-xs font-medium"
          style={{ color: "var(--accent)", fontFamily: "var(--font-mono)" }}
        >
          Studio
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
          onClick={() => setZoom(zoom - 0.25)}
          className="btn-icon"
          title="Zoom Out"
        >
          <ZoomOut size={15} />
        </button>
        <span
          className="text-xs tabular-nums"
          style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", minWidth: 40, textAlign: "center" }}
        >
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom(zoom + 0.25)}
          className="btn-icon"
          title="Zoom In"
        >
          <ZoomIn size={15} />
        </button>
        <div
          className="w-px h-5 mx-1"
          style={{ background: "var(--border-secondary)" }}
        />
        <button
          onClick={() => setShowBeforeAfter(!showBeforeAfter)}
          className={`btn-icon ${showBeforeAfter ? "active" : ""}`}
          title="Before / After"
        >
          {showBeforeAfter ? <Eye size={15} /> : <EyeOff size={15} />}
        </button>
        <div
          className="w-px h-5 mx-1"
          style={{ background: "var(--border-secondary)" }}
        />
        <button
          onClick={() => setIsLooping(!isLooping)}
          className={`btn-icon ${isLooping ? "active" : ""}`}
          title={isLooping ? "Stop Animation Loop" : "Start Animation Loop"}
        >
          {isLooping ? <Square size={15} style={{ color: "var(--accent)" }} /> : <Play size={15} />}
        </button>
        <div
          className="w-px h-5 mx-1"
          style={{ background: "var(--border-secondary)" }}
        />
        <div className="flex items-center gap-1.5 ml-1 mr-1">
          <span className="text-[10px] uppercase text-[var(--text-muted)] font-mono">TIME</span>
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
            className="slider-track w-20"
            style={{
              background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${currentTime}%, var(--bg-input) ${currentTime}%, var(--bg-input) 100%)`
            }}
            title={`Frame ${currentTime}`}
          />
        </div>
        <div
          className="w-px h-5 mx-1"
          style={{ background: "var(--border-secondary)" }}
        />
        <div className="flex items-center gap-1.5 ml-1 mr-1">
          <span className="text-[10px] uppercase text-[var(--text-muted)] font-mono">FPS</span>
          <input
            type="range"
            min="1"
            max="30"
            step="1"
            value={fps}
            onChange={(e) => setFps(parseInt(e.target.value))}
            className="slider-track w-16"
            style={{
              background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${((fps - 1) / 29) * 100}%, var(--bg-input) ${((fps - 1) / 29) * 100}%, var(--bg-input) 100%)`
            }}
            title={`${fps} FPS`}
          />
          <span className="text-[10px] font-mono w-4 text-right text-[var(--accent)]">{fps}</span>
        </div>
        <div
          className="w-px h-5 mx-1"
          style={{ background: "var(--border-secondary)" }}
        />
        <button
          onClick={handleProcess}
          disabled={!mediaLoaded || isProcessing || effectStack.length === 0}
          className="btn-primary flex items-center gap-1.5"
          style={{
            opacity: mediaLoaded && effectStack.length > 0 ? 1 : 0.4,
            pointerEvents: mediaLoaded && effectStack.length > 0 ? "auto" : "none",
          }}
        >
          {isProcessing ? (
            <Loader2 size={14} className="animate-spin" />
          ) : null}
          PROCESS
        </button>
      </div>
    </div>
  );
}
