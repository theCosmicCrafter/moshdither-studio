import { useState, useEffect, memo, useCallback } from "react";
import {
    getFrameData,
    sam3AutoMask,
    sam3Clear,
    sam3Init,
    sam3LoadImage,
    sam3PointPrompt,
    sam3PostprocessMask,
    sam3TextPrompt,
} from "../lib/tauri";
import { useAppStore } from "../store";
import MaskSelector from "./MaskSelector";
import PostProcessControls from "./PostProcessControls";
import ManualMaskEditor from "./ManualMaskEditor";
import FrameTimeline from "./FrameTimeline";

export default function MaskPanel() {
  const mediaLoaded = useAppStore((s) => s.mediaLoaded);
  const activeMask = useAppStore((s) => s.activeMask);
  const maskVisible = useAppStore((s) => s.maskVisible);
  const maskTab = useAppStore((s) => s.maskTab);
  const sam3Ready = useAppStore((s) => s.sam3Ready);
  const sam3Mode = useAppStore((s) => s.sam3Mode);
  const sam3Points = useAppStore((s) => s.sam3Points);
  const sam3OverlayOpacity = useAppStore((s) => s.sam3OverlayOpacity);
  const sam3OverlayColor = useAppStore((s) => s.sam3OverlayColor);
  const sam3Masks = useAppStore((s) => s.sam3Masks);
  const sam3MaskScores = useAppStore((s) => s.sam3MaskScores);
  const sam3MaskIndex = useAppStore((s) => s.sam3MaskIndex);
  const setMaskVisible = useAppStore((s) => s.setMaskVisible);
  const setMaskTab = useAppStore((s) => s.setMaskTab);
  const setSam3Mode = useAppStore((s) => s.setSam3Mode);
  const setSam3Masks = useAppStore((s) => s.setSam3Masks);
  const setSam3MaskIndex = useAppStore((s) => s.setSam3MaskIndex);
  const removeSam3Point = useAppStore((s) => s.removeSam3Point);
  const clearSam3Points = useAppStore((s) => s.clearSam3Points);
  const setSam3OverlayOpacity = useAppStore((s) => s.setSam3OverlayOpacity);
  const setSam3OverlayColor = useAppStore((s) => s.setSam3OverlayColor);
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);

  const [isLoading, setIsLoading] = useState(false);
  const setSam3Ready = useAppStore((s) => s.setSam3Ready);
  const setSam3ImageLoaded = useAppStore((s) => s.setSam3ImageLoaded);

  // Ensure SAM3 is running before executing a command. Restarts if idle-shutdown occurred.
  const ensureSam3Ready = useCallback(async (): Promise<boolean> => {
    if (useAppStore.getState().sam3Ready) return true;
    setIsLoading(true);
    setStatusMessage("Starting SAM3 engine...");
    try {
      await sam3Init();
      setSam3Ready(true);
      // Image auto-load is handled by the useEffect below when sam3Ready flips.
      setStatusMessage("SAM3 ready");
      return true;
    } catch (e) {
      setStatusMessage(`SAM3 start failed: ${e}`);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [setSam3Ready, setStatusMessage]);

  // Post-processing params
  const [ppGrow, setPpGrow] = useState(0);
  const [ppShrink, setPpShrink] = useState(0);
  const [ppFeather, setPpFeather] = useState(0);
  const [ppFillHoles, setPpFillHoles] = useState(false);
  const [showPostProcess, setShowPostProcess] = useState(false);

  // Auto-load current frame into SAM3 when engine becomes ready (if media is already loaded)
  useEffect(() => {
    if (sam3Ready && mediaLoaded) {
      setIsLoading(true);
      setStatusMessage("Loading image into SAM3...");
      getFrameData()
        .then((b64) => sam3LoadImage(b64))
        .then(() => {
          setSam3ImageLoaded(true);
          setStatusMessage("SAM3 ready — image loaded");
        })
        .catch((e) => {
          // Without this, a failed load left inference_state (Python side)
          // and the UI's interactivity gate both silently believing the
          // previous image was still current, so point/box prompts could
          // still be dispatched against a load that never actually
          // succeeded. See isSam3Interactive in PreviewViewport.tsx.
          setSam3ImageLoaded(false);
          setStatusMessage(`SAM3 auto-load failed: ${e}`);
        })
        .finally(() => setIsLoading(false));
    }
  }, [sam3Ready, mediaLoaded, setStatusMessage, setSam3ImageLoaded]);

  const handleLoadImage = async () => {
    const ready = await ensureSam3Ready();
    if (!ready) return;
    setIsLoading(true);
    setStatusMessage("Loading image into SAM3...");
    try {
      const b64 = await getFrameData();
      await sam3LoadImage(b64);
      setStatusMessage("Image loaded into SAM3");
      // The auto-load effect above sets this on its own load path; this is
      // the manual "Load Image" button's path and needs the same signal, or
      // isSam3Interactive (PreviewViewport.tsx) stays gated off even after a
      // successful manual load, silently blocking point/box clicks.
      setSam3ImageLoaded(true);
    } catch (e) {
      setStatusMessage(`SAM3 load failed: ${e}`);
      setSam3ImageLoaded(false);
    }
    setIsLoading(false);
  };

  const handleTextPrompt = async (promptText: string) => {
    if (!promptText) return;
    const ready = await ensureSam3Ready();
    if (!ready) return;
    setIsLoading(true);
    setStatusMessage(`Running SAM3 text prompt: "${promptText}"...`);
    try {
      const result = await sam3TextPrompt(promptText);
      if (result.count > 0) {
        setSam3Masks(result.masks, result.scores);
        setStatusMessage(`Found ${result.count} mask candidate(s)`);
      } else {
        setSam3Masks([], []);
        setStatusMessage("No masks found for prompt");
      }
    } catch (e) {
      setStatusMessage(`SAM3 prompt failed: ${e}`);
    }
    setIsLoading(false);
  };

  const handleClear = async () => {
    setSam3Masks([], []);
    clearSam3Points();
    try {
      await sam3Clear();
    } catch { /* ignore */ }
  };

  const handleRemovePoint = async (idx: number) => {
    removeSam3Point(idx);
    const remaining = useAppStore.getState().sam3Points;
    if (remaining.length > 0) {
      setStatusMessage(`Removed point ${idx + 1}. Re-segmenting with ${remaining.length} point(s)...`);
      try {
        const coords = remaining.map((p) => [p.x, p.y] as [number, number]);
        const labels = remaining.map((p) => p.label);
        const result = await sam3PointPrompt(coords, labels);
        if (result.count > 0) {
          setSam3Masks(result.masks, result.scores);
          setStatusMessage(`Tree updated — ${remaining.length} point(s), ${result.count} candidate(s)`);
        } else {
          setSam3Masks([], []);
          setStatusMessage("SAM3: no mask from remaining points");
        }
      } catch (err) {
        setStatusMessage(`Re-segment failed: ${err}`);
      }
    } else {
      setSam3Masks([], []);
      setStatusMessage("All points cleared");
    }
  };

  const handleAutoMask = async () => {
    const ready = await ensureSam3Ready();
    if (!ready) return;
    setIsLoading(true);
    setStatusMessage("Running SAM3 auto-mask grid...");
    try {
      const result = await sam3AutoMask(16, 0.7, 100);
      if (result.count > 0) {
        setSam3Masks(result.masks, result.scores);
        setStatusMessage(`Auto-mask found ${result.count} region(s)`);
      } else {
        setSam3Masks([], []);
        setStatusMessage("Auto-mask: no regions found");
      }
    } catch (e) {
      setStatusMessage(`Auto-mask failed: ${e}`);
    }
    setIsLoading(false);
  };

  const handlePostprocess = async () => {
    const currentMask = useAppStore.getState().activeMask;
    if (!currentMask || !sam3Ready) return;
    setIsLoading(true);
    setStatusMessage("Post-processing mask...");
    try {
      const processed = await sam3PostprocessMask(
        currentMask,
        ppGrow,
        ppShrink,
        ppFeather,
        ppFillHoles
      );
      // Replace the currently active mask in the multi-mask array
      const idx = useAppStore.getState().sam3MaskIndex;
      const masks = [...useAppStore.getState().sam3Masks];
      const scores = [...useAppStore.getState().sam3MaskScores];
      if (idx >= 0 && idx < masks.length) {
        masks[idx] = processed;
        // Update the mask array, keep the current index, and set activeMask to the processed result
        useAppStore.setState({
          sam3Masks: masks,
          sam3MaskScores: scores,
          sam3MaskIndex: idx,
          activeMask: processed,
        });
      } else {
        // No multi-mask array — just update activeMask directly
        useAppStore.setState({ activeMask: processed });
      }
      setStatusMessage("Mask post-processed");
    } catch (e) {
      setStatusMessage(`Post-process failed: ${e}`);
    }
    setIsLoading(false);
  };

  if (!mediaLoaded) {
    return (
      <div className="p-4 text-sm text-[var(--text-muted)]">
        Load media to use SAM3 segmentation.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {activeMask && (
        <div className="flex justify-end">
          <button
            onClick={() => setMaskVisible(!maskVisible)}
            className="text-[10px] uppercase tracking-wider px-2 py-1 rounded bg-surface-container hover:bg-surface-container-high transition-colors"
          >
            {maskVisible ? "Hide" : "Show"}
          </button>
        </div>
      )}

      {/* Tab switcher */}
      <div className="flex gap-1">
        <button
          onClick={() => setMaskTab("sam3")}
          className={`flex-1 py-1 px-2 text-[10px] uppercase tracking-wider rounded transition-colors ${
            maskTab === "sam3"
              ? "bg-accent text-black font-semibold"
              : "bg-surface-container text-on-surface-variant hover:text-on-surface"
          }`}
        >
          SAM3
        </button>
        <button
          onClick={() => setMaskTab("manual")}
          className={`flex-1 py-1 px-2 text-[10px] uppercase tracking-wider rounded transition-colors ${
            maskTab === "manual"
              ? "bg-accent text-black font-semibold"
              : "bg-surface-container text-on-surface-variant hover:text-on-surface"
          }`}
        >
          Manual
        </button>
      </div>

      {maskTab === "manual" ? (
        <ManualMaskEditor />
      ) : !sam3Ready ? (
        <div className="flex flex-col gap-2 py-2">
          <div className="flex items-center justify-center gap-2 text-xs text-[var(--text-muted)]">
            <span className="inline-block w-2 h-2 rounded-full bg-[var(--accent)]" aria-hidden="true" />
            SAM3 idle — enter a prompt to restart
          </div>
          {/* Mode selector */}
          <div className="flex gap-2">
            <select
              value={sam3Mode}
              onChange={(e) => setSam3Mode(e.target.value as "text" | "point" | "box" | "auto")}
              className="themed-select px-2 py-1.5 text-xs"
            >
              <option value="text">Text</option>
              <option value="point">Point</option>
              <option value="box">Box</option>
              <option value="auto">Auto</option>
            </select>
            {sam3Mode === "text" ? (
              <TextPromptInput onSubmit={handleTextPrompt} isLoading={isLoading} />
            ) : sam3Mode === "point" ? (
              <span className="flex-1 text-[11px] text-[var(--text-muted)] flex items-center">
                Click image to add points
              </span>
            ) : sam3Mode === "box" ? (
              <span className="flex-1 text-[11px] text-[var(--text-muted)] flex items-center">
                Drag on image to draw box
              </span>
            ) : (
              <button
                onClick={handleAutoMask}
                disabled={isLoading}
                className="flex-1 px-3 py-1.5 rounded bg-[var(--accent)] text-black font-semibold text-xs uppercase tracking-wider hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-1"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>auto_awesome</span>
                {isLoading ? "Starting..." : "Start SAM3 & Auto Mask"}
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <button
            onClick={handleLoadImage}
            disabled={isLoading}
            className="w-full py-1.5 px-3 rounded bg-surface-container text-on-surface text-xs uppercase tracking-wider hover:bg-surface-container-high transition-colors disabled:opacity-50"
          >
            Load Current Image
          </button>

          {/* Mode selector */}
          <div className="flex gap-2">
            <select
              value={sam3Mode}
              onChange={(e) => setSam3Mode(e.target.value as "text" | "point" | "box" | "auto")}
              className="themed-select px-2 py-1.5 text-xs"
            >
              <option value="text">Text</option>
              <option value="point">Point</option>
              <option value="box">Box</option>
              <option value="auto">Auto</option>
            </select>

            {sam3Mode === "text" ? (
              <TextPromptInput onSubmit={handleTextPrompt} isLoading={isLoading} />
            ) : sam3Mode === "point" ? (
              <span className="flex-1 text-[11px] text-[var(--text-muted)] flex items-center">
                Click image to add points
              </span>
            ) : sam3Mode === "box" ? (
              <span className="flex-1 text-[11px] text-[var(--text-muted)] flex items-center">
                Drag on image to draw box
              </span>
            ) : (
              <button
                onClick={handleAutoMask}
                disabled={isLoading}
                className="flex-1 px-3 py-1.5 rounded bg-[var(--accent)] text-black font-semibold text-xs uppercase tracking-wider hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-1"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>auto_awesome</span>
                {isLoading ? "Running..." : "Auto Mask"}
              </button>
            )}
          </div>

          {/* Point tree list */}
          {sam3Mode === "point" && sam3Points.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                Point Tree ({sam3Points.length})
              </div>
              <div className="flex flex-col gap-1 max-h-24 overflow-y-auto">
                {sam3Points.map((p, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between px-2 py-1 rounded bg-surface-container-low text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ background: p.label === 1 ? "var(--success, #22c55e)" : "var(--danger, #ef4444)" }}
                      />
                      <span className="text-[var(--text-primary)]">
                        ({p.x}, {p.y})
                      </span>
                      <span
                        className="text-[10px] px-1 rounded"
                        style={{
                          background: p.label === 1 ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                          color: p.label === 1 ? "var(--success, #22c55e)" : "var(--danger, #ef4444)",
                        }}
                      >
                        {p.label === 1 ? "include" : "exclude"}
                      </span>
                    </div>
                    <button
                      onClick={() => handleRemovePoint(idx)}
                      className="text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                      title="Remove point"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Overlay controls */}
          {(activeMask || sam3Points.length > 0) && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] min-w-[50px]">
                  Opacity
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={sam3OverlayOpacity}
                  onChange={(e) => setSam3OverlayOpacity(Number.parseFloat(e.target.value))}
                  className="flex-1 h-1 bg-surface-container rounded-lg appearance-none cursor-pointer"
                />
                <span className="text-[10px] text-[var(--text-muted)] w-8 text-right">
                  {Math.round(sam3OverlayOpacity * 100)}%
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] min-w-[50px]">
                  Tint
                </span>
                <input
                  type="color"
                  value={sam3OverlayColor}
                  onChange={(e) => setSam3OverlayColor(e.target.value)}
                  className="w-6 h-6 rounded border-0 p-0 bg-transparent cursor-pointer"
                />
                <span className="text-[10px] text-[var(--text-muted)]">{sam3OverlayColor}</span>
              </div>
            </div>
          )}

          {/* Multi-mask selector */}
          {sam3Masks.length > 1 && (
            <MaskSelector
              masks={sam3Masks}
              scores={sam3MaskScores}
              selectedIndex={sam3MaskIndex}
              onSelect={setSam3MaskIndex}
            />
          )}

          {/* Edge-Aware Post-Processing Controls */}
          {activeMask && (
            <PostProcessControls
              ppGrow={ppGrow}
              setPpGrow={setPpGrow}
              ppShrink={ppShrink}
              setPpShrink={setPpShrink}
              ppFeather={ppFeather}
              setPpFeather={setPpFeather}
              ppFillHoles={ppFillHoles}
              setPpFillHoles={setPpFillHoles}
              isLoading={isLoading}
              handlePostprocess={handlePostprocess}
              showPostProcess={showPostProcess}
              setShowPostProcess={setShowPostProcess}
            />
          )}

          {/* Frame Timeline for Video */}
          <FrameTimeline />

          {activeMask && (
            <button
              onClick={handleClear}
              className="w-full py-1.5 px-3 rounded border border-border-secondary text-on-surface-variant text-xs uppercase tracking-wider hover:text-on-surface transition-colors"
            >
              Clear Mask
            </button>
          )}
        </>
      )}
    </div>
  );
}

const TextPromptInput = memo(function TextPromptInput({
  onSubmit,
  isLoading,
}: {
  onSubmit: (prompt: string) => void;
  isLoading: boolean;
}) {
  const [prompt, setPrompt] = useState("");

  const handleSubmit = useCallback(() => {
    if (prompt.trim()) onSubmit(prompt.trim());
  }, [prompt, onSubmit]);

  return (
    <>
      <input
        type="text"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        placeholder="e.g. sky, person, car..."
        className="flex-1 min-w-0 bg-surface-container-low border border-border-secondary rounded px-2 py-1.5 text-xs text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:border-accent"
      />
      <button
        onClick={handleSubmit}
        disabled={isLoading || !prompt.trim()}
        className="px-3 py-1.5 rounded bg-[var(--accent)] text-black font-semibold text-xs uppercase tracking-wider hover:brightness-110 transition-all disabled:opacity-50"
      >
        {isLoading ? "..." : "Go"}
      </button>
    </>
  );
});
