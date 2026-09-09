import React, { useRef, useCallback, useMemo } from "react";
import { useAppStore } from "../../store";
import { getFileName } from "../../utils/fileName";
import { formatTimecode as formatTime } from "../../utils/timecode";
import { playbackFps } from "../../hooks/usePlaybackEngine";

/**
 * The transport strip: one bar pinned under the preview that owns time.
 *
 * It used to be a dock panel -- the bottom 30 % of the centre column for
 * ~55 px of controls, with a tab header above and an empty strip beneath.
 * That is a DAW's information architecture for a tool whose loop is
 * open -> stack -> tweak -> export. MoshPro, the stated benchmark, puts a
 * scrubber and transport under the picture and nothing else; so does every
 * NLE's source monitor. Now it is that.
 *
 * It also draws what the app already knew about time and never showed:
 * every keyframe on every parameter (click to jump, right-click to delete),
 * and in/out handles you can DRAG instead of only stamping at the playhead.
 */

type DragTarget = "playhead" | "in" | "out";

interface KeyframeMark {
  time: number;
  refs: { stackId: string; paramId: string; id: string }[];
}

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
  const isVideo = useAppStore((s) => s.isVideo);
  const mediaFps = useAppStore((s) => s.mediaFps);
  const animateFps = useAppStore((s) => s.animateFps);
  const keyframes = useAppStore((s) => s.keyframes);
  const removeKeyframe = useAppStore((s) => s.removeKeyframe);

  const scrubberRef = useRef<HTMLDivElement>(null);
  const dragTarget = useRef<DragTarget | null>(null);

  // The clip's own rate for video, the animation's for a still. A hardcoded
  // 30 here numbered frames that did not exist on a 24 fps clip.
  const fps = playbackFps({ isVideo, mediaFps, animateFps });
  const currentFrame = Math.floor(currentTime * fps + 1e-6);
  const minGap = 1 / fps;

  // One diamond per distinct time, whatever it animates. The parameter panel
  // can add a keyframe on any slider; until now nothing ever drew one, so the
  // only way to find a keyframe was to land the playhead within 10 ms of it.
  const keyframeMarks = useMemo<KeyframeMark[]>(() => {
    const byTime = new Map<number, KeyframeMark["refs"]>();
    for (const [stackId, tracks] of Object.entries(keyframes)) {
      for (const [paramId, list] of Object.entries(tracks)) {
        for (const k of list) {
          const key = Math.round(k.time * 1000) / 1000;
          const refs = byTime.get(key) ?? [];
          refs.push({ stackId, paramId, id: k.id });
          byTime.set(key, refs);
        }
      }
    }
    return [...byTime.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([time, refs]) => ({ time, refs }));
  }, [keyframes]);

  const timeAt = useCallback(
    (clientX: number): number | null => {
      const el = scrubberRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return null;
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return pct * duration;
    },
    [duration]
  );

  const applyDrag = useCallback(
    (target: DragTarget, t: number) => {
      if (target === "playhead") {
        setCurrentTime(t);
      } else if (target === "in") {
        // Never let the handles cross: the store nulls the other point when
        // they do, which would make a drag past it silently drop the range.
        setInPoint(Math.min(t, (outPoint ?? duration) - minGap));
      } else {
        setOutPoint(Math.max(t, (inPoint ?? 0) + minGap));
      }
    },
    [setCurrentTime, setInPoint, setOutPoint, inPoint, outPoint, duration, minGap]
  );

  // Pointer capture on the bar keeps every move flowing to one handler and
  // keeps the drag alive when the pointer leaves a 16 px strip -- with mouse
  // events the scrub stopped the moment the cursor strayed, which was always.
  const startDrag = useCallback(
    (target: DragTarget, e: React.PointerEvent) => {
      dragTarget.current = target;
      try {
        scrubberRef.current?.setPointerCapture(e.pointerId);
      } catch {
        // jsdom has no pointer capture; the drag still works inside the bar
      }
      const t = timeAt(e.clientX);
      if (t !== null) applyDrag(target, t);
    },
    [timeAt, applyDrag]
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => startDrag("playhead", e),
    [startDrag]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const target = dragTarget.current;
      if (!target) return;
      const t = timeAt(e.clientX);
      if (t !== null) applyDrag(target, t);
    },
    [timeAt, applyDrag]
  );

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragTarget.current = null;
    try {
      scrubberRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // see above
    }
  }, []);

  const pct = (t: number) => `${(Math.max(0, Math.min(duration, t)) / duration) * 100}%`;

  return (
    <div
      data-testid="transport-strip"
      className="neo-flat rounded-lg mx-1 mb-1 bg-surface/80 backdrop-blur-xl flex flex-col gap-1 select-none flex-shrink-0"
      style={{ padding: "4px 10px" }}
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
            onClick={() => setInPoint(currentTime)}
            title="Set in point (I)"
            className="font-data-micro text-data-micro rounded px-1 cursor-pointer transition"
            style={{
              border: "1px solid var(--cat-analog)",
              background: inPoint !== null ? "rgba(255, 215, 0, 0.15)" : "transparent",
              color: "var(--cat-analog)",
            }}
          >
            IN
          </button>
          <button
            onClick={() => setOutPoint(currentTime)}
            title="Set out point (O)"
            className="font-data-micro text-data-micro rounded px-1 cursor-pointer transition"
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

        {/* Keyframe count -- the diamonds on the bar are the real UI */}
        {keyframeMarks.length > 0 && (
          <div
            className="font-data-micro text-data-micro text-accent-teal"
            title="Keyframes on the bar: click one to jump to it, right-click to delete it"
          >
            ◆ {keyframeMarks.length}
          </div>
        )}

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

          {/* Animation length -- stills only. A video's length is the video's;
              offering to edit it here just overwrote the probed duration with
              whatever was typed and lied to the export. */}
          {!isVideo && (
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
                title="Animation length (seconds)"
              />
              <span className="font-data-micro text-data-micro text-on-surface-variant">s</span>
            </div>
          )}
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
        data-testid="timeline-scrubber"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="neo-flat rounded relative cursor-pointer"
        style={{ height: 16, touchAction: "none" }}
      >
        {/* Progress fill */}
        <div
          className="absolute left-0 top-0 bottom-0 rounded opacity-60"
          style={{
            width: pct(currentTime),
            background: "linear-gradient(90deg, var(--accent-pink), var(--accent-gold))",
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

        {/* Trimmed-out range, dimmed */}
        {inPoint !== null && (
          <div className="absolute top-0 bottom-0 left-0 bg-black/40 rounded-l" style={{ width: pct(inPoint) }} />
        )}
        {outPoint !== null && (
          <div className="absolute top-0 bottom-0 right-0 bg-black/40 rounded-r" style={{ left: pct(outPoint) }} />
        )}

        {/* Keyframe diamonds */}
        {keyframeMarks.map((m) => {
          const atPlayhead = Math.abs(m.time - currentTime) < 0.01;
          const n = m.refs.length;
          return (
            <button
              key={m.time}
              type="button"
              aria-label={`Keyframe at ${formatTime(m.time)}`}
              title={`Keyframe at ${formatTime(m.time)} -- ${n} parameter${n === 1 ? "" : "s"}. Click to jump, right-click to delete`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setCurrentTime(m.time);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                for (const r of m.refs) removeKeyframe(r.stackId, r.paramId, r.id);
              }}
              className="absolute z-[4] p-0 cursor-pointer"
              style={{
                left: pct(m.time),
                top: 4,
                width: 8,
                height: 8,
                transform: "translateX(-50%) rotate(45deg)",
                background: atPlayhead ? "var(--accent-gold)" : "var(--accent-teal)",
                border: "1px solid var(--surface)",
                boxShadow: atPlayhead ? "0 0 4px var(--accent-gold)" : "none",
              }}
            />
          );
        })}

        {/* In point handle */}
        {inPoint !== null && (
          <div
            data-testid="timeline-in-handle"
            title={`In point ${formatTime(inPoint)} -- drag to move`}
            onPointerDown={(e) => {
              e.stopPropagation();
              startDrag("in", e);
            }}
            className="absolute top-[-3px] bottom-[-3px] rounded-sm z-[5] cursor-ew-resize"
            style={{
              left: pct(inPoint),
              width: 6,
              background: "var(--cat-analog)",
              boxShadow: "0 0 4px var(--cat-analog)",
              transform: "translateX(-50%)",
            }}
          />
        )}

        {/* Out point handle */}
        {outPoint !== null && (
          <div
            data-testid="timeline-out-handle"
            title={`Out point ${formatTime(outPoint)} -- drag to move`}
            onPointerDown={(e) => {
              e.stopPropagation();
              startDrag("out", e);
            }}
            className="absolute top-[-3px] bottom-[-3px] rounded-sm z-[5] cursor-ew-resize"
            style={{
              left: pct(outPoint),
              width: 6,
              background: "var(--accent-pink)",
              boxShadow: "0 0 4px var(--accent-pink)",
              transform: "translateX(-50%)",
            }}
          />
        )}

        {/* Playhead */}
        <div
          className="absolute top-[-2px] bottom-[-2px] rounded z-[3] pointer-events-none"
          style={{
            left: pct(currentTime),
            width: 2,
            background: "var(--on-surface)",
            boxShadow: "0 0 4px var(--accent-pink)",
            transform: "translateX(-50%)",
          }}
        />
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
