import { useState, useEffect, useRef } from "react";
import { useAppStore } from "../../store";
import { exportVideo, applyFfglitch } from "../../lib/tauri";
import { stackToRustPayload } from "../../utils/effectConverter";
import { useBatchQueue } from "../../hooks/useBatchQueue";
import type { WatermarkSettings } from "../../utils/watermark";
import { listen } from "@tauri-apps/api/event";

const CODECS = [
  { id: "h264", label: "H.264", desc: "Best compatibility" },
  { id: "h265", label: "H.265 / HEVC", desc: "Smaller files" },
  { id: "vp9", label: "VP9", desc: "Web / open source" },
  { id: "prores", label: "ProRes 422", desc: "Pro editing" },
];

const RESOLUTIONS = [
  { id: "source", label: "Source", w: 0, h: 0 },
  { id: "4k", label: "4K UHD", w: 3840, h: 2160 },
  { id: "1080p", label: "1080p HD", w: 1920, h: 1080 },
  { id: "720p", label: "720p", w: 1280, h: 720 },
  { id: "480p", label: "480p", w: 854, h: 480 },
];

// Processing resolution = internal decode + effect-processing scale.
// "auto" lets the backend pick the largest resolution that fits the
// adaptive memory budget (4K source → 1440p/1080p depending on clip
// length). The final encode still scales to the output RESOLUTIONS above.
// This matters for 4K source video — processing at native 4K would OOM
// on most systems, but the user can still export at 4K by setting the
// output resolution to "4K UHD" while processing at "Auto" or "1080p".
const PROCESSING_SCALES = [
  { id: "auto", label: "Auto", scale: undefined as number | undefined },
  { id: "1080", label: "≤1080p", scale: 1080 },
  { id: "720", label: "≤720p", scale: 720 },
  { id: "480", label: "≤480p", scale: 480 },
];

const FFGITCH_MODES = [
  { id: "classic", label: "Classic" },
  { id: "classic2", label: "Classic 2" },
  { id: "bloom", label: "Bloom" },
  { id: "pulse", label: "Pulse" },
  { id: "void", label: "Void" },
  { id: "fluid", label: "Fluid" },
  { id: "stretch", label: "Stretch" },
  { id: "shuffle_basic", label: "Shuffle" },
  { id: "rise", label: "Rise" },
  { id: "water_bloom", label: "Water Bloom" },
  { id: "zoom", label: "Zoom" },
  { id: "delay", label: "Delay" },
  { id: "buffer", label: "Buffer" },
];

export default function ExportPanel() {
  const effectStack = useAppStore((s) => s.effectStack);
  const mediaInfo = useAppStore((s) => s.mediaInfo);
  const audioEnabled = useAppStore((s) => s.audioEnabled);
  const audioFilePath = useAppStore((s) => s.audioFilePath);
  const audioBakeData = useAppStore((s) => s.audioBakeData);
  const filePath = useAppStore((s) => s.filePath);
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);
  const exportProgress = useAppStore((s) => s.exportProgress);
  const exportIsRunning = useAppStore((s) => s.exportIsRunning);
  const setExportIsRunning = useAppStore((s) => s.setExportIsRunning);
  const setExportProgress = useAppStore((s) => s.setExportProgress);
  const resetExport = useAppStore((s) => s.resetExport);
  const requestExportCancel = useAppStore((s) => s.requestExportCancel);
  const watermark = useAppStore((s) => s.watermark);
  const setWatermark = useAppStore((s) => s.setWatermark);
  const aspectRatioLock = useAppStore((s) => s.aspectRatioLock);
  const setAspectRatioLock = useAppStore((s) => s.setAspectRatioLock);
  const aspectRatio = useAppStore((s) => s.aspectRatio);
  const setAspectRatio = useAppStore((s) => s.setAspectRatio);

  const { queue, isProcessing, currentJobId, addJob, removeJob, clearQueue, processQueue } =
    useBatchQueue();
  const [showQueue, setShowQueue] = useState(false);

  const [format, setFormat] = useState<"mp4" | "webm" | "gif" | "png_seq">("mp4");
  const [codec, setCodec] = useState("h264");
  const [resolutionId, setResolutionId] = useState("source");
  const [processingScaleId, setProcessingScaleId] = useState("auto");
  const [quality, setQuality] = useState<"draft" | "good" | "best">("good");
  const [fps, setFps] = useState(30);
  const [includeAudio, setIncludeAudio] = useState(true);
  const [ffglitchMode, setFfglitchMode] = useState("classic");

  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const exportTriggerId = useAppStore((s) => s.exportTriggerId);
  const lastTriggerId = useRef(0);
  const handleExportRef = useRef<() => void>(() => {});

  const activeEffects = effectStack.filter((e) => e.enabled);
  const resolution = RESOLUTIONS.find((r) => r.id === resolutionId)!;
  const inPoint = useAppStore((s) => s.inPoint);
  const outPoint = useAppStore((s) => s.outPoint);

  useEffect(() => {
    return () => {
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
      }
    };
  }, []);

  const handleExport = async () => {
    if (!mediaInfo || !filePath) {
      setStatusMessage("Load media before exporting");
      return;
    }
    if (activeEffects.length === 0) {
      setStatusMessage("No effects enabled — export would be a copy");
      return;
    }

    setExportIsRunning(true);
    setExportProgress(0);
    setStatusMessage("Export started...");

    // Listen for real progress events from backend
    const unlistenPromise = listen<{ stage: string; progress: number; message?: string }>(
      "export-progress",
      (event) => {
        const { stage, progress, message } = event.payload;
        if (stage === "error") {
          if (progressTimerRef.current) {
            clearInterval(progressTimerRef.current);
            progressTimerRef.current = null;
          }
          setExportIsRunning(false);
          setExportProgress(0);
          setStatusMessage(`Export failed: ${message ?? "unknown error"}`);
        } else {
          setExportProgress(progress);
          if (stage === "decoding") setStatusMessage("Decoding video...");
          else if (stage === "effects") setStatusMessage("Applying effects...");
          else if (stage === "encoding") setStatusMessage("Encoding video...");
          else if (stage === "done") setStatusMessage("Export complete!");
        }
      }
    );

    const state = useAppStore.getState();
    const stack = stackToRustPayload(
      activeEffects,
      state.activeMask,
      state.sam3Masks
    );

    const width = resolution.w === 0 ? undefined : resolution.w;
    const height = resolution.h === 0 ? undefined : resolution.h;
    const processingScale = PROCESSING_SCALES.find(
      (s) => s.id === processingScaleId
    )?.scale;

    const audioBakeJson = audioBakeData ? JSON.stringify(audioBakeData) : null;

    // Use outPoint if set, otherwise use the user-set duration as the clip length
    const trimEnd = typeof outPoint === "number" ? outPoint : state.duration;

    try {
      const outputPath = await exportVideo(filePath, stack, {
        maskB64: state.activeMask ?? null,
        codec,
        fps,
        width,
        height,
        audioBakeJson: includeAudio ? audioBakeJson : null,
        watermark: watermark.enabled ? watermark : null,
        trimStart: typeof inPoint === "number" ? inPoint : undefined,
        trimEnd,
        format,
        quality,
        includeAudio,
        processingScale,
      });

      const unlisten = await unlistenPromise;
      unlisten();
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      setExportProgress(100);
      setStatusMessage(`Exported: ${outputPath}`);
      setTimeout(() => {
        resetExport();
        setStatusMessage("Ready");
      }, 3000);
    } catch (err) {
      const unlisten = await unlistenPromise;
      unlisten();
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      setExportIsRunning(false);
      setExportProgress(0);
      setStatusMessage(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  handleExportRef.current = handleExport;

  useEffect(() => {
    if (exportTriggerId > 0 && exportTriggerId !== lastTriggerId.current) {
      lastTriggerId.current = exportTriggerId;
      handleExportRef.current();
    }
  }, [exportTriggerId]);

  const handleCancel = () => {
    requestExportCancel();
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    setExportIsRunning(false);
    setExportProgress(0);
    setStatusMessage("Export cancelled");
  };

  const handleFfglitchExport = async () => {
    if (!mediaInfo || !filePath) {
      setStatusMessage("Load media before exporting");
      return;
    }
    setExportIsRunning(true);
    setExportProgress(0);
    setStatusMessage("FFglitch export started...");
    try {
      const outputPath = await applyFfglitch(filePath, ffglitchMode, {});
      setExportProgress(100);
      setStatusMessage(`FFglitch exported: ${outputPath}`);
    } catch (err) {
      setStatusMessage(`FFglitch export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setExportIsRunning(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        color: "var(--text-primary)",
        fontSize: 12,
        fontFamily: "var(--font-body)",
      }}
    >
      {/* Format */}
      <div className="space-y-1">
        <label style={{ fontSize: 10, color: "var(--text-muted)" }}>Format</label>
        <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          {(["mp4", "webm", "gif", "png_seq"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFormat(f)}
              style={{
                padding: "2px 8px",
                fontSize: 10,
                borderRadius: 3,
                border: "none",
                cursor: "pointer",
                background: format === f ? "rgba(255, 173, 224, 0.25)" : "var(--surface-container-low)",
                color: format === f ? "var(--accent-pink)" : "var(--text-muted)",
              }}
            >
              {f.toUpperCase().replace("_", "-")}
            </button>
          ))}
        </div>
      </div>

      {/* Quality */}
      <div className="space-y-1">
        <label style={{ fontSize: 10, color: "var(--text-muted)" }}>Quality</label>
        <div style={{ display: "flex", gap: 2 }}>
          {(["draft", "good", "best"] as const).map((q) => (
            <button
              key={q}
              onClick={() => setQuality(q)}
              style={{
                flex: 1,
                padding: "2px 0",
                fontSize: 10,
                borderRadius: 3,
                border: "none",
                cursor: "pointer",
                background: quality === q ? "rgba(184, 211, 0, 0.25)" : "var(--surface-container-low)",
                color: quality === q ? "var(--accent-gold)" : "var(--text-muted)",
                textTransform: "capitalize",
              }}
            >
              {q}
            </button>
          ))}
        </div>
      </div>

      {/* FPS */}
      <div className="space-y-1">
        <label style={{ fontSize: 10, color: "var(--text-muted)" }}>Frame Rate</label>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            aria-label="FPS"
            type="range"
            min={1}
            max={60}
            step={1}
            value={fps}
            onChange={(e) => setFps(parseInt(e.target.value))}
            style={{ flex: 1 }}
          />
          <span style={{ minWidth: 28, textAlign: "right", fontFamily: "var(--font-mono)", color: "var(--text-primary)" }}>
            {fps}
          </span>
        </div>
      </div>

      {/* Include audio */}
      {audioEnabled && audioFilePath && (
        <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", fontSize: 11 }}>
          <input
            type="checkbox"
            checked={includeAudio}
            onChange={(e) => setIncludeAudio(e.target.checked)}
          />
          Include audio track
        </label>
      )}

      {/* Audio bake status */}
      {audioEnabled && audioFilePath && (
        <div style={{ fontSize: 10, color: audioBakeData ? "var(--success)" : "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 10 }}>hard_drive</span>
          {audioBakeData
            ? `Audio baked: ${audioBakeData.totalFrames} frames`
            : "Audio not baked (effects will be static)"}
        </div>
      )}

      {/* Active effects count */}
      {/* Resolution */}
      <div className="space-y-1">
        <label style={{ fontSize: 10, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 10 }}>monitor</span>
          Resolution
        </label>
        <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          {RESOLUTIONS.map((r) => (
            <button
              key={r.id}
              onClick={() => setResolutionId(r.id)}
              title={r.w > 0 ? `${r.w}x${r.h}` : "Original source dimensions"}
              style={{
                padding: "2px 6px",
                fontSize: 10,
                borderRadius: 3,
                border: "none",
                cursor: "pointer",
                background: resolutionId === r.id ? "rgba(0, 244, 254, 0.25)" : "var(--surface-container-low)",
                color: resolutionId === r.id ? "var(--accent-teal)" : "var(--text-muted)",
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Processing resolution — internal decode + effect-processing scale.
          "Auto" picks the largest resolution that fits the adaptive memory
          budget. Lower this if exports OOM on 4K source. */}
      <div className="space-y-1">
        <label
          style={{
            fontSize: 10,
            color: "var(--text-muted)",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
          title="Internal processing resolution. Auto picks the largest that fits memory. Lower this if 4K exports run out of memory."
        >
          <span className="material-symbols-outlined" style={{ fontSize: 10 }}>
            memory
          </span>
          Processing
        </label>
        <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          {PROCESSING_SCALES.map((s) => (
            <button
              key={s.id}
              onClick={() => setProcessingScaleId(s.id)}
              title={
                s.scale
                  ? `Downscale source so longest side ≤ ${s.scale}px during processing`
                  : "Pick largest resolution that fits memory budget (recommended)"
              }
              style={{
                padding: "2px 6px",
                fontSize: 10,
                borderRadius: 3,
                border: "none",
                cursor: "pointer",
                background:
                  processingScaleId === s.id
                    ? "rgba(184, 211, 0, 0.25)"
                    : "var(--surface-container-low)",
                color:
                  processingScaleId === s.id
                    ? "var(--accent-gold)"
                    : "var(--text-muted)",
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Aspect Ratio Lock */}
      <div className="space-y-1">
        <label style={{ fontSize: 10, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
          <input
            type="checkbox"
            checked={aspectRatioLock}
            onChange={(e) => setAspectRatioLock(e.target.checked)}
            style={{ margin: 0 }}
          />
          <span className="material-symbols-outlined" style={{ fontSize: 10 }}>aspect_ratio</span>
          Lock Aspect Ratio
        </label>
        {aspectRatioLock && (
          <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
            {[
              { label: "16:9", value: 16 / 9 },
              { label: "4:3", value: 4 / 3 },
              { label: "1:1", value: 1 },
              { label: "9:16", value: 9 / 16 },
              { label: "21:9", value: 21 / 9 },
              { label: "3:2", value: 3 / 2 },
            ].map((r) => (
              <button
                key={r.label}
                onClick={() => setAspectRatio(r.value)}
                style={{
                  padding: "2px 6px",
                  fontSize: 10,
                  borderRadius: 3,
                  border: "none",
                  cursor: "pointer",
                  background: aspectRatio === r.value ? "rgba(0, 244, 254, 0.25)" : "var(--surface-container-low)",
                  color: aspectRatio === r.value ? "var(--accent-teal)" : "var(--text-muted)",
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Codec */}
      <div className="space-y-1">
        <label style={{ fontSize: 10, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 10 }}>videocam</span>
          Codec
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {CODECS.map((c) => (
            <button
              key={c.id}
              onClick={() => setCodec(c.id)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "4px 8px",
                fontSize: 10,
                borderRadius: 3,
                border: "none",
                cursor: "pointer",
                background: codec === c.id ? "rgba(255, 173, 224, 0.25)" : "var(--surface-container-low)",
                color: codec === c.id ? "var(--accent-pink)" : "var(--text-muted)",
              }}
            >
              <span>{c.label}</span>
              <span style={{ fontSize: 9, opacity: 0.6 }}>{c.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Active effects count */}
      <div style={{ fontSize: 10, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 10 }}>hard_drive</span>
        {activeEffects.length} effect{activeEffects.length !== 1 ? "s" : ""} queued
      </div>

      {/* Progress bar */}
      {exportIsRunning && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div
            style={{
              height: 4,
              background: "var(--surface-container-low)",
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${exportProgress}%`,
                height: "100%",
                background: "linear-gradient(90deg, var(--accent-pink), var(--accent-teal))",
                borderRadius: 2,
                transition: "width 0.2s ease",
              }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
              {Math.round(exportProgress)}%
            </span>
            <button
              onClick={handleCancel}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 2,
                padding: "2px 6px",
                fontSize: 9,
                borderRadius: 3,
                border: "none",
                cursor: "pointer",
                background: "rgba(255, 180, 171, 0.15)",
                color: "var(--danger)",
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 10 }}>close</span>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* FFglitch export */}
      <div className="space-y-1" style={{ borderTop: "1px solid var(--outline-variant)", paddingTop: 8 }}>
        <label
          htmlFor="ffglitch-mode"
          style={{ fontSize: 10, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 10 }}>bolt</span>
          FFglitch Export
        </label>
        <select
          id="ffglitch-mode"
          value={ffglitchMode}
          onChange={(e) => setFfglitchMode(e.target.value)}
          style={{
            width: "100%",
            padding: "4px 6px",
            fontSize: 11,
            borderRadius: 3,
            border: "1px solid var(--outline-variant)",
            background: "var(--surface-container-low)",
            color: "var(--text-primary)",
          }}
        >
          {FFGITCH_MODES.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <button
          onClick={handleFfglitchExport}
          disabled={exportIsRunning || !mediaInfo || !filePath}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            padding: "6px 0",
            fontSize: 11,
            fontWeight: 600,
            borderRadius: 3,
            border: "none",
            cursor: "pointer",
            background: "var(--accent-gold)",
            color: "var(--on-tertiary)",
            opacity: exportIsRunning || !mediaInfo || !filePath ? 0.5 : 1,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 12 }}>auto_fix_high</span>
          Export FFglitch ({ffglitchMode})
        </button>
      </div>

      {/* Watermark */}
      <div className="space-y-1" style={{ borderTop: "1px solid var(--outline-variant)", paddingTop: 8 }}>
        <label
          htmlFor="watermark-enabled"
          style={{ fontSize: 10, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}
        >
          <input
            id="watermark-enabled"
            type="checkbox"
            checked={watermark.enabled}
            onChange={(e) => setWatermark({ enabled: e.target.checked })}
            style={{ margin: 0 }}
          />
          <span className="material-symbols-outlined" style={{ fontSize: 10 }}>branding_watermark</span>
          Watermark
        </label>
        {watermark.enabled && (
          <div className="space-y-1" style={{ paddingLeft: 16 }}>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                type="button"
                onClick={() => setWatermark({ type: "text" })}
                style={{
                  flex: 1,
                  fontSize: 10,
                  padding: "3px 0",
                  border: "1px solid var(--outline-variant)",
                  borderRadius: 3,
                  background: watermark.type === "text" ? "var(--accent-teal)" : "var(--surface-container-low)",
                  color: watermark.type === "text" ? "var(--on-primary)" : "var(--text-primary)",
                  cursor: "pointer",
                }}
              >
                Text
              </button>
              <button
                type="button"
                onClick={() => setWatermark({ type: "image" })}
                style={{
                  flex: 1,
                  fontSize: 10,
                  padding: "3px 0",
                  border: "1px solid var(--outline-variant)",
                  borderRadius: 3,
                  background: watermark.type === "image" ? "var(--accent-teal)" : "var(--surface-container-low)",
                  color: watermark.type === "image" ? "var(--on-primary)" : "var(--text-primary)",
                  cursor: "pointer",
                }}
              >
                Image
              </button>
            </div>
            {watermark.type === "text" && (
              <input
                type="text"
                value={watermark.text}
                onChange={(e) => setWatermark({ text: e.target.value })}
                placeholder="Watermark text"
                style={{
                  width: "100%",
                  padding: "4px 6px",
                  fontSize: 11,
                  borderRadius: 3,
                  border: "1px solid var(--outline-variant)",
                  background: "var(--surface-container-low)",
                  color: "var(--text-primary)",
                }}
              />
            )}
            {watermark.type === "image" && (
              <input
                type="text"
                value={watermark.imagePath ?? ""}
                onChange={(e) => setWatermark({ imagePath: e.target.value || null })}
                placeholder="Image path"
                style={{
                  width: "100%",
                  padding: "4px 6px",
                  fontSize: 11,
                  borderRadius: 3,
                  border: "1px solid var(--outline-variant)",
                  background: "var(--surface-container-low)",
                  color: "var(--text-primary)",
                }}
              />
            )}
            <label style={{ fontSize: 10, color: "var(--text-muted)", display: "block" }}>
              Position
              <select
                value={watermark.position}
                onChange={(e) => setWatermark({ position: e.target.value as WatermarkSettings["position"] })}
                style={{
                  width: "100%",
                  padding: "4px 6px",
                  fontSize: 11,
                  borderRadius: 3,
                  border: "1px solid var(--outline-variant)",
                  background: "var(--surface-container-low)",
                  color: "var(--text-primary)",
                  display: "block",
                  marginTop: 2,
                }}
              >
                <option value="top-left">Top Left</option>
                <option value="top-right">Top Right</option>
                <option value="bottom-left">Bottom Left</option>
                <option value="bottom-right">Bottom Right</option>
                <option value="center">Center</option>
              </select>
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <label style={{ fontSize: 10, color: "var(--text-muted)", minWidth: 42 }} htmlFor="wm-opacity">
                Opacity
              </label>
              <input
                id="wm-opacity"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={watermark.opacity}
                onChange={(e) => setWatermark({ opacity: Number.parseFloat(e.target.value) })}
                style={{ flex: 1 }}
              />
              <span style={{ fontSize: 10, color: "var(--text-muted)", minWidth: 32 }}>
                {Math.round(watermark.opacity * 100)}%
              </span>
            </div>
          </div>
        )}
      </div>

      {/* In/Out range */}
      {(inPoint !== null || outPoint !== null) && (
        <div style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "var(--font-mono)", display: "flex", gap: 6, alignItems: "center" }}>
          <span style={{ color: "var(--success)" }}>IN {inPoint ?? 0}s</span>
          <span>→</span>
          <span style={{ color: "var(--danger)" }}>OUT {outPoint ?? "end"}s</span>
        </div>
      )}

      {/* Export button */}
      {!exportIsRunning && (
        <button
          onClick={handleExport}
          disabled={exportIsRunning}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            padding: "8px 0",
            fontSize: 12,
            fontWeight: 600,
            borderRadius: 4,
            border: "none",
            cursor: "pointer",
            background: "var(--accent-pink)",
            color: "var(--on-primary)",
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>download_for_offline</span>
          Export Video
        </button>
      )}

      {/* Batch Queue */}
      <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
        <button
          onClick={() => {
            const res = RESOLUTIONS.find((r) => r.id === resolutionId)!;
            addJob({
              name: `${format} ${codec} ${resolutionId}`,
              format,
              codec,
              resolutionW: res.w === 0 ? undefined : res.w,
              resolutionH: res.h === 0 ? undefined : res.h,
              fps,
              quality,
            });
          }}
          disabled={!mediaInfo || !filePath}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            padding: "4px 0",
            fontSize: 11,
            borderRadius: 3,
            border: "1px solid var(--outline-variant)",
            background: "var(--surface-container-low)",
            color: "var(--text-secondary)",
            cursor: "pointer",
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 11 }}>add</span>
          Add to Queue
        </button>
        <button
          onClick={() => setShowQueue((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            padding: "4px 8px",
            fontSize: 11,
            borderRadius: 3,
            border: "1px solid var(--outline-variant)",
            background: "var(--surface-container-low)",
            color: "var(--text-secondary)",
            cursor: "pointer",
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 11 }}>list</span>
          {queue.length}
        </button>
      </div>

      {showQueue && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            maxHeight: 140,
            overflowY: "auto",
          }}
        >
          {queue.length === 0 ? (
            <div style={{ color: "var(--text-muted, #666)", textAlign: "center", fontSize: 11 }}>Queue empty</div>
          ) : (
            queue.map((job) => (
              <div
                key={job.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "3px 6px",
                  borderRadius: 3,
                  background: currentJobId === job.id ? "rgba(184, 211, 0, 0.15)" : "var(--surface-container-low)",
                  fontSize: 11,
                }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                  {job.name}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    color:
                      job.status === "completed"
                        ? "var(--success)"
                        : job.status === "failed"
                        ? "var(--danger)"
                        : job.status === "running"
                        ? "var(--accent-gold)"
                        : "var(--text-muted)",
                    marginRight: 4,
                  }}
                >
                  {job.status === "completed" && job.outputPath ? "Done" : job.status}
                </span>
                {job.status === "pending" && (
                  <button
                    onClick={() => removeJob(job.id)}
                    title="Remove job"
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--danger)",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 11 }}>delete</span>
                  </button>
                )}
              </div>
            ))
          )}
          {queue.some((j) => j.status === "pending") && !isProcessing && (
            <button
              onClick={() => processQueue()}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                padding: "4px 0",
                fontSize: 11,
                borderRadius: 3,
                border: "none",
                background: "var(--accent-gold)",
                color: "var(--on-tertiary)",
                cursor: "pointer",
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 11 }}>play_arrow</span>
              Process Queue
            </button>
          )}
          {queue.length > 0 && (
            <button
              onClick={clearQueue}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
                padding: "4px 0",
                fontSize: 11,
                borderRadius: 3,
                border: "1px solid var(--outline-variant)",
                background: "transparent",
                color: "var(--danger)",
                cursor: "pointer",
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 11 }}>delete</span>
              Clear Queue
            </button>
          )}
        </div>
      )}
    </div>
  );
}
