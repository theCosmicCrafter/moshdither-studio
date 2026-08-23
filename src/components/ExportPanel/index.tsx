import { useState, useEffect, useRef } from "react";
import { useAppStore } from "../../store";
import { exportVideo, applyFfglitch, cancelExport, removeExportTemp } from "../../lib/tauri";
import { stackToRustPayload } from "../../utils/effectConverter";
import { useBatchQueue } from "../../hooks/useBatchQueue";
import type { WatermarkSettings } from "../../utils/watermark";
import { listen } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";
import ChipButton from "./ChipButton";
import LabeledSlider from "../LabeledSlider";

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

// Everything the bundled FFmpeg 8.0 can usefully write for a visual tool:
// video containers, animated single-file images, and numbered image sequences.
// (FFmpeg ships hundreds of muxers, but the rest are audio-only, subtitle or
// streaming targets that have no meaning as an export here.)
//
// `gif` and `png_seq` were previously accepted by this list and then silently
// encoded as H.264 MP4 -- the backend ignored `format` entirely. See
// output_spec() in ffmpeg/mod.rs.
const EXPORT_FORMATS = [
  { id: "mp4", label: "MP4" },
  { id: "mov", label: "MOV" },
  { id: "mkv", label: "MKV" },
  { id: "webm", label: "WEBM" },
  { id: "avi", label: "AVI" },
  { id: "gif", label: "GIF" },
  { id: "apng", label: "APNG" },
  { id: "webp", label: "WEBP" },
  { id: "png_seq", label: "PNG SEQ" },
  { id: "jpg_seq", label: "JPEG SEQ" },
  { id: "webp_seq", label: "WEBP SEQ" },
  { id: "tiff_seq", label: "TIFF SEQ" },
  { id: "bmp_seq", label: "BMP SEQ" },
] as const;

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

  const [format, setFormat] = useState<(typeof EXPORT_FORMATS)[number]["id"]>("mp4");
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
  const handleExportRef = useRef<() => Promise<void>>(() => Promise.resolve());

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
    // Guards both call paths: the in-panel button (already unmounted while
    // exportIsRunning, but defense-in-depth) and the File-menu/triggerExport
    // path below, which has no other guard -- without this, triggering a
    // second export mid-flight opens a second Save dialog and can silently
    // overwrite the first job's still-encoding output.
    if (exportIsRunning) {
      return;
    }
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
        // Sent whenever a bake exists, independent of includeAudio. These are
        // unrelated concerns: the bake is what makes audio-reactive effects
        // respond to the track, while includeAudio decides whether that track
        // is muxed into the output. Gating one on the other meant unticking
        // "Include audio track" silently froze every audio-reactive effect,
        // with nothing in the UI explaining why the export came out static.
        audioBakeJson,
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
      void handleExportRef.current();
    }
  }, [exportTriggerId]);

  const handleCancel = () => {
    requestExportCancel();
    // requestExportCancel() only resets local UI state (progress bar,
    // running flag) -- it never told the backend anything. Without this
    // call, the actual ffmpeg/mosh_cli.py subprocess kept running untouched
    // after the UI already claimed the export was cancelled.
    void cancelExport().catch((err) => {
      console.error("Failed to cancel export on the backend:", err);
    });
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
    if (exportIsRunning) return;

    // The effect stack is rendered FIRST, and the datamosh runs over that
    // render. This used to pass `filePath` straight through, so the button
    // silently discarded every effect, LUT and mask in the stack and moshed the
    // untouched source -- the work was gone with no error to explain it.
    //
    // The two stages cannot be merged: the effects run on decoded RGBA frames,
    // while a bitstream datamosh needs an ENCODED video to chew on. So the
    // render has to be encoded to an intermediate file before FFglitch sees it.
    const state = useAppStore.getState();
    const stack = stackToRustPayload(activeEffects, state.activeMask, state.sam3Masks);
    const willRenderEffects = activeEffects.length > 0;

    const finalPath = await save({
      filters: [
        { name: "MP4", extensions: ["mp4"] },
        { name: "AVI", extensions: ["avi"] },
      ],
    });
    if (!finalPath || typeof finalPath !== "string") return;

    // Sibling of the destination, so it lands on the same volume (a rename or a
    // large write across drives is far slower) and inherits its writability.
    const tempPath = finalPath.replace(/(\.[^.\\/]*)?$/, ".moshdither-fx-tmp.mp4");

    setExportIsRunning(true);
    setExportProgress(0);
    let tempWritten = false;
    try {
      let moshInput = filePath;
      if (willRenderEffects) {
        setStatusMessage(
          `Rendering ${activeEffects.length} effect${activeEffects.length === 1 ? "" : "s"} before datamoshing...`
        );
        await exportVideo(filePath, stack, {
          maskB64: state.activeMask ?? null,
          codec,
          fps,
          audioBakeJson: audioBakeData ? JSON.stringify(audioBakeData) : null,
          watermark: watermark.enabled ? watermark : null,
          trimStart: inPoint ?? undefined,
          trimEnd: typeof outPoint === "number" ? outPoint : state.duration,
          includeAudio,
          outputPath: tempPath,
        });
        tempWritten = true;
        moshInput = tempPath;
      }

      setStatusMessage(`Datamoshing (${ffglitchMode})...`);
      const outputPath = await applyFfglitch(moshInput, ffglitchMode, {}, finalPath);
      setExportProgress(100);
      setStatusMessage(
        willRenderEffects
          ? `Exported with effects + ${ffglitchMode} datamosh: ${outputPath}`
          : `FFglitch exported: ${outputPath}`
      );
    } catch (err) {
      setStatusMessage(`FFglitch export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      // Best-effort: a stranded intermediate is untidy, not a failed export.
      if (tempWritten) await removeExportTemp(tempPath).catch(() => {});
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
        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Format</span>
        <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          {EXPORT_FORMATS.map(({ id: f }) => (
            <ChipButton
              key={f}
              active={format === f}
              onClick={() => setFormat(f)}
              activeColor="var(--accent-pink)"
              activeBackground="rgba(255, 173, 224, 0.25)"
              style={{ padding: "2px 8px" }}
            >
              {EXPORT_FORMATS.find((x) => x.id === f)?.label ?? f}
            </ChipButton>
          ))}
        </div>
      </div>

      {/* Quality */}
      <div className="space-y-1">
        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Quality</span>
        <div style={{ display: "flex", gap: 2 }}>
          {(["draft", "good", "best"] as const).map((q) => (
            <ChipButton
              key={q}
              active={quality === q}
              onClick={() => setQuality(q)}
              activeColor="var(--accent-gold)"
              activeBackground="rgba(184, 211, 0, 0.25)"
              style={{ flex: 1, padding: "2px 0", textTransform: "capitalize" }}
            >
              {q}
            </ChipButton>
          ))}
        </div>
      </div>

      {/* FPS */}
      <LabeledSlider
        label="Frame Rate"
        ariaLabel="FPS"
        value={fps}
        min={1}
        max={60}
        step={1}
        onChange={setFps}
      />

      {/* Include audio. Affects only whether the source track is muxed into the
          output -- audio-reactive effects are driven by the bake below and work
          either way. The title spells that out, because the previous coupling
          taught the opposite. */}
      {audioEnabled && audioFilePath && (
        <label
          style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", fontSize: 11 }}
          title="Mux the source audio into the exported file. Audio-reactive effects respond to the track regardless of this setting."
        >
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
        <span style={{ fontSize: 10, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 10 }}>monitor</span>
          Resolution
        </span>
        <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          {RESOLUTIONS.map((r) => (
            <ChipButton
              key={r.id}
              active={resolutionId === r.id}
              onClick={() => setResolutionId(r.id)}
              title={r.w > 0 ? `${r.w}x${r.h}` : "Original source dimensions"}
              activeColor="var(--accent-teal)"
              activeBackground="rgba(0, 244, 254, 0.25)"
            >
              {r.label}
            </ChipButton>
          ))}
        </div>
      </div>

      {/* Processing resolution — internal decode + effect-processing scale.
          "Auto" picks the largest resolution that fits the adaptive memory
          budget. Lower this if exports OOM on 4K source. */}
      <div className="space-y-1">
        <span
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
        </span>
        <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          {PROCESSING_SCALES.map((s) => (
            <ChipButton
              key={s.id}
              active={processingScaleId === s.id}
              onClick={() => setProcessingScaleId(s.id)}
              title={
                s.scale
                  ? `Downscale source so longest side ≤ ${s.scale}px during processing`
                  : "Pick largest resolution that fits memory budget (recommended)"
              }
              activeColor="var(--accent-gold)"
              activeBackground="rgba(184, 211, 0, 0.25)"
            >
              {s.label}
            </ChipButton>
          ))}
        </div>
      </div>

      {/* Aspect Ratio Lock */}
      <div className="space-y-1">
        <span style={{ fontSize: 10, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
          <input
            type="checkbox"
            checked={aspectRatioLock}
            onChange={(e) => setAspectRatioLock(e.target.checked)}
            style={{ margin: 0 }}
          />
          <span className="material-symbols-outlined" style={{ fontSize: 10 }}>aspect_ratio</span>
          Lock Aspect Ratio
        </span>
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
              <ChipButton
                key={r.label}
                active={aspectRatio === r.value}
                onClick={() => setAspectRatio(r.value)}
                activeColor="var(--accent-teal)"
                activeBackground="rgba(0, 244, 254, 0.25)"
              >
                {r.label}
              </ChipButton>
            ))}
          </div>
        )}
      </div>

      {/* Codec */}
      <div className="space-y-1">
        <span style={{ fontSize: 10, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 10 }}>videocam</span>
          Codec
        </span>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {CODECS.map((c) => (
            <ChipButton
              key={c.id}
              active={codec === c.id}
              onClick={() => setCodec(c.id)}
              activeColor="var(--accent-pink)"
              activeBackground="rgba(255, 173, 224, 0.25)"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "4px 8px",
              }}
            >
              <span>{c.label}</span>
              <span style={{ fontSize: 9, opacity: 0.6 }}>{c.desc}</span>
            </ChipButton>
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
            <span style={{ fontSize: 10, color: "var(--text-muted)", display: "block" }}>
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
            </span>
            <LabeledSlider
              id="wm-opacity"
              label="Opacity"
              value={watermark.opacity}
              displayValue={Math.round(watermark.opacity * 100)}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => setWatermark({ opacity: v })}
              unit="%"
            />
          </div>
        )}
      </div>
      {/* Frame Range Selection */}
      <div className="space-y-1" style={{ borderTop: "1px solid var(--outline-variant)", paddingTop: 8 }}>
        <div style={{ fontSize: 10, color: "var(--text-muted)", display: "flex", justifyContent: "space-between" }}>
          <span>Frame Range</span>
          <span>
            {inPoint !== null || outPoint !== null ? "Custom In/Out" : "Full Media"}
          </span>
        </div>
        {inPoint !== null || outPoint !== null ? (
          <div style={{ fontSize: 10, display: "flex", gap: 8, color: "var(--text-secondary)" }}>
            <span style={{ color: "var(--success)" }}>IN {inPoint ?? 0}s</span>
            <span>→</span>
            <span style={{ color: "var(--danger)" }}>OUT {outPoint ?? "end"}s</span>
          </div>
        ) : null}
      </div>

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
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>movie</span>
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
          <span className="material-symbols-outlined" style={{ fontSize: 11 }}>add_circle</span>
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
          <span className="material-symbols-outlined" style={{ fontSize: 11 }}>view_timeline</span>
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
