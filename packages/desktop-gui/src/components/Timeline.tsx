import * as React from "react";
import { useStudio } from "../context/StudioContext";
import { AudioWaveform } from "./organisms/AudioWaveform";

interface TimelineProps {
  duration: number;
  currentTime: number;
  onTimeChange: (time: number | ((prev: number) => number)) => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const f = Math.floor((seconds % 1) * 30);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}:${f.toString().padStart(2, "0")}`;
}

export const Timeline: React.FC<TimelineProps> = ({ duration, currentTime, onTimeChange }) => {
  const { isPlaying, setIsPlaying, mediaUrl, inTime, outTime, setInTime, setOutTime } = useStudio();
  const trackRef = React.useRef<HTMLDivElement>(null);
  const animRef = React.useRef<number>(0);
  const lastTimeRef = React.useRef<number>(0);

  // Playback loop with in/out range
  React.useEffect(() => {
    if (!isPlaying) {
      cancelAnimationFrame(animRef.current);
      return;
    }
    lastTimeRef.current = performance.now();
    const effectiveOut = outTime > inTime ? outTime : duration;
    const tick = (now: number) => {
      const delta = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;
      onTimeChange((prev) => {
        const next = prev + delta;
        if (next >= effectiveOut) {
          setIsPlaying(false);
          return effectiveOut;
        }
        return next;
      });
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [isPlaying, duration, onTimeChange, setIsPlaying, inTime, outTime]);

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!trackRef.current || duration <= 0) return;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onTimeChange(ratio * duration);
  };

  const handleStep = (direction: number) => {
    onTimeChange(Math.max(0, Math.min(duration, currentTime + direction * (1 / 30))));
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "12px 16px",
        background: "var(--surface-base, #0e0e14)",
        borderTop: "1px solid var(--border-subtle, rgba(255,255,255,0.06))",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {/* Transport buttons */}
        <div style={{ display: "flex", gap: 4 }}>
          <TransportButton onClick={() => onTimeChange(0)} label="⏮" title="Go to start" />
          <TransportButton onClick={() => handleStep(-1)} label="⏴" title="Previous frame" />
          <TransportButton
            onClick={() => setIsPlaying(!isPlaying)}
            label={isPlaying ? "⏸" : "▶"}
            title={isPlaying ? "Pause" : "Play"}
            active={isPlaying}
          />
          <TransportButton onClick={() => handleStep(1)} label="⏵" title="Next frame" />
          <TransportButton onClick={() => onTimeChange(duration)} label="⏭" title="Go to end" />
        </div>

        {/* Time display */}
        <div
          style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 13,
            color: "var(--text-primary, #e8e8ed)",
            minWidth: 160,
            textAlign: "center",
          }}
        >
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>

        {/* In/Out buttons */}
        <div style={{ display: "flex", gap: 4 }}>
          <TransportButton
            onClick={() => setInTime(currentTime)}
            label="["
            title="Set In point"
            active={Math.abs(currentTime - inTime) < 0.05}
          />
          <TransportButton
            onClick={() => setOutTime(currentTime)}
            label="]"
            title="Set Out point"
            active={Math.abs(currentTime - outTime) < 0.05}
          />
          <TransportButton
            onClick={() => { setInTime(0); setOutTime(0); }}
            label="✕"
            title="Clear In/Out"
          />
        </div>

        {/* Zoom slider */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>Zoom</span>
          <input
            type="range"
            aria-label="Timeline zoom"
            min={1}
            max={10}
            step={0.5}
            defaultValue={1}
            onChange={(e) => {
              // Zoom is stored on the track container via a data attribute for CSS
              const track = trackRef.current;
              if (track) track.dataset.zoom = e.target.value;
            }}
            style={{ width: 80 }}
          />
        </div>
      </div>

      {/* Audio waveform synced to timeline */}
      <AudioWaveform
        mediaUrl={mediaUrl}
        currentTime={currentTime}
        duration={duration}
        isPlaying={isPlaying}
        onSeek={(t) => onTimeChange(t)}
      />

      {/* Scrubber track */}
      <div
        ref={trackRef}
        onClick={handleTrackClick}
        style={{
          height: 20,
          background: "rgba(255,255,255,0.04)",
          borderRadius: 4,
          cursor: "pointer",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* In/Out range highlight */}
        {inTime < outTime && duration > 0 && (
          <div
            style={{
              position: "absolute",
              left: `${(inTime / duration) * 100}%`,
              width: `${((outTime - inTime) / duration) * 100}%`,
              top: 0,
              bottom: 0,
              background: "rgba(10,132,255,0.15)",
            }}
          />
        )}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${progress}%`,
            background: "var(--accent-primary, #0a84ff)",
            borderRadius: 4,
            opacity: 0.6,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: `${progress}%`,
            top: "50%",
            transform: "translate(-50%, -50%)",
            width: 12,
            height: 12,
            background: "var(--accent-primary, #0a84ff)",
            borderRadius: "50%",
            boxShadow: "0 0 8px rgba(10,132,255,0.5)",
          }}
        />
        {/* In marker */}
        {duration > 0 && inTime > 0 && (
          <div
            style={{
              position: "absolute",
              left: `${(inTime / duration) * 100}%`,
              top: 0,
              bottom: 0,
              width: 2,
              background: "var(--accent-warning, #ff9f0a)",
            }}
          />
        )}
        {/* Out marker */}
        {duration > 0 && outTime > 0 && (
          <div
            style={{
              position: "absolute",
              left: `${(outTime / duration) * 100}%`,
              top: 0,
              bottom: 0,
              width: 2,
              background: "var(--accent-error, #ff453a)",
            }}
          />
        )}
      </div>
    </div>
  );
};

const TransportButton: React.FC<{
  onClick: () => void;
  label: string;
  title: string;
  active?: boolean;
}> = ({ onClick, label, title, active }) => (
  <button
    onClick={onClick}
    title={title}
    style={{
      width: 32,
      height: 32,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: active ? "var(--accent-primary, #0a84ff)" : "rgba(255,255,255,0.06)",
      border: "none",
      borderRadius: 6,
      color: "#fff",
      cursor: "pointer",
      fontSize: 14,
    }}
  >
    {label}
  </button>
);
