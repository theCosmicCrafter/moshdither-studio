import React, { useRef, useCallback } from "react";
import { useAppStore } from "../../store";
import { getFileName } from "../../utils/fileName";

export default function Timeline() {
  const currentTime = useAppStore((s) => s.currentTime);
  const setCurrentTime = useAppStore((s) => s.setCurrentTime);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const togglePlay = useAppStore((s) => s.togglePlay);
  const loopMode = useAppStore((s) => s.loopMode);
  const setLoopMode = useAppStore((s) => s.setLoopMode);
  const duration = useAppStore((s) => s.duration);
  const setDuration = useAppStore((s) => s.setDuration);
  const audioFilePath = useAppStore((s) => s.audioFilePath);
  const audioBpm = useAppStore((s) => s.audioBpm);
  const playbackSpeed = useAppStore((s) => s.playbackSpeed);
  const setPlaybackSpeed = useAppStore((s) => s.setPlaybackSpeed);
  const inPoint = useAppStore((s) => s.inPoint);
  const outPoint = useAppStore((s) => s.outPoint);
  const setInPoint = useAppStore((s) => s.setInPoint);
  const setOutPoint = useAppStore((s) => s.setOutPoint);
  const clearInOut = useAppStore((s) => s.clearInOut);

  const scrubberRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

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
      className="neo-flat rounded-lg mx-1 mb-1 bg-surface/80 backdrop-blur-xl flex flex-col gap-1 select-none"
      style={{ padding: "6px 10px" }}
    >
      {/* Transport row */}
      <div className="flex items-center gap-2">
        {/* Time display */}
        <div className="font-code-sm text-code-sm text-on-surface min-w-[90px] text-center">
          <span className="text-accent-teal">{formatTime(currentTime)}</span>
          <span className="text-outline-variant mx-1">/</span>
          <span className="text-on-surface-variant">{formatTime(duration)}</span>
        </div>

        {/* Frame counter */}
        <div className="font-data-micro text-data-micro text-on-surface-variant min-w-[70px]">
          F:{currentFrame.toString().padStart(5, "0")}
        </div>

        {/* In/Out buttons */}
        <div className="flex gap-1 items-center">
          <button
            onClick={() => setInPoint(Math.round(currentTime))}
            title="Set in point (I)"
            className="font-data-micro text-data-micro rounded px-1 cursor-pointer transition-all"
            style={{
              border: "1px solid var(--cat-analog)",
              background: inPoint !== null ? "rgba(255, 215, 0, 0.15)" : "transparent",
              color: "var(--cat-analog)",
            }}
          >
            IN
          </button>
          <button
            onClick={() => setOutPoint(Math.round(currentTime))}
            title="Set out point (O)"
            className="font-data-micro text-data-micro rounded px-1 cursor-pointer transition-all"
            style={{
              border: "1px solid var(--accent-pink)",
              background: outPoint !== null ? "rgba(255, 173, 224, 0.15)" : "transparent",
              color: "var(--accent-pink)",
            }}
          >
            OUT
          </button>
          {(inPoint !== null || outPoint !== null) && (
            <button
              onClick={() => clearInOut()}
              title="Clear in/out (X)"
              className="font-data-micro text-data-micro rounded px-1 cursor-pointer text-on-surface-variant hover:text-accent-pink transition-colors"
              style={{ border: "1px solid var(--outline-variant)", background: "transparent" }}
            >
              CLR
            </button>
          )}
        </div>

        {/* BPM */}
        {audioBpm && (
          <div className="font-data-micro text-data-micro text-accent-teal min-w-[50px]">
            {Math.round(audioBpm)} BPM
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Transport buttons */}
        <div className="flex gap-1 items-center">
          <TButton icon="skip_previous" onClick={() => setCurrentTime(inPoint ?? 0)} title="Go to in point" />
          <TButton icon="chevron_left" onClick={() => setCurrentTime(Math.max(inPoint ?? 0, currentTime - 1 / fps))} title="Previous frame" />
          <TButton icon={isPlaying ? "pause" : "play_arrow"} onClick={togglePlay} title={isPlaying ? "Pause" : "Play"} active />
          <TButton icon="chevron_right" onClick={() => setCurrentTime(Math.min(outPoint ?? duration, currentTime + 1 / fps))} title="Next frame" />
          <TButton icon="skip_next" onClick={() => setCurrentTime(outPoint ?? duration)} title="Go to out point" />
          <TButton icon="repeat" onClick={() => setLoopMode(loopMode === "off" ? "loop" : loopMode === "loop" ? "pingpong" : "off")} title={`Loop: ${loopMode}`} active={loopMode !== "off"} />

          {/* Speed selector */}
          <div className="flex items-center gap-1 ml-1">
            <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 12 }}>
              speed
            </span>
            <select
              aria-label="Playback speed"
              title="Playback speed"
              value={playbackSpeed}
              onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
              className="themed-select font-data-micro text-data-micro cursor-pointer"
            >
              <option value={0.25}>0.25x</option>
              <option value={0.5}>0.5x</option>
              <option value={1}>1x</option>
              <option value={1.5}>1.5x</option>
              <option value={2}>2x</option>
              <option value={4}>4x</option>
            </select>
          </div>

          {/* Clip length input */}
          <div className="flex items-center gap-1 ml-1">
            <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 12 }}>
              timer
            </span>
            <input
              type="number"
              min={0.1}
              step={0.5}
              value={duration}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setDuration(isNaN(val) ? 1 : Math.max(0.1, val));
              }}
              className="themed-select font-data-micro text-data-micro w-[60px] text-center"
              title="Clip length (seconds)"
            />
            <span className="font-data-micro text-data-micro text-on-surface-variant">s</span>
          </div>
        </div>

        {/* Audio file name */}
        {audioFilePath && (
          <div
            className="font-label-sm text-label-sm text-accent-teal max-w-[120px] overflow-hidden text-ellipsis whitespace-nowrap ml-2"
            title={audioFilePath}
          >
            {getFileName(audioFilePath)}
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
        className="neo-flat rounded relative cursor-pointer"
        style={{ height: 16 }}
      >
        {/* Progress fill */}
        <div
          className="absolute left-0 top-0 bottom-0 rounded opacity-60"
          style={{
            width: `${(currentTime / duration) * 100}%`,
            background: "linear-gradient(90deg, var(--accent-pink), var(--accent-gold))",
          }}
        />

        {/* In point marker */}
        {inPoint !== null && (
          <div
            title={`In point: ${formatTime(inPoint)}`}
            className="absolute top-[-2px] bottom-[-2px] rounded z-[2]"
            style={{
              left: `${(inPoint / duration) * 100}%`,
              width: 2,
              background: "var(--cat-analog)",
              boxShadow: "0 0 4px var(--cat-analog)",
              transform: "translateX(-50%)",
            }}
          />
        )}

        {/* Out point marker */}
        {outPoint !== null && (
          <div
            title={`Out point: ${formatTime(outPoint)}`}
            className="absolute top-[-2px] bottom-[-2px] rounded z-[2]"
            style={{
              left: `${(outPoint / duration) * 100}%`,
              width: 2,
              background: "var(--accent-pink)",
              boxShadow: "0 0 4px var(--accent-pink)",
              transform: "translateX(-50%)",
            }}
          />
        )}

        {/* Playhead */}
        <div
          className="absolute top-[-2px] bottom-[-2px] rounded z-[3]"
          style={{
            left: `${(currentTime / duration) * 100}%`,
            width: 2,
            background: "var(--on-surface)",
            boxShadow: "0 0 4px var(--accent-pink)",
            transform: "translateX(-50%)",
          }}
        />

        {/* Tick marks every second */}
        {Array.from({ length: Math.floor(duration) }).map((_, i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0"
            style={{
              left: `${(i / duration) * 100}%`,
              width: 1,
              background: i % 10 === 0 ? "var(--outline-variant)" : "var(--outline)",
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
  icon: string;
  onClick: () => void;
  title: string;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`material-symbols-outlined neo-btn rounded-md flex items-center justify-center transition-colors overflow-hidden ${active ? "neo-pressed text-accent-pink" : "text-on-surface-variant hover:text-accent-teal"}`}
      style={{ width: 28, height: 28, fontSize: 16, lineHeight: 1 }}
    >
      {icon}
    </button>
  );
}
