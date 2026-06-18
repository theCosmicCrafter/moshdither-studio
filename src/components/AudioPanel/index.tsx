import React, { useRef, useCallback } from "react";
import { useAppStore } from "../../store";
import { useAudioEngine } from "../../hooks/useAudioEngine";
import { STANDARD_BANDS } from "../../engine/audio/types";

export default function AudioPanel() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    audioEnabled,
    audioPlaying,
    audioVolume,
    audioBpm,
    audioBandEnergies,
    audioBeatFlags,
    audioFilePath,
  } = useAppStore((s) => ({
    audioEnabled: s.audioEnabled,
    audioPlaying: s.audioPlaying,
    audioVolume: s.audioVolume,
    audioBpm: s.audioBpm,
    audioBandEnergies: s.audioBandEnergies,
    audioBeatFlags: s.audioBeatFlags,
    audioFilePath: s.audioFilePath,
  }));

  const setAudioEnabled = useAppStore((s) => s.setAudioEnabled);
  const setAudioVolume = useAppStore((s) => s.setAudioVolume);
  const setAudioFilePath = useAppStore((s) => s.setAudioFilePath);

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
      setAudioEnabled(true);
      setAudioFilePath(file.name);
      await loadAudioFile(file);
    },
    [loadAudioFile, setAudioEnabled, setAudioFilePath]
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (!file || !file.type.startsWith("audio/")) return;
      setAudioEnabled(true);
      setAudioFilePath(file.name);
      await loadAudioFile(file);
    },
    [loadAudioFile, setAudioEnabled, setAudioFilePath]
  );

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
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>Audio Reactive</span>
        <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={audioEnabled}
            onChange={(e) => setAudioEnabled(e.target.checked)}
          />
          <span>On</span>
        </label>
      </div>

      {!audioEnabled ? (
        <div style={{ color: "#888", textAlign: "center", padding: "12px 0" }}>
          Enable audio reactive to start
        </div>
      ) : (
        <>
          {/* File drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: "2px dashed #444",
              borderRadius: 4,
              padding: "10px 6px",
              textAlign: "center",
              cursor: "pointer",
              fontSize: 11,
              color: audioFilePath ? "#6cf" : "#888",
            }}
          >
            {audioFilePath || "Drop audio file or click to browse"}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            aria-label="Select audio file"
            style={{ display: "none" }}
            onChange={handleFile}
          />

          {/* Mic toggle */}
          <button
            onClick={startMicrophone}
            style={{
              padding: "4px 8px",
              fontSize: 11,
              background: "#333",
              border: "1px solid #555",
              color: "#ddd",
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
            <div style={{ textAlign: "center", color: "#6cf", fontSize: 11 }}>
              BPM: {Math.round(audioBpm)}
            </div>
          )}

          {/* Beat indicators */}
          <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
            <BeatDot label="Bass" active={audioBeatFlags.bass} color="#ff4444" />
            <BeatDot label="Mid" active={audioBeatFlags.mid} color="#44ff44" />
            <BeatDot label="Treble" active={audioBeatFlags.treble} color="#4488ff" />
          </div>

          {/* Spectrum bars */}
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
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 9,
              color: "#666",
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
        background: active ? "#4a90d9" : "#333",
        border: "1px solid #555",
        color: "#fff",
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
          background: active ? color : "#333",
          boxShadow: active ? `0 0 6px ${color}` : "none",
          transition: "all 80ms",
        }}
      />
      <span style={{ fontSize: 9, color: "#888" }}>{label}</span>
    </div>
  );
}
