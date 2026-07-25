import React, { useRef, useCallback } from "react";
import { useAppStore } from "../../store";
import { useAudioEngine } from "../../hooks/useAudioEngine";
import { STANDARD_BANDS } from "../../engine/audio/types";
import { detectBeats, decodeAudioFile } from "../../utils/beatDetection";
import { generateBeatKeyframes } from "../../utils/beatKeyframeGenerator";
import { getFileName } from "../../utils/fileName";

export default function AudioPanel() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioFileRef = useRef<File | null>(null);
  const [detectedBpm, setDetectedBpm] = React.useState<number | null>(null);
  const [beatCount, setBeatCount] = React.useState(0);

  const audioEnabled = useAppStore((s) => s.audioEnabled);
  const audioPlaying = useAppStore((s) => s.audioPlaying);
  const audioVolume = useAppStore((s) => s.audioVolume);
  const audioBpm = useAppStore((s) => s.audioBpm);
  const audioBeatFlags = useAppStore((s) => s.audioBeatFlags);
  const audioFilePath = useAppStore((s) => s.audioFilePath);
  const audioManifestProgress = useAppStore((s) => s.audioManifestProgress);
  const audioManifestPhase = useAppStore((s) => s.audioManifestPhase);
  const audioIsSilent = useAppStore((s) => s.audioIsSilent);

  const setAudioEnabled = useAppStore((s) => s.setAudioEnabled);
  const setAudioVolume = useAppStore((s) => s.setAudioVolume);
  const setAudioFilePath = useAppStore((s) => s.setAudioFilePath);
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);

  const {
    loadAudioFile,
    startMicrophone,
    play,
    pause,
    stop,
  } = useAudioEngine();

  const handleFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      audioFileRef.current = file;
      setAudioEnabled(true);
      setAudioFilePath(file.name);
      try {
        await loadAudioFile(file);
      } catch (err) {
        console.error("Audio file load failed:", err);
        setStatusMessage(
          `Audio load failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    },
    [loadAudioFile, setAudioEnabled, setAudioFilePath, setStatusMessage]
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (!file || !file.type.startsWith("audio/")) return;
      audioFileRef.current = file;
      setAudioEnabled(true);
      setAudioFilePath(file.name);
      try {
        await loadAudioFile(file);
      } catch (err) {
        console.error("Audio file load failed:", err);
        setStatusMessage(
          `Audio load failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    },
    [loadAudioFile, setAudioEnabled, setAudioFilePath, setStatusMessage]
  );

  const selectedStackId = useAppStore((s) => s.selectedStackId);
  const setKeyframesForTrack = useAppStore((s) => s.setKeyframesForTrack);

  const handleAnalyzeBeats = useCallback(async () => {
    const file = audioFileRef.current;
    if (!file) {
      setStatusMessage("No audio file loaded");
      return;
    }
    try {
      const buffer = await decodeAudioFile(file);
      const result = detectBeats(buffer);
      setDetectedBpm(result.bpm);
      setBeatCount(result.beats.length);
      if (selectedStackId) {
        const keyframes = generateBeatKeyframes({
          beats: result.beats,
          paramKey: "intensity",
          mode: "pulse",
          minValue: 0,
          maxValue: 1,
          easing: "easeInOut",
        });
        setKeyframesForTrack(selectedStackId, "intensity", keyframes);
        setStatusMessage(`Detected ${result.beats.length} beats (${result.bpm} BPM) → keyframes applied`);
      } else {
        setStatusMessage(`Detected ${result.beats.length} beats (${result.bpm} BPM) — select an effect to apply keyframes`);
      }
    } catch (err) {
      console.error("Beat detection failed:", err);
      const detail = err instanceof Error ? err.message : String(err);
      setStatusMessage(`Beat detection failed: ${detail}`);
    }
  }, [selectedStackId, setKeyframesForTrack, setStatusMessage]);

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
      <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={audioEnabled}
          onChange={(e) => setAudioEnabled(e.target.checked)}
        />
        <span>Enable audio reactive</span>
      </label>

      {audioEnabled && audioIsSilent && (
        <div
          role="alert"
          style={{
            padding: "6px 8px",
            fontSize: 10,
            borderRadius: 3,
            background: "rgba(255, 180, 0, 0.15)",
            border: "1px solid rgba(255, 180, 0, 0.4)",
            color: "var(--accent-gold, #ffb400)",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 12 }}>
            warning
          </span>
          <span>
            Source audio is silent or missing. Audio-reactive effects won't respond.
            Load a separate audio file below to drive them.
          </span>
        </div>
      )}

      {!audioEnabled ? (
        <div style={{ color: "var(--text-muted)", textAlign: "center", padding: "12px 0" }}>
          Enable audio reactive to start
        </div>
      ) : (
        <>
          {/* File drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            title={audioFilePath ?? undefined}
            style={{
              border: "2px dashed var(--surface-bright)",
              borderRadius: 4,
              padding: "10px 6px",
              textAlign: "center",
              cursor: "pointer",
              fontSize: 11,
              color: audioFilePath ? "var(--accent-teal)" : "var(--text-muted)",
            }}
          >
            {getFileName(audioFilePath) || "Drop audio file or click to browse"}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            aria-label="Select audio file"
            style={{ display: "none" }}
            onChange={handleFile}
          />

          {/* Manifest analysis progress */}
          {audioManifestProgress > 0 && audioManifestProgress < 1 && (
            <div style={{ fontSize: 10, color: "var(--accent-teal)" }}>
              <div style={{ marginBottom: 2 }}>{audioManifestPhase}</div>
              <div
                style={{
                  height: 3,
                  background: "var(--surface-container-low)",
                  borderRadius: 2,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${audioManifestProgress * 100}%`,
                    background: "var(--accent-teal)",
                    transition: "width 100ms linear",
                  }}
                />
              </div>
            </div>
          )}

          {/* Mic toggle */}
          <button
            onClick={startMicrophone}
            style={{
              padding: "4px 8px",
              fontSize: 11,
              background: "var(--surface-container-low)",
              border: "1px solid var(--outline-variant)",
              color: "var(--text-secondary)",
              borderRadius: 3,
              cursor: "pointer",
            }}
          >
            Use Microphone
          </button>

          {/* Transport */}
          <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
            <TransportButton onClick={play} label="Play" active={audioPlaying} />
            <TransportButton onClick={pause} label="Pause" active={!audioPlaying} />
            <TransportButton onClick={stop} label="Stop" />
          </div>

          {/* Volume */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ minWidth: 40 }}>Vol</span>
            <input
              type="range"
              aria-label="Volume"
              min={0}
              max={1}
              step={0.01}
              value={audioVolume}
              onChange={(e) => setAudioVolume(parseFloat(e.target.value))}
              style={{ flex: 1 }}
            />
            <span style={{ minWidth: 28, textAlign: "right" }}>
              {Math.round(audioVolume * 100)}%
            </span>
          </div>

          {/* BPM */}
          {audioBpm && (
            <div style={{ textAlign: "center", color: "var(--accent-teal)", fontSize: 11 }}>
              BPM: {Math.round(audioBpm)}
            </div>
          )}

          {/* Beat detection */}
          <button
            onClick={handleAnalyzeBeats}
            style={{
              padding: "4px 8px",
              fontSize: 11,
              background: "var(--surface-container-low)",
              border: "1px solid var(--outline-variant)",
              color: "var(--text-secondary)",
              borderRadius: 3,
              cursor: "pointer",
            }}
          >
            Analyze Beats
          </button>
          {detectedBpm && (
            <div style={{ textAlign: "center", color: "var(--accent-teal)", fontSize: 11 }}>
              Detected {beatCount} beats / {detectedBpm} BPM
            </div>
          )}

          {/* Beat indicators */}
          <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
            <BeatDot label="Bass" active={audioBeatFlags.bass} color="var(--accent-pink)" />
            <BeatDot label="Mid" active={audioBeatFlags.mid} color="var(--accent-gold)" />
            <BeatDot label="Treble" active={audioBeatFlags.treble} color="var(--accent-teal)" />
          </div>

          {/* Spectrum bars — isolated so they re-render on audio data without
              re-rendering the rest of the audio panel controls */}
          <SpectrumBars />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 9,
              color: "var(--text-muted)",
              padding: "0 2px",
            }}
          >
            <span>Sub</span>
            <span>Bass</span>
            <span>LMid</span>
            <span>Mid</span>
            <span>HMid</span>
            <span>Pres</span>
            <span>Bril</span>
          </div>
        </>
      )}
    </div>
  );
}

function SpectrumBars() {
  const audioBandEnergies = useAppStore((s) => s.audioBandEnergies);
  const bandColors = [
    "#ff4444",
    "#ff8844",
    "#ffcc44",
    "#44ff44",
    "#44ffcc",
    "#4488ff",
    "#cc44ff",
  ];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: 2,
        height: 48,
        padding: "4px 0",
      }}
    >
      {STANDARD_BANDS.map((band, i) => {
        const val = audioBandEnergies[band.name] ?? 0;
        return (
          <div
            key={band.name}
            style={{
              flex: 1,
              height: `${Math.max(2, val * 100)}%`,
              background: bandColors[i],
              borderRadius: 2,
              transition: "height 60ms linear",
              opacity: 0.85,
            }}
            title={`${band.name}: ${(val * 100).toFixed(1)}%`}
          />
        );
      })}
    </div>
  );
}

function TransportButton({
  onClick,
  label,
  active,
}: {
  onClick: () => void;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "3px 10px",
        fontSize: 11,
        background: active ? "var(--accent-teal)" : "var(--surface-container-low)",
        border: "1px solid var(--outline-variant)",
        color: active ? "var(--on-secondary)" : "var(--text-primary)",
        borderRadius: 3,
        cursor: "pointer",
        fontWeight: active ? 600 : 400,
      }}
    >
      {label}
    </button>
  );
}

function BeatDot({
  label,
  active,
  color,
}: {
  label: string;
  active: boolean;
  color: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: active ? color : "var(--surface-container-low)",
          boxShadow: active ? `0 0 6px ${color}` : "none",
          transition: "all 80ms",
        }}
      />
      <span style={{ fontSize: 9, color: "var(--text-muted)" }}>{label}</span>
    </div>
  );
}
