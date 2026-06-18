import { Layers, Sparkles } from "lucide-react";
import { useState } from "react";
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
import ManualMaskEditor from "./ManualMaskEditor";

export default function MaskPanel() {
  const {
    mediaLoaded,
    activeMask,
    maskVisible,
    sam3Ready,
    sam3Mode,
    sam3Points,
    sam3OverlayOpacity,
    sam3OverlayColor,
    sam3Masks,
    sam3MaskScores,
    sam3MaskIndex,
    setMaskVisible,
    setSam3Ready,
    setSam3Mode,
    setSam3Masks,
    setSam3MaskIndex,
    removeSam3Point,
    clearSam3Points,
    setSam3OverlayOpacity,
    setSam3OverlayColor,
    setStatusMessage,
  } = useAppStore();

  const [prompt, setPrompt] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [maskTab, setMaskTab] = useState<"sam3" | "manual">("sam3");

  // Post-processing params
  const [ppGrow, setPpGrow] = useState(0);
  const [ppShrink, setPpShrink] = useState(0);
  const [ppFeather, setPpFeather] = useState(0);
  const [ppFillHoles, setPpFillHoles] = useState(false);
  const [showPostProcess, setShowPostProcess] = useState(false);

  const handleInit = async () => {
    setIsLoading(true);
    setStatusMessage("Starting SAM3 engine...");
    try {
      const msg = await sam3Init();
      setSam3Ready(true);
      setStatusMessage(msg);
      
      // Automatically load the image right after init
      setStatusMessage("Loading image into SAM3...");
      try {
        const b64 = await getFrameData();
        await sam3LoadImage(b64);
        setStatusMessage("SAM3 ready and image loaded!");
      } catch (e) {
        setStatusMessage(`SAM3 loaded, but image load failed: ${e}`);
      }
    } catch (e) {
      setStatusMessage(`SAM3 init failed: ${e}`);
    }
    setIsLoading(false);
  };

  const handleLoadImage = async () => {
    if (!sam3Ready) return;
    setIsLoading(true);
    setStatusMessage("Loading image into SAM3...");
    try {
      const b64 = await getFrameData();
      await sam3LoadImage(b64);
      setStatusMessage("Image loaded into SAM3");
    } catch (e) {
      setStatusMessage(`SAM3 load failed: ${e}`);
    }
    setIsLoading(false);
  };

  const handleTextPrompt = async () => {
    if (!prompt.trim() || !sam3Ready) return;
    setIsLoading(true);
    setStatusMessage(`Running SAM3 text prompt: "${prompt}"...`);
    try {
      const result = await sam3TextPrompt(prompt.trim());
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
    if (!sam3Ready) return;
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
        // Scores stay the same; this is a refinement
        setSam3Masks(masks, scores);
        setSam3MaskIndex(idx);
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
    <div className="flex flex-col gap-3 p-4 border-t border-[var(--panel-border)]">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--accent)]">Mask</h3>
        {activeMask && (
          <button
            onClick={() => setMaskVisible(!maskVisible)}
            className="text-[10px] uppercase tracking-wider px-2 py-1 rounded bg-[var(--surface-2)] hover:bg-[var(--surface-3)] transition-colors"
          >
            {maskVisible ? "Hide" : "Show"}
          </button>
        )}
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1">
        <button
          onClick={() => setMaskTab("sam3")}
          className={`flex-1 py-1 px-2 text-[10px] uppercase tracking-wider rounded transition-colors ${
            maskTab === "sam3"
              ? "bg-[var(--accent)] text-black font-semibold"
              : "bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          }`}
        >
          SAM3
        </button>
        <button
          onClick={() => setMaskTab("manual")}
          className={`flex-1 py-1 px-2 text-[10px] uppercase tracking-wider rounded transition-colors ${
            maskTab === "manual"
              ? "bg-[var(--accent)] text-black font-semibold"
              : "bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          }`}
        >
          Manual
        </button>
      </div>

      {maskTab === "manual" ? (
        <ManualMaskEditor />
      ) : !sam3Ready ? (
        <button
          onClick={handleInit}
          disabled={isLoading}
          className="w-full py-2 px-3 rounded bg-[var(--accent)] text-black font-semibold text-xs uppercase tracking-wider hover:brightness-110 transition-all disabled:opacity-50"
        >
          {isLoading ? "Starting..." : "Initialize SAM3"}
        </button>
      ) : (
        <>
          <button
            onClick={handleLoadImage}
            disabled={isLoading}
            className="w-full py-1.5 px-3 rounded bg-[var(--surface-2)] text-[var(--text-primary)] text-xs uppercase tracking-wider hover:bg-[var(--surface-3)] transition-colors disabled:opacity-50"
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
              <>
                <input
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleTextPrompt()}
                  placeholder="e.g. sky, person, car..."
                  className="flex-1 min-w-0 bg-[var(--surface-1)] border border-[var(--panel-border)] rounded px-2 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
                />
                <button
                  onClick={handleTextPrompt}
                  disabled={isLoading || !prompt.trim()}
                  className="px-3 py-1.5 rounded bg-[var(--accent)] text-black font-semibold text-xs uppercase tracking-wider hover:brightness-110 transition-all disabled:opacity-50"
                >
                  {isLoading ? "..." : "Go"}
                </button>
              </>
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
                <Sparkles size={12} />
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
                    className="flex items-center justify-between px-2 py-1 rounded bg-[var(--surface-1)] text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ background: p.label === 1 ? "#22c55e" : "#ef4444" }}
                      />
                      <span className="text-[var(--text-primary)]">
                        ({p.x}, {p.y})
                      </span>
                      <span
                        className="text-[10px] px-1 rounded"
                        style={{
                          background: p.label === 1 ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                          color: p.label === 1 ? "#22c55e" : "#ef4444",
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
                  onChange={(e) => setSam3OverlayOpacity(parseFloat(e.target.value))}
                  className="flex-1 h-1 bg-[var(--surface-2)] rounded-lg appearance-none cursor-pointer"
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
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Layers size={12} className="text-[var(--accent)]" />
                <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                  Mask Candidates ({sam3Masks.length})
                </span>
              </div>
              <div className="flex gap-2">
                {sam3Masks.map((m, i) => (
                  <button
                    key={i}
                    onClick={() => setSam3MaskIndex(i)}
                    className={`relative flex-1 aspect-square rounded border-2 overflow-hidden transition-all ${
                      i === sam3MaskIndex
                        ? "border-[var(--accent)] ring-1 ring-[var(--accent)]"
                        : "border-[var(--panel-border)] hover:border-[var(--text-muted)]"
                    }`}
                    title={`Mask ${i + 1} — score: ${sam3MaskScores[i]?.toFixed(3) ?? "?"}`}
                  >
                    <img
                      src={m}
                      alt={`Mask ${i + 1}`}
                      className="w-full h-full object-contain"
                      style={{ filter: "invert(1)" }}
                    />
                    <div
                      className={`absolute bottom-0 left-0 right-0 text-[9px] text-center py-0.5 font-mono ${
                        i === sam3MaskIndex
                          ? "bg-[var(--accent)] text-black font-bold"
                          : "bg-black/60 text-white"
                      }`}
                    >
                      #{i + 1} · {sam3MaskScores[i]?.toFixed(2) ?? "?"}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Post-processing controls */}
          {activeMask && (
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setShowPostProcess(!showPostProcess)}
                className="w-full py-1.5 px-3 rounded border border-[var(--panel-border)] text-[var(--text-muted)] text-xs uppercase tracking-wider hover:text-[var(--text-primary)] transition-colors"
              >
                {showPostProcess ? "Hide" : "Show"} Post-Process
              </button>

              {showPostProcess && (
                <div className="flex flex-col gap-2 p-2 rounded bg-[var(--surface-1)]">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] w-12">Grow</span>
                    <input
                      type="range"
                      min={0}
                      max={20}
                      step={1}
                      value={ppGrow}
                      aria-label="Grow mask by pixels"
                      title="Grow mask by pixels"
                      onChange={(e) => setPpGrow(parseInt(e.target.value))}
                      className="flex-1 h-1 bg-[var(--surface-2)] rounded-lg appearance-none cursor-pointer"
                    />
                    <span className="text-[10px] text-[var(--text-muted)] w-6 text-right">{ppGrow}px</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] w-12">Shrink</span>
                    <input
                      type="range"
                      min={0}
                      max={20}
                      step={1}
                      value={ppShrink}
                      aria-label="Shrink mask by pixels"
                      title="Shrink mask by pixels"
                      onChange={(e) => setPpShrink(parseInt(e.target.value))}
                      className="flex-1 h-1 bg-[var(--surface-2)] rounded-lg appearance-none cursor-pointer"
                    />
                    <span className="text-[10px] text-[var(--text-muted)] w-6 text-right">{ppShrink}px</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] w-12">Feather</span>
                    <input
                      type="range"
                      min={0}
                      max={20}
                      step={1}
                      value={ppFeather}
                      aria-label="Feather mask edge by pixels"
                      title="Feather mask edge by pixels"
                      onChange={(e) => setPpFeather(parseInt(e.target.value))}
                      className="flex-1 h-1 bg-[var(--surface-2)] rounded-lg appearance-none cursor-pointer"
                    />
                    <span className="text-[10px] text-[var(--text-muted)] w-6 text-right">{ppFeather}px</span>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ppFillHoles}
                      onChange={(e) => setPpFillHoles(e.target.checked)}
                      className="w-3 h-3 accent-[var(--accent)]"
                    />
                    <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Fill Holes</span>
                  </label>
                  <button
                    onClick={handlePostprocess}
                    disabled={isLoading || (ppGrow === 0 && ppShrink === 0 && ppFeather === 0 && !ppFillHoles)}
                    className="w-full py-1.5 px-3 rounded bg-[var(--accent)] text-black font-semibold text-xs uppercase tracking-wider hover:brightness-110 transition-all disabled:opacity-50"
                  >
                    {isLoading ? "Processing..." : "Apply"}
                  </button>
                </div>
              )}
            </div>
          )}

          {activeMask && (
            <button
              onClick={handleClear}
              className="w-full py-1.5 px-3 rounded border border-[var(--panel-border)] text-[var(--text-muted)] text-xs uppercase tracking-wider hover:text-[var(--text-primary)] transition-colors"
            >
              Clear Mask
            </button>
          )}
        </>
      )}
    </div>
  );
}
