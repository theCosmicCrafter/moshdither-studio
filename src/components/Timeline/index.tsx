import React, { useRef, useCallback, useMemo, useState, useEffect } from "react";
import { useAppStore, type EasingType, type Keyframe, type LfoSpec } from "../../store";
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
 * every keyframe on every parameter (click to jump, right-click for easing
 * and delete), and in/out handles you can DRAG instead of only stamping at
 * the playhead.
 */

type DragTarget = "playhead" | "in" | "out";

interface KeyframeMark {
  time: number;
  refs: { stackId: string; paramId: string; id: string; easing: EasingType }[];
}

/** Every easing a keyframe can have, in the order the menu lists them. */
const EASINGS: { id: EasingType; label: string }[] = [
  { id: "linear", label: "Linear" },
  { id: "easeIn", label: "Ease in" },
  { id: "easeOut", label: "Ease out" },
  { id: "easeInOut", label: "Ease in-out" },
  { id: "hold", label: "Hold" },
];

/**
 * One slim lane under the scrubber per MODULATED parameter -- a param earns
 * a lane when it has at least one keyframe or an LFO spec, which keeps the
 * strip at zero extra rows for the common un-animated stack. `key` is the
 * `${stackId}.${paramId}` pair the menus and drags address markers by.
 */
interface ParamLane {
  key: string;
  stackId: string;
  paramId: string;
  label: string;
  keys: Keyframe[];
  lfo?: LfoSpec;
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
  const mediaLoaded = useAppStore((s) => s.mediaLoaded);
  const setAnimateDialogOpen = useAppStore((s) => s.setAnimateDialogOpen);
  const randomizeStack = useAppStore((s) => s.randomizeStack);
  const mediaFps = useAppStore((s) => s.mediaFps);
  const animateFps = useAppStore((s) => s.animateFps);
  const keyframes = useAppStore((s) => s.keyframes);
  const removeKeyframe = useAppStore((s) => s.removeKeyframe);
  const updateKeyframe = useAppStore((s) => s.updateKeyframe);
  const lfos = useAppStore((s) => s.lfos);
  const removeLfo = useAppStore((s) => s.removeLfo);
  const effectStack = useAppStore((s) => s.effectStack);
  const allEffects = useAppStore((s) => s.allEffects);
  const selectStackItem = useAppStore((s) => s.selectStackItem);

  // The keyframe menu: which mark it is for and where on the bar it sits.
  // Right-click used to delete outright, with no way to choose an easing --
  // the store has had five easings since keyframes existed and nothing set
  // any but linear.
  const [menu, setMenu] = useState<{ mark: KeyframeMark; leftPct: number; laneKey?: string } | null>(
    null
  );
  // LFO lane context menu: no keyframe to address, so it carries the lane's
  // stack/param ids directly. Rendered by the lane that opened it.
  const [lfoMenu, setLfoMenu] = useState<{
    stackId: string;
    paramId: string;
    leftPct: number;
    laneKey: string;
  } | null>(null);
  useEffect(() => {
    if (!menu && !lfoMenu) return;
    const close = () => {
      setMenu(null);
      setLfoMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu, lfoMenu]);

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
          refs.push({ stackId, paramId, id: k.id, easing: k.easing });
          byTime.set(key, refs);
        }
      }
    }
    return [...byTime.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([time, refs]) => ({ time, refs }));
  }, [keyframes]);

  // The per-param lanes. Computed before the still-mode branch on purpose:
  // keyframes and LFOs animate a still over its duration exactly like a
  // video, so the lanes are the ONLY time-aware UI stills get.
  const lanes = useMemo<ParamLane[]>(() => {
    const out: ParamLane[] = [];
    for (const entry of effectStack) {
      const tracks = keyframes[entry.id] ?? {};
      const specs = lfos[entry.id] ?? {};
      const paramIds = [...new Set([...Object.keys(tracks), ...Object.keys(specs)])];
      if (paramIds.length === 0) continue;
      const meta = allEffects.find((e) => e.id === entry.effectId);
      // Declaration order, then whatever is left: lanes shouldn't reshuffle
      // between renders just because a track gained its first keyframe.
      const order = meta?.parameters.map((p) => p.id) ?? [];
      paramIds.sort((a, b) => {
        const ia = order.indexOf(a);
        const ib = order.indexOf(b);
        return (ia < 0 ? order.length : ia) - (ib < 0 ? order.length : ib) || a.localeCompare(b);
      });
      for (const paramId of paramIds) {
        const keys = tracks[paramId] ?? [];
        const lfo = specs[paramId];
        if (keys.length === 0 && !lfo) continue;
        const pname = meta?.parameters.find((p) => p.id === paramId)?.name ?? paramId;
        out.push({
          key: `${entry.id}.${paramId}`,
          stackId: entry.id,
          paramId,
          label: `${entry.effectName} · ${pname}`,
          keys: [...keys].sort((a, b) => a.time - b.time),
          lfo,
        });
      }
    }
    return out;
  }, [effectStack, keyframes, lfos, allEffects]);

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

  // One action funnel for both places a keyframe menu can be opened from:
  // the merged diamonds on the scrubber and the per-param markers in a lane.
  const handleMenuAction = (action: LaneMenuAction) => {
    if (action.type === "easing") {
      for (const r of action.mark.refs)
        updateKeyframe(r.stackId, r.paramId, r.id, { easing: action.easing });
    } else {
      for (const r of action.mark.refs) removeKeyframe(r.stackId, r.paramId, r.id);
    }
    setMenu(null);
  };

  // Shared by the video strip (under the scrubber) and the stills strip --
  // built once so both modes run the identical lane UI.
  const lanesEl =
    lanes.length > 0 ? (
      <div
        data-testid="param-lanes"
        className="flex flex-col"
        style={{ gap: 2, marginTop: 2 }}
      >
        {lanes.map((lane) => (
          <ParamLaneRow
            key={lane.key}
            lane={lane}
            duration={duration}
            fps={fps}
            currentTime={currentTime}
            menu={menu?.laneKey === lane.key ? menu : null}
            lfoMenu={lfoMenu?.laneKey === lane.key ? lfoMenu : null}
            onSelect={() => selectStackItem(lane.stackId)}
            onJump={(t) => setCurrentTime(Math.max(0, Math.min(duration, t)))}
            onRetime={(keyId, t) =>
              updateKeyframe(lane.stackId, lane.paramId, keyId, {
                time: Math.max(0, Math.min(duration, t)),
              })
            }
            onOpenMenu={(mark, leftPct) => setMenu({ mark, leftPct, laneKey: lane.key })}
            onOpenLfoMenu={(leftPct) =>
              setLfoMenu({
                stackId: lane.stackId,
                paramId: lane.paramId,
                leftPct,
                laneKey: lane.key,
              })
            }
            onMenuAction={handleMenuAction}
            onRemoveLfo={() => {
              removeLfo(lane.stackId, lane.paramId);
              setLfoMenu(null);
            }}
          />
        ))}
      </div>
    ) : null;

  // Stills get a slim strip: the transport/in-out/scrubber row means nothing on
  // a single frame, and its real estate is better spent surfacing the one
  // thing a still can become -- a clip (AnimateAsVideoModal → real video,
  // which unlocks video-only effects and codec mosh). Playback stays because
  // keyframed params animate over the still's duration.
  // mediaLoaded matters: isVideo is also false before anything loads, and the
  // empty state keeps the full transport (in/out, frame step, speed, and the
  // animation-length field below) rather than this strip.
  if (!isVideo && mediaLoaded) {
    return (
      <div
        data-testid="transport-strip"
        className="mx-1 mb-1 flex flex-col select-none flex-shrink-0 border-t border-outline-variant/30 bg-surface/60"
        style={{ padding: "5px 12px" }}
      >
        <div className="flex items-center gap-3">
        <span className="font-mono text-[10px] text-on-surface-variant tracking-wide">
          {mediaLoaded ? "Still · 1 frame" : "No media"}
        </span>
        {mediaLoaded && (
          <>
            <TButton icon={isPlaying ? "pause" : "play_arrow"} onClick={togglePlay} title={isPlaying ? "Pause" : "Play"} active />
            <div className="flex items-center gap-1">
              <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 12 }}>timer</span>
              <input
                type="number"
                min={0.1}
                max={120}
                step={0.5}
                value={duration}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setDuration(isNaN(val) ? 1 : Math.min(120, Math.max(0.1, val)));
                }}
                className="themed-select font-label-sm text-label-sm w-[56px] text-center"
                title="Animation length (seconds)"
              />
              <span className="font-data-micro text-data-micro text-on-surface-variant">s</span>
            </div>
            <button
              onClick={randomizeStack}
              className="flex items-center gap-1.5 font-label-sm text-label-sm font-semibold tracking-wider text-accent-pink border border-accent-pink/40 rounded px-2.5 py-1 hover:bg-accent-pink/10 transition-colors"
              title="Randomize layers"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>bolt</span>
              MOSH
            </button>
            <div className="flex-1" />
            <button
              onClick={() => setAnimateDialogOpen(true)}
              className="flex items-center gap-2 font-label-sm text-label-sm text-accent-pink border border-accent-pink/40 rounded px-2.5 py-1 hover:bg-accent-pink/10 transition-colors"
              title="Convert this still to a real video clip — unlocks video-only effects and codec mosh"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>movie</span>
              Animate to clip
            </button>
          </>
        )}
        </div>
        {lanesEl}
      </div>
    );
  }

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
        <div className="font-code-sm text-code-sm text-on-surface-variant min-w-[70px]">
          F:{currentFrame.toString().padStart(5, "0")}
        </div>

        {/* In/Out buttons */}
        <div className="flex gap-1 items-center">
          <button
            onClick={() => setInPoint(currentTime)}
            title="Set in point (I)"
            className="font-label-sm text-label-sm rounded px-1 cursor-pointer transition"
            style={{
              border: "1px solid var(--accent-gold)",
              background: inPoint !== null ? "rgba(255, 215, 0, 0.15)" : "transparent",
              color: "var(--accent-gold)",
            }}
          >
            IN
          </button>
          <button
            onClick={() => setOutPoint(currentTime)}
            title="Set out point (O)"
            className="font-label-sm text-label-sm rounded px-1 cursor-pointer transition"
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
              className="font-label-sm text-label-sm rounded px-1 cursor-pointer text-on-surface-variant hover:text-accent-pink transition-colors"
              style={{ border: "1px solid var(--outline-variant)", background: "transparent" }}
            >
              CLR
            </button>
          )}
        </div>

        {/* Keyframe count -- the diamonds on the bar are the real UI */}
        {keyframeMarks.length > 0 && (
          <div
            className="font-code-sm text-code-sm text-accent-teal"
            title="Keyframes on the bar: click one to jump to it, right-click to delete it"
          >
            ◆ {keyframeMarks.length}
          </div>
        )}

        {/* BPM */}
        {audioBpm && (
          <div className="font-code-sm text-code-sm text-accent-teal min-w-[50px]">
            {Math.round(audioBpm)} BPM
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        <button
          onClick={randomizeStack}
          className="flex items-center gap-1 font-label-sm text-label-sm font-semibold tracking-wider text-accent-pink border border-accent-pink/40 rounded px-2 py-0.5 hover:bg-accent-pink/10 transition-colors"
          title="Randomize layers"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 13 }}>bolt</span>
          MOSH
        </button>

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
              className="themed-select font-label-sm text-label-sm cursor-pointer"
            >
              <option value={0.25}>0.25x</option>
              <option value={0.5}>0.5x</option>
              <option value={1}>1x</option>
              <option value={1.5}>1.5x</option>
              <option value={2}>2x</option>
              <option value={4}>4x</option>
            </select>
          </div>

          {/* Animation length — reached only in the no-media state (a still
              takes the slim strip branch above; a video's length is the
              video's). It stays editable before anything loads so an
              animation can be sized ahead of the first drop. */}
          {!isVideo && (
            <div className="flex items-center gap-1 ml-1">
              <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 12 }}>
                timer
              </span>
              <input
                type="number"
                min={0.1}
                max={120}
                step={0.5}
                value={duration}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setDuration(isNaN(val) ? 1 : Math.min(120, Math.max(0.1, val)));
                }}
                className="themed-select font-label-sm text-label-sm w-[60px] text-center"
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
        role="slider"
        tabIndex={0}
        aria-label="Timeline scrubber"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={currentTime}
        aria-valuetext={formatTime(currentTime)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") { e.preventDefault(); setCurrentTime(Math.max(inPoint ?? 0, currentTime - 1 / fps)); }
          else if (e.key === "ArrowRight") { e.preventDefault(); setCurrentTime(Math.min(outPoint ?? duration, currentTime + 1 / fps)); }
          else if (e.key === "Home") { e.preventDefault(); setCurrentTime(inPoint ?? 0); }
          else if (e.key === "End") { e.preventDefault(); setCurrentTime(outPoint ?? duration); }
        }}
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
            background: "var(--accent-pink)",
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
              title={`Keyframe at ${formatTime(m.time)} -- ${n} parameter${n === 1 ? "" : "s"}. Click to jump, right-click for easing and delete`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setCurrentTime(m.time);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenu({ mark: m, leftPct: (m.time / duration) * 100 });
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
              background: "var(--accent-gold)",
              boxShadow: "0 0 4px var(--accent-gold)",
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

        {/* Keyframe menu -- a menu opened by a LANE marker renders inside
            that lane instead (menu.laneKey), so it stays anchored next to the
            marker that owns it. */}
        {menu && !menu.laneKey && (
          <KeyframeContextMenu
            mark={menu.mark}
            leftPct={menu.leftPct}
            style={{ bottom: 22 }}
            onAction={handleMenuAction}
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

      {lanesEl}
    </div>
  );
}

/** What a keyframe context menu can ask the store for. One union shared by
 *  the scrubber's merged diamonds and the lane markers, so both render the
 *  identical menu and run the identical updates. */
type LaneMenuAction =
  | { type: "easing"; easing: EasingType; mark: KeyframeMark }
  | { type: "delete"; mark: KeyframeMark };

/**
 * The easing/delete keyframe menu, extracted so a lane's marker and the
 * scrubber's merged diamond can both pop it. `style` carries only the
 * anchor position (left/bottom) -- the caller knows which container it's
 * absolute inside.
 */
function KeyframeContextMenu({
  mark,
  leftPct,
  style,
  onAction,
}: {
  mark: KeyframeMark;
  leftPct: number;
  style?: React.CSSProperties;
  onAction: (a: LaneMenuAction) => void;
}) {
  return (
    <div
      role="menu"
      aria-label={`Keyframe at ${formatTime(mark.time)}`}
      onPointerDown={(e) => e.stopPropagation()}
      className="absolute z-[10] neo-flat rounded-md bg-surface shadow-lg flex flex-col"
      style={{
        left: `${Math.min(92, Math.max(0, leftPct))}%`,
        minWidth: 150,
        padding: 4,
        border: "1px solid var(--outline-variant)",
        ...style,
      }}
    >
      <div className="font-data-micro text-data-micro text-on-surface-variant px-2 py-1">
        {formatTime(mark.time)} · {mark.refs.length} parameter{mark.refs.length === 1 ? "" : "s"}
      </div>
      {EASINGS.map((ez) => {
        const all = mark.refs.every((r) => r.easing === ez.id);
        const some = !all && mark.refs.some((r) => r.easing === ez.id);
        return (
          <button
            key={ez.id}
            type="button"
            role="menuitemradio"
            aria-checked={all}
            onClick={() => onAction({ type: "easing", easing: ez.id, mark })}
            className={`text-left font-label-sm text-label-sm rounded px-2 py-1 hover:bg-surface-variant/40 ${all ? "text-accent-teal" : "text-on-surface"}`}
          >
            {all ? "● " : some ? "◐ " : "○ "}
            {ez.label}
          </button>
        );
      })}
      <div style={{ height: 1, background: "var(--outline-variant)", margin: "3px 4px" }} />
      <button
        type="button"
        role="menuitem"
        onClick={() => onAction({ type: "delete", mark })}
        className="text-left font-label-sm text-label-sm rounded px-2 py-1 text-accent-pink hover:bg-surface-variant/40"
      >
        Delete keyframe{mark.refs.length === 1 ? "" : "s"}
      </button>
    </div>
  );
}

/**
 * One per-param lane: fixed-width label (click selects the stack entry, which
 * is also the discoverable path to that param's editor), then a track with a
 * diamond per keyframe -- click jumps the playhead, drag retimes the key
 * (`updateKeyframe` re-sorts and keyframes sit outside undo, so per-move
 * updates are the cheap correct call), right-click reuses the keyframe menu.
 * An LFO shows as a teal chip on a faint tinted rail -- right-click removes.
 */
function ParamLaneRow({
  lane,
  duration,
  fps,
  currentTime,
  menu,
  lfoMenu,
  onSelect,
  onJump,
  onRetime,
  onOpenMenu,
  onOpenLfoMenu,
  onMenuAction,
  onRemoveLfo,
}: {
  lane: ParamLane;
  duration: number;
  fps: number;
  currentTime: number;
  menu: { mark: KeyframeMark; leftPct: number } | null;
  lfoMenu: { stackId: string; paramId: string; leftPct: number } | null;
  onSelect: () => void;
  onJump: (t: number) => void;
  onRetime: (keyId: string, t: number) => void;
  onOpenMenu: (mark: KeyframeMark, leftPct: number) => void;
  onOpenLfoMenu: (leftPct: number) => void;
  onMenuAction: (a: LaneMenuAction) => void;
  onRemoveLfo: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  // `moved` separates click-to-jump from drag-to-retime: without it the
  // click that follows every pointerup would snap the playhead to wherever
  // a retime drag happened to end.
  const dragRef = useRef<{ id: string; moved: boolean; startX: number } | null>(null);

  const timeAt = (clientX: number): number | null => {
    const el = trackRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return null;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * duration;
  };
  const pct = (t: number) => `${(Math.max(0, Math.min(duration, t)) / duration) * 100}%`;

  return (
    <div
      data-testid={`lane-${lane.key}`}
      className="flex items-center"
      style={{ height: 14, gap: 6 }}
    >
      <button
        type="button"
        onClick={onSelect}
        title={`${lane.label} -- select this effect to edit it`}
        className="text-on-surface-variant hover:text-accent-teal transition-colors"
        style={{
          width: 96,
          fontSize: 8,
          fontFamily: "var(--font-mono)",
          textAlign: "right",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flex: "none",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
        }}
      >
        {lane.label}
      </button>
      <div
        ref={trackRef}
        data-testid={`lane-track-${lane.key}`}
        className="relative flex-1"
        style={{ height: "100%" }}
      >
        {/* Rail */}
        <div
          className="absolute left-0 right-0"
          style={{ top: "50%", height: 1, background: "var(--outline-variant)", opacity: 0.35 }}
        />

        {/* LFO: teal chip on a faint rail tint; right-click removes */}
        {lane.lfo && (
          <>
            <div
              className="absolute top-0 bottom-0 left-0 right-0 rounded-sm pointer-events-none"
              style={{ background: "color-mix(in srgb, var(--accent-teal) 5%, transparent)" }}
            />
            <button
              type="button"
              className="lfo-chip absolute"
              data-testid={`lane-lfo-${lane.key}`}
              style={{ left: 2, top: 2, cursor: "pointer", zIndex: 2 }}
              title={`LFO ${lane.lfo.waveform} ${lane.lfo.rateHz}Hz -- click selects the effect, right-click removes`}
              onClick={(e) => {
                e.stopPropagation();
                onSelect();
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onOpenLfoMenu(4);
              }}
            >
              LFO {lane.lfo.rateHz.toFixed(1)}Hz
            </button>
          </>
        )}

        {/* Keyframe diamonds */}
        {lane.keys.map((k) => {
          const atPlayhead = Math.abs(k.time - currentTime) < 0.01;
          return (
            <button
              key={k.id}
              type="button"
              aria-label={`${lane.paramId} keyframe at ${formatTime(k.time)}`}
              title={`Keyframe ${formatTime(k.time)} -- click jumps, drag retimes, right-click edits`}
              className="absolute p-0 cursor-ew-resize"
              style={{
                left: pct(k.time),
                top: 3,
                width: 7,
                height: 7,
                zIndex: 3,
                touchAction: "none",
                transform: "translateX(-50%) rotate(45deg)",
                background: atPlayhead ? "var(--accent-gold)" : "var(--accent-teal)",
                border: "1px solid var(--surface)",
              }}
              onKeyDown={(e) => {
                // Arrow-key retime: the non-dragging alternative to
                // pointer-move (WCAG 2.5.7).
                if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                  e.preventDefault();
                  e.stopPropagation();
                  const next = Math.max(0, Math.min(duration, k.time + (e.key === "ArrowRight" ? 1 : -1) / fps));
                  onRetime(k.id, next);
                }
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
                dragRef.current = { id: k.id, moved: false, startX: e.clientX };
                try {
                  e.currentTarget.setPointerCapture(e.pointerId);
                } catch {
                  // jsdom has no pointer capture
                }
              }}
              onPointerMove={(e) => {
                const d = dragRef.current;
                if (!d || d.id !== k.id) return;
                // 3px dead zone: a jittery click must jump, not retime by
                // a sub-frame amount and suppress the click.
                if (!d.moved && Math.abs(e.clientX - d.startX) < 3) return;
                const t = timeAt(e.clientX);
                if (t === null) return;
                d.moved = true;
                onRetime(k.id, t);
              }}
              onPointerUp={(e) => {
                try {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                } catch {
                  // see above
                }
              }}
              onPointerCancel={() => {
                dragRef.current = null;
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (dragRef.current?.moved) {
                  dragRef.current = null;
                  return;
                }
                dragRef.current = null;
                onJump(k.time);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onOpenMenu(
                  {
                    time: k.time,
                    refs: [
                      {
                        stackId: lane.stackId,
                        paramId: lane.paramId,
                        id: k.id,
                        easing: k.easing,
                      },
                    ],
                  },
                  (k.time / duration) * 100
                );
              }}
            />
          );
        })}

        {/* Playhead echo */}
        <div
          className="absolute top-0 bottom-0 pointer-events-none"
          style={{
            left: pct(currentTime),
            width: 1,
            background: "var(--on-surface)",
            opacity: 0.45,
          }}
        />

        {/* Menus opened by THIS lane render inside it, anchored above */}
        {menu && (
          <KeyframeContextMenu
            mark={menu.mark}
            leftPct={menu.leftPct}
            style={{ bottom: "calc(100% + 4px)" }}
            onAction={onMenuAction}
          />
        )}
        {lfoMenu && (
          <div
            role="menu"
            aria-label={`LFO on ${lane.paramId}`}
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute z-[10] neo-flat rounded-md bg-surface shadow-lg flex flex-col"
            style={{
              left: `${Math.min(92, Math.max(0, lfoMenu.leftPct))}%`,
              bottom: "calc(100% + 4px)",
              minWidth: 110,
              padding: 4,
              border: "1px solid var(--outline-variant)",
            }}
          >
            <div className="font-data-micro text-data-micro text-on-surface-variant px-2 py-1">
              LFO {lane.lfo?.waveform} {lane.lfo?.rateHz}Hz
            </div>
            <button
              type="button"
              role="menuitem"
              onClick={onRemoveLfo}
              className="text-left font-label-sm text-label-sm rounded px-2 py-1 text-accent-pink hover:bg-surface-variant/40"
            >
              Remove LFO
            </button>
          </div>
        )}
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
