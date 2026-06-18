import { useState, useEffect, useRef } from "react";
import { useAppStore } from "../../store";
import { exportVideo } from "../../lib/tauri";
import { stackToRustPayload } from "../../utils/effectConverter";
import {
  Film,
  ArrowDownToLine,
  X,
  Monitor,
  Video,
  HardDrive,
} from "lucide-react";

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

export default function ExportPanel() {
  const effectStack = useAppStore((s) => s.effectStack);
  const mediaInfo = useAppStore((s) => s.mediaInfo);
  const audioEnabled = useAppStore((s) => s.audioEnabled);
  const audioFilePath = useAppStore((s) => s.audioFilePath);
  const filePath = useAppStore((s) => s.filePath);
  const activeMask = useAppStore((s) => s.activeMask);
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);
  const exportProgress = useAppStore((s) => s.exportProgress);
  const exportIsRunning = useAppStore((s) => s.exportIsRunning);
  const setExportIsRunning = useAppStore((s) => s.setExportIsRunning);
  const setExportProgress = useAppStore((s) => s.setExportProgress);
  const resetExport = useAppStore((s) => s.resetExport);
  const requestExportCancel = useAppStore((s) => s.requestExportCancel);

  const [format, setFormat] = useState<"mp4" | "webm" | "gif" | "png_seq">("mp4");
  const [codec, setCodec] = useState("h264");
  const [resolutionId, setResolutionId] = useState("source");
  const [quality, setQuality] = useState<"draft" | "good" | "best">("good");
  const [fps, setFps] = useState(30);
  const [includeAudio, setIncludeAudio] = useState(true);

  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeEffects = effectStack.filter((e) => e.enabled);
  const resolution = RESOLUTIONS.find((r) => r.id === resolutionId)!;

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
    }

    setExportIsRunning(true);
    setExportProgress(0);
    setStatusMessage("Export started...");

    // Simulate progress while Rust works (backend doesn't stream progress yet)
    let progress = 0;
    progressTimerRef.current = setInterval(() => {
      progress += Math.random() * 3 + 0.5;
      if (progress >= 95) progress = 95;
      setExportProgress(progress);
    }, 300);

    const state = useAppStore.getState();
    const stack = stackToRustPayload(
      activeEffects,
      state.activeMask,
      state.sam3Masks
    );

    const width = resolution.w === 0 ? undefined : resolution.w;
    const height = resolution.h === 0 ? undefined : resolution.h;

    try {
      const outputPath = await exportVideo(filePath, stack, {
        maskB64: activeMask,
        codec,
        fps,
        width,
        height,
      });

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
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      setExportIsRunning(false);
      setExportProgress(0);
      setStatusMessage(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

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

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: 12,
        background: "#1a1a1a",
        borderRadius: 6,
        minWidth: 220,
        maxWidth: 280,
        color: "#e0e0e0",
        fontSize: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Film size={14} />
        <span style={{ fontWeight: 600, fontSize: 13 }}>Export</span>
      </div>

      {/* Format */}
      <div className="space-y-1">
        <label style={{ fontSize: 10, color: "#888" }}>Format</label>
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
                background: format === f ? "rgba(74, 144, 217, 0.25)" : "#333",
                color: format === f ? "#6cf" : "#aaa",
              }}
            >
              {f.toUpperCase().replace("_", "-")}
            </button>
          ))}
        </div>
      </div>

      {/* Quality */}
      <div className="space-y-1">
        <label style={{ fontSize: 10, color: "#888" }}>Quality</label>
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
                background: quality === q ? "rgba(74, 144, 217, 0.25)" : "#333",
                color: quality === q ? "#6cf" : "#aaa",
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
        <label style={{ fontSize: 10, color: "#888" }}>Frame Rate</label>
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
          <span style={{ minWidth: 28, textAlign: "right", fontFamily: "var(--font-mono)" }}>
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

      {/* Active effects count */}
      {/* Resolution */}
      <div className="space-y-1">
        <label style={{ fontSize: 10, color: "#888", display: "flex", alignItems: "center", gap: 4 }}>
          <Monitor size={10} />
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
                background: resolutionId === r.id ? "rgba(74, 144, 217, 0.25)" : "#333",
                color: resolutionId === r.id ? "#6cf" : "#aaa",
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Codec */}
      <div className="space-y-1">
        <label style={{ fontSize: 10, color: "#888", display: "flex", alignItems: "center", gap: 4 }}>
          <Video size={10} />
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
                background: codec === c.id ? "rgba(74, 144, 217, 0.25)" : "#333",
                color: codec === c.id ? "#6cf" : "#aaa",
              }}
            >
              <span>{c.label}</span>
              <span style={{ fontSize: 9, opacity: 0.6 }}>{c.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Active effects count */}
      <div style={{ fontSize: 10, color: "#888", display: "flex", alignItems: "center", gap: 4 }}>
        <HardDrive size={10} />
        {activeEffects.length} effect{activeEffects.length !== 1 ? "s" : ""} queued
      </div>

      {/* Progress bar */}
      {exportIsRunning && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div
            style={{
              height: 4,
              background: "#333",
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${exportProgress}%`,
                height: "100%",
                background: "linear-gradient(90deg, #4a90d9, #6cf)",
                borderRadius: 2,
                transition: "width 0.2s ease",
              }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 10, color: "#888" }}>
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
                background: "#522",
                color: "#faa",
              }}
            >
              <X size={10} />
              Cancel
            </button>
          </div>
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
            background: "#2a6f3c",
            color: "#fff",
          }}
        >
          <ArrowDownToLine size={14} />
          Export Video
        </button>
      )}
    </div>
  );
}
