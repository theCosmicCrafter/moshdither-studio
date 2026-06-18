import React, { useRef, useCallback } from "react";
import { useAppStore } from "../../store";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  StepBack,
  StepForward,
  Repeat,
  Gauge,
} from "lucide-react";

export default function Timeline() {
  const currentTime = useAppStore((s) => s.currentTime);
  const setCurrentTime = useAppStore((s) => s.setCurrentTime);
  const audioPlaying = useAppStore((s) => s.audioPlaying);
  const audioFilePath = useAppStore((s) => s.audioFilePath);
  const audioBpm = useAppStore((s) => s.audioBpm);
  const playbackSpeed = useAppStore((s) => s.playbackSpeed);
  const setPlaybackSpeed = useAppStore((s) => s.setPlaybackSpeed);

  const scrubberRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const duration = 300; // Placeholder: 5 minutes max; will be replaced with actual media duration
  const fps = 30;
  const currentFrame = Math.floor(currentTime * fps);

  const handleScrub = useCallback(
    (clientX: number) => {
      const el = scrubberRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      setCurrentTime(pct * duration);
    },
    [duration, setCurrentTime]
  );

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      isDragging.current = true;
      handleScrub(e.clientX);
    },
    [handleScrub]
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging.current) return;
      handleScrub(e.clientX);
    },
    [handleScrub]
  );

  const onMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  const formatTime = (t: number) => {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    const ms = Math.floor((t % 1) * 100);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "6px 10px",
        background: "#151515",
        borderTop: "1px solid #333",
        userSelect: "none",
      }}
    >
      {/* Transport row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* Time display */}
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "#ccc",
            minWidth: 90,
            textAlign: "center",
          }}
        >
          <span style={{ color: "#6cf" }}>{formatTime(currentTime)}</span>
          <span style={{ color: "#666", margin: "0 4px" }}>/</span>
          <span style={{ color: "#888" }}>{formatTime(duration)}</span>
        </div>

        {/* Frame counter */}
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "#888",
            minWidth: 70,
          }}
        >
          F:{currentFrame.toString().padStart(5, "0")}
        </div>

        {/* BPM */}
        {audioBpm && (
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "#6cf",
              minWidth: 50,
            }}
          >
            {Math.round(audioBpm)} BPM
          </div>
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Transport buttons */}
        <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
          <TButton icon={<SkipBack size={14} />} onClick={() => setCurrentTime(0)} title="Go to start" />
          <TButton icon={<StepBack size={14} />} onClick={() => setCurrentTime(Math.max(0, currentTime - 1 / fps))} title="Previous frame" />
          <TButton icon={audioPlaying ? <Pause size={14} /> : <Play size={14} />} onClick={() => {}} title={audioPlaying ? "Pause" : "Play"} active />
          <TButton icon={<StepForward size={14} />} onClick={() => setCurrentTime(Math.min(duration, currentTime + 1 / fps))} title="Next frame" />
          <TButton icon={<SkipForward size={14} />} onClick={() => setCurrentTime(duration)} title="Go to end" />
          <TButton icon={<Repeat size={14} />} onClick={() => {}} title="Loop" />

          {/* Speed selector */}
          <div style={{ display: "flex", alignItems: "center", gap: 2, marginLeft: 4 }}>
            <Gauge size={10} style={{ color: "#888" }} />
            <select
              aria-label="Playback speed"
              title="Playback speed"
              value={playbackSpeed}
              onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
              style={{
                fontSize: 10,
                padding: "1px 4px",
                borderRadius: 3,
                border: "1px solid #333",
                background: "#222",
                color: "#ccc",
                cursor: "pointer",
                fontFamily: "var(--font-mono)",
              }}
            >
              <option value={0.25}>0.25x</option>
              <option value={0.5}>0.5x</option>
              <option value={1}>1x</option>
              <option value={1.5}>1.5x</option>
              <option value={2}>2x</option>
              <option value={4}>4x</option>
            </select>
          </div>
        </div>

        {/* Audio file name */}
        {audioFilePath && (
          <div
            style={{
              fontSize: 10,
              color: "#6cf",
              maxWidth: 120,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              marginLeft: 8,
            }}
            title={audioFilePath}
          >
            {audioFilePath}
          </div>
        )}
      </div>

      {/* Scrubber */}
      <div
        ref={scrubberRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        style={{
          height: 16,
          background: "#222",
          borderRadius: 3,
          position: "relative",
          cursor: "pointer",
        }}
      >
        {/* Progress fill */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${(currentTime / duration) * 100}%`,
            background: "linear-gradient(90deg, #2a5a8a, #4a90d9)",
            borderRadius: 3,
            opacity: 0.6,
          }}
        />

        {/* Playhead */}
        <div
          style={{
            position: "absolute",
            left: `${(currentTime / duration) * 100}%`,
            top: -2,
            bottom: -2,
            width: 2,
            background: "#fff",
            boxShadow: "0 0 4px #4a90d9",
            transform: "translateX(-50%)",
            borderRadius: 1,
          }}
        />

        {/* Tick marks every second */}
        {Array.from({ length: Math.floor(duration) }).map((_, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${(i / duration) * 100}%`,
              top: 0,
              bottom: 0,
              width: 1,
              background: i % 10 === 0 ? "#555" : "#333",
            }}
          />
        ))}
      </div>
    </div>
  );
}

function TButton({
  icon,
  onClick,
  title,
  active,
}: {
  icon: React.ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 24,
        height: 24,
        borderRadius: 3,
        border: "none",
        background: active ? "rgba(74, 144, 217, 0.25)" : "transparent",
        color: active ? "#6cf" : "#aaa",
        cursor: "pointer",
      }}
    >
      {icon}
    </button>
  );
}
