import { useRef, useEffect, useState } from "react";
import { useAppStore, type AudioBinding, type LfoSpec, type LfoWaveform } from "../../store";
import { audioChannelName } from "../../engine/audio/channelName";
import { PALETTE_PRESETS, fillPaletteParams } from "../../engine/palettePresets";

import { isVideoOnlyEffect, VIDEO_ONLY_ON_IMAGE_WARNING, unsetSelectionWarning } from "../../utils/effectConverter";
import { effectPipeline } from "../../lib/effectPipeline";

/**
 * Parameters that a dedicated panel already picks better than a generic control
 * can, and which are therefore hidden from the effect's parameter list.
 *
 * `color.lut_grading.lut_path` is a Select of ~35 bare filenames. The LUTs tab
 * chooses the same value from a gallery of rendered thumbnails, so the dropdown
 * was the worse of two pickers for the identical setting -- and a second way to
 * change a value invites the two controls to disagree.
 *
 * The parameter itself is untouched: it stays in the Rust ParameterDef so
 * clamping and export keep working, and the value still rides in the stack
 * entry. Only the redundant control is hidden.
 */
const PICKED_ELSEWHERE: Record<string, readonly string[]> = {
  "color.lut_grading": ["lut_path"],
};

function isPickedElsewhere(effectId: string, paramId: string): boolean {
  return PICKED_ELSEWHERE[effectId]?.includes(paramId) ?? false;
}

const AUDIO_SOURCES = [
  { id: "bass", label: "Bass" },
  { id: "lowMid", label: "Low Mid" },
  { id: "mid", label: "Mid" },
  { id: "highMid", label: "High Mid" },
  { id: "presence", label: "Presence" },
  { id: "brilliance", label: "Brilliance" },
  { id: "rms", label: "RMS" },
  { id: "energy", label: "Energy" },
  { id: "centroid", label: "Spectral Centroid" },
  { id: "flux", label: "Spectral Flux" },
  { id: "zcr", label: "Zero Crossing" },
  { id: "beatBass", label: "Beat (Bass)" },
  { id: "beatMid", label: "Beat (Mid)" },
  { id: "beatTreble", label: "Beat (Treble)" },
];

function FaderControl({
  value,
  min,
  max,
  step,
  label,
  onLive,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  label: string;
  // Live commits (per animation frame) must not push undo history —
  // a drag would flood ~120 entries. Only onCommit (release/unmount)
  // writes history.
  onLive: (v: number) => void;
  onCommit: (v: number) => void;
}) {
  // Range inputs can fire `input` far faster than the screen repaints
  // (OS/pointer polling rate), and every event used to push a full store
  // update plus downstream preview/IPC work. Coalesce commits to one per
  // animation frame. React maps onChange to the same `input` event, so a
  // release commit has to hook pointerup/keyboard instead -- and unmount
  // mid-drag flushes whatever is still pending.
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<number | null>(null);
  const liveRef = useRef(onLive);
  liveRef.current = onLive;
  const flush = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (pendingRef.current !== null) {
      onCommit(pendingRef.current);
      pendingRef.current = null;
    }
  };
  const flushLive = () => {
    rafRef.current = null;
    if (pendingRef.current !== null) {
      liveRef.current(pendingRef.current);
    }
  };
  const schedule = (v: number) => {
    pendingRef.current = v;
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(flushLive);
    }
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => flushRef.current(), []);

  return (
    <input
      type="range"
      aria-label={`${label} fader`}
      className="slider-track w-full cursor-pointer mt-1.5"
      value={value}
      min={min}
      max={max}
      step={step ?? "any"}
      onInput={(e) => schedule(parseFloat((e.target as HTMLInputElement).value))}
      onPointerUp={flush}
      onKeyUp={flush}
    />
  );
}


export default function ParameterPanel({ stackId }: { stackId?: string } = {}) {
  const entry = useAppStore((s) => s.effectStack.find((e) => e.id === (stackId || s.selectedStackId)));
  const effectMeta = useAppStore((s) => s.allEffects.find((e) => e.id === entry?.effectId));
  const mediaLoaded = useAppStore((s) => s.mediaLoaded);
  const isVideo = useAppStore((s) => s.isVideo);
  const updateStackParams = useAppStore((s) => s.updateStackParams);
  const updateStackParamsSilent = useAppStore((s) => s.updateStackParamsSilent);
  const audioBindings = useAppStore((s) =>
    entry?.id ? s.audioBindings[entry.id] : undefined
  );
  const setAudioBinding = useAppStore((s) => s.setAudioBinding);
  const audioMappedValues = useAppStore((s) => s.audioMappedValues);
  const audioEnabled = useAppStore((s) => s.audioEnabled);
  const currentTime = useAppStore((s) => s.currentTime);
  const keyframes = useAppStore((s) =>
    entry?.id ? s.keyframes[entry.id] : undefined
  );
  const addKeyframe = useAppStore((s) => s.addKeyframe);
  const removeKeyframe = useAppStore((s) => s.removeKeyframe);
  const lfos = useAppStore((s) => (entry?.id ? s.lfos[entry.id] : undefined));
  const setLfo = useAppStore((s) => s.setLfo);
  const setLfoSilent = useAppStore((s) => s.setLfoSilent);
  const beginParamGesture = useAppStore((s) => s.beginParamGesture);
  const removeLfo = useAppStore((s) => s.removeLfo);

  if (!entry) {
    return (
      <div
        className="flex-1 flex flex-col items-center justify-center gap-2"
        style={{ color: "var(--text-dim)" }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 20, opacity: 0.3 }}>tune</span>
        <span className="font-body-sm text-body-sm">Select an effect to edit parameters</span>
      </div>
    );
  }

  if (!effectMeta) return null;

  const showVideoOnlyWarning = mediaLoaded && !isVideo && isVideoOnlyEffect(effectMeta);
  const selectionWarning = unsetSelectionWarning(entry.effectId, entry.params);
  // Codec layers corrupt the encoded bitstream at export — there is no
  // per-frame moment where a keyframe, LFO, audio binding or mask could
  // apply, so those affordances are hidden rather than silently ignored.
  const isCodecEntry = effectPipeline(effectMeta) === "codec";
  // Temporal effects consume the whole segment at once — the engine never
  // samples LFOs for them (keyframes apply at the in-point instead), so the
  // control is hidden rather than silently frozen.
  const isTemporalEntry = !isCodecEntry && effectMeta.is_temporal === true;

  return (
    <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4 custom-scrollbar">
      <div className="text-label-sm font-label-sm uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
        Parameters
      </div>

      {isCodecEntry && (
        <div
          data-testid="codec-layer-note"
          className="text-dense-sm"
          style={{
            padding: "6px 8px",
            borderRadius: 3,
            // Same accent-teal codec-truth token the chips use, washed —
            // hardcoded rgba(120,200,255) read as a foreign blue and vanished
            // against the light theme's surfaces.
            background: "color-mix(in srgb, var(--accent-teal) 8%, transparent)",
            border: "1px solid color-mix(in srgb, var(--accent-teal) 25%, transparent)",
            color: "var(--text-secondary)",
          }}
        >
          Codec layer — corrupts the encoded file at export. Static params
          apply; masks, keyframes, LFOs and audio bindings do not.
        </div>
      )}

      {isTemporalEntry && (
        <div
          data-testid="temporal-layer-note"
          className="text-dense-sm"
          style={{
            padding: "6px 8px",
            borderRadius: 3,
            background: "color-mix(in srgb, var(--accent-teal) 8%, transparent)",
            border: "1px solid color-mix(in srgb, var(--accent-teal) 25%, transparent)",
            color: "var(--text-secondary)",
          }}
        >
          Temporal effect — processes the whole clip at once. Keyframe values
          apply at the clip's in-point; LFO modulation does not apply.
        </div>
      )}

      {showVideoOnlyWarning && (
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
          <span>{VIDEO_ONLY_ON_IMAGE_WARNING}</span>
        </div>
      )}

      {selectionWarning && (
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
          <span>{selectionWarning}</span>
        </div>
      )}

      {entry.effectId === "dithering.palette" && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined" style={{ fontSize: 12, color: "var(--accent)" }}>palette</span>
            <span className="font-label-md text-label-md" style={{ color: "var(--text-secondary)" }}>
              Palette Preset
            </span>
          </div>
          <select
            title="Palette preset"
            aria-label="Palette preset"
            className="w-full font-label-md text-label-md rounded px-2 py-1 border-none cursor-pointer"
            style={{
              background: "var(--bg-input)",
              color: "var(--text-primary)",
            }}
            onChange={(e) => {
              const preset = PALETTE_PRESETS.find((p) => p.name === e.target.value);
              if (preset) {
                const updates = fillPaletteParams(preset, entry.params);
                updateStackParams(entry.id, updates);
              }
            }}
          >
            <option value="">Select preset...</option>
            {PALETTE_PRESETS.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
          {/* Color swatches */}
          <div className="flex gap-1 flex-wrap">
            {Array.from({ length: 8 }).map((_, i) => {
              const color = (entry.params[`color${i}`] as number[] | undefined) ?? [0, 0, 0];
              return (
                <div
                  key={i}
                  className="w-4 h-4 rounded-sm border"
                  style={{
                    background: `rgb(${Math.round((color[0] as number) * 255)}, ${Math.round((color[1] as number) * 255)}, ${Math.round((color[2] as number) * 255)})`,
                    borderColor: "var(--border-secondary)",
                  }}
                  title={`Color ${i + 1}`}
                />
              );
            })}
          </div>
        </div>
      )}

      {effectMeta.parameters.filter((param) => !isPickedElsewhere(entry.effectId, param.id)).map((param) => {
        const value = entry.params[param.id] ?? param.default;
        // While an LFO drives this param its `offset` is the base value the
        // wave oscillates around, so the slider and readout edit THAT --
        // writing entry.params would move a number nothing renders. When a
        // keyframe track exists the track is the centre instead and offset
        // is inert; the controls still edit it so the base is in place if
        // the track is ever removed (same "driven" lie the readout has
        // always told while keyframes hold the param).
        const lfo = lfos?.[param.id];
        const trackLen = keyframes?.[param.id]?.length ?? 0;
        const numericValue = lfo ? lfo.offset : Number(value);
        const writeBase = (v: number, commit: boolean) => {
          if (!commit) beginParamGesture();
          if (lfo) {
            const spec = { ...lfo, offset: v };
            if (commit) setLfo(entry.id, param.id, spec);
            else setLfoSilent(entry.id, param.id, spec);
          } else if (commit) {
            updateStackParams(entry.id, { [param.id]: v });
          } else {
            updateStackParamsSilent(entry.id, { [param.id]: v });
          }
        };
        return (
          <div key={param.id} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                className="font-label-md text-label-md cursor-pointer hover:text-accent-teal transition-colors"
                style={{ color: "var(--text-secondary)" }}
                title="Double-click to reset to default"
                onDoubleClick={() => updateStackParams(entry.id, { [param.id]: param.default })}
              >
                {param.name}
              </label>
              <div className="flex items-center gap-1">
                {typeof value === "number" && !isCodecEntry && (
                  <KeyframeButton
                    stackId={entry.id}
                    paramId={param.id}
                    currentTime={currentTime}
                    currentValue={numericValue}
                    keyframes={keyframes}
                    addKeyframe={addKeyframe}
                    removeKeyframe={removeKeyframe}
                  />
                )}
                {typeof value === "number" ? (
                  <input
                    type="number"
                    value={numericValue}
                    aria-label={param.name}
                    title={lfo ? `${param.name} (LFO centre)` : param.name}
                    placeholder="0"
                    min={param.min ?? undefined}
                    max={param.max ?? undefined}
                    step={param.step ?? undefined}
                    onChange={(e) => {
                      // Clamp to the declared range. The backend clamps too
                      // (effects::params::clamp_params), so an out-of-range
                      // entry was never destructive -- but without this the box
                      // displayed a number the render was not using, which is a
                      // worse failure than refusing the input.
                      const raw = parseFloat(e.target.value);
                      if (Number.isNaN(raw)) return;
                      const lo = param.min ?? Number.NEGATIVE_INFINITY;
                      const hi = param.max ?? Number.POSITIVE_INFINITY;
                      writeBase(Math.min(hi, Math.max(lo, raw)), true);
                    }}
                    className="param-readout bg-transparent border-b border-[var(--border-secondary)] px-1 w-12 text-right focus:border-[var(--accent)]"
                    style={{ color: "var(--text-primary)" }}
                  />
                ) : (
                  <span className="param-readout">{String(value)}</span>
                )}
              </div>
            </div>

            {String(param.type).toLowerCase() === "slider" && (() => {
              const min = param.min ?? 0;
              const max = param.max ?? 100;
              return (
                <>
                  <FaderControl
                    value={numericValue}
                    min={min}
                    max={max}
                    step={param.step ?? undefined}
                    label={param.name}
                    onLive={(v) => writeBase(v, false)}
                    onCommit={(v) => writeBase(v, true)}
                  />
                  {/* Per-param LFO modulator: + chip, expands to a compact
                      editor. Rides alongside the audio binding below.
                      Hidden on codec layers and temporal effects — nothing
                      evaluates it per-frame in either pipeline. */}
                  {!isCodecEntry && !isTemporalEntry && (
                  <LfoControl
                    stackId={entry.id}
                    paramId={param.id}
                    paramMin={min}
                    paramMax={max}
                    currentValue={Number(value)}
                    spec={lfo}
                    keyframed={trackLen > 0}
                    onSet={setLfo}
                    onSetSilent={(sid, pid, spec) => {
                      beginParamGesture();
                      setLfoSilent(sid, pid, spec);
                    }}
                    onRemove={removeLfo}
                  />
                  )}
                </>
              );
            })()}

            {/* Audio binding for slider parameters — not on codec layers,
                where no per-frame pass exists to consume it. */}
            {audioEnabled && !isCodecEntry && String(param.type).toLowerCase() === "slider" && (
              <AudioBindingControl
                stackId={entry.id}
                paramId={param.id}
                paramMin={param.min ?? 0}
                paramMax={param.max ?? 1}
                binding={audioBindings?.[param.id]}
                onSet={setAudioBinding}
                currentValue={audioMappedValues}
              />
            )}

            {String(param.type).toLowerCase() === "select" && param.options && (
              <select
                aria-label={param.name}
                title={param.name}
                value={String(param.options[Number(value)] ?? value)}
                onChange={(e) => {
                  const idx = param.options!.indexOf(e.target.value);
                  updateStackParams(entry.id, { [param.id]: idx });
                }}
                className="w-full font-label-md text-label-md rounded px-2 py-1.5"
                style={{
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-secondary)",
                  color: "var(--text-primary)",
                }}
              >
                {param.options.map((opt, i) => (
                  <option key={i} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            )}

            {String(param.type).toLowerCase() === "text" && (
              <input
                type="text"
                aria-label={param.name}
                title={param.name}
                value={typeof value === "string" ? value : ""}
                placeholder={String(param.default ?? "")}
                onChange={(e) =>
                  updateStackParams(entry.id, { [param.id]: e.target.value })
                }
                className="w-full font-label-md text-label-md rounded px-2 py-1.5"
                style={{
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-secondary)",
                  color: "var(--text-primary)",
                }}
              />
            )}

            {String(param.type).toLowerCase() === "toggle" && (
              <button
                aria-label={param.name}
                aria-pressed={Boolean(value)}
                title={param.name}
                onClick={() =>
                  updateStackParams(entry.id, {
                    [param.id]: !value,
                  })
                }
                className="w-10 h-5 rounded-full relative transition duration-300 shadow-inner"
                style={{
                  background: value
                    ? "var(--accent)"
                    : "var(--bg-input)",
                  boxShadow: value
                    ? "inset 0 1px 3px rgba(0,0,0,0.3), 0 0 10px var(--accent-glow)"
                    : "inset 0 1px 3px rgba(0,0,0,0.6)",
                  border: "1px solid var(--border-secondary)",
                }}
              >
                <div
                  // The knob slides via the inline `left` below, and `left` is
                  // not in Tailwind's bare `transition` property list, so it
                  // must be named explicitly or the switch snaps between its
                  // two positions. `transition-all` would cover it but also
                  // animates `outline`, suppressing the :focus-visible ring.
                  className="absolute top-[1px] w-4 h-4 rounded-full bg-white transition-[left] duration-300"
                  style={{
                    left: value ? "calc(100% - 18px)" : "2px",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.4)",
                  }}
                />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function KeyframeButton({
  stackId,
  paramId,
  currentTime,
  currentValue,
  keyframes,
  addKeyframe,
  removeKeyframe,
}: {
  stackId: string;
  paramId: string;
  currentTime: number;
  currentValue: number;
  keyframes: Record<string, { id: string; time: number; value: number }[]> | undefined;
  addKeyframe: (stackId: string, paramId: string, keyframe: { id: string; time: number; value: number; easing: "linear" | "easeIn" | "easeOut" | "easeInOut" | "hold" }) => void;
  removeKeyframe: (stackId: string, paramId: string, keyframeId: string) => void;
}) {
  const track = keyframes?.[paramId] || [];
  const existing = track.find((k) => Math.abs(k.time - currentTime) < 0.01);

  const handleClick = () => {
    if (existing) {
      removeKeyframe(stackId, paramId, existing.id);
    } else {
      addKeyframe(stackId, paramId, {
        id: `${stackId}-${paramId}-${Date.now()}`,
        time: currentTime,
        value: currentValue,
        easing: "linear",
      });
    }
  };

  return (
    <button
      onClick={handleClick}
      title={existing ? "Remove keyframe" : "Add keyframe"}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: 2,
        color: existing ? "var(--accent)" : "var(--text-muted, #666)",
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 10, color: existing ? "var(--accent)" : "var(--text-muted, #666)", fontVariationSettings: existing ? "'FILL' 1" : "'FILL' 0" }}>diamond</span>
    </button>
  );
}
function AudioBindingControl({
  stackId,
  paramId,
  paramMin,
  paramMax,
  binding,
  onSet,
  currentValue,
}: {
  stackId: string;
  paramId: string;
  paramMin: number;
  paramMax: number;
  binding?: AudioBinding;
  onSet: (stackId: string, paramId: string, binding: AudioBinding | null) => void;
  currentValue: Record<string, number>;
}) {
  const isBound = !!binding;
  // Channels are keyed by `${stackId}.${paramId}`, not by the feature name,
  // so this read `currentValue["bass"]`, found nothing, and displayed a
  // confident 0.000 no matter what the audio was doing.
  const live = binding ? (currentValue[audioChannelName(stackId, paramId)] ?? 0) : 0;

  const toggle = () => {
    if (isBound) {
      onSet(stackId, paramId, null);
    } else {
      onSet(stackId, paramId, {
        source: "bass",
        inputMin: 0,
        inputMax: 1,
        outputMin: paramMin,
        outputMax: paramMax,
        attack: 0.05,
        decay: 0.2,
        gateEnabled: false,
        gateThreshold: 0.1,
        invert: false,
      });
    }
  };

  return (
    <div
      style={{
        marginTop: 4,
        padding: isBound ? "6px" : "2px 0",
        background: isBound ? "rgba(74, 144, 217, 0.08)" : "transparent",
        borderRadius: 4,
      }}
    >
      <div className="flex items-center justify-between">
        <button
          onClick={toggle}
          title={isBound ? "Unbind from audio" : "Bind to audio"}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 10,
            padding: "2px 6px",
            borderRadius: 3,
            border: "none",
            cursor: "pointer",
            background: isBound ? "rgba(74, 144, 217, 0.25)" : "transparent",
            color: isBound ? "var(--accent-teal, #6cf)" : "var(--text-muted, #888)",
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 10 }}>graphic_eq</span>
          {isBound ? "Audio Bound" : "Bind Audio"}
        </button>
        {isBound && (
          <span style={{ fontSize: 10, color: "var(--accent-teal, #6cf)", fontFamily: "var(--font-mono)" }}>
            {live.toFixed(3)}
          </span>
        )}
      </div>

      {isBound && (
        <div className="mt-1 space-y-1">
          <select
            aria-label="Audio source"
            value={binding.source}
            onChange={(e) =>
              onSet(stackId, paramId, { ...binding, source: e.target.value })
            }
            className="w-full font-label-md text-label-md rounded px-1 py-0.5"
            style={{
              background: "var(--bg-input)",
              border: "1px solid var(--border-secondary)",
              color: "var(--text-primary)",
            }}
          >
            {AUDIO_SOURCES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>

          <div className="flex gap-1 items-center">
            <span style={{ fontSize: 9, color: "var(--text-muted, #888)", minWidth: 30 }}>In</span>
            <input
              aria-label="Input min"
              type="number"
              step={0.01}
              value={binding.inputMin}
              onChange={(e) =>
                onSet(stackId, paramId, { ...binding, inputMin: parseFloat(e.target.value) || 0 })
              }
              className="w-10 font-code-sm text-code-sm px-1 py-0.5 rounded"
              style={{
                background: "var(--bg-input)",
                border: "1px solid var(--border-secondary)",
                color: "var(--text-primary)",
              }}
            />
            <span style={{ fontSize: 9, color: "var(--text-muted, #666)" }}>to</span>
            <input
              aria-label="Input max"
              type="number"
              step={0.01}
              value={binding.inputMax}
              onChange={(e) =>
                onSet(stackId, paramId, { ...binding, inputMax: parseFloat(e.target.value) || 1 })
              }
              className="w-10 font-code-sm text-code-sm px-1 py-0.5 rounded"
              style={{
                background: "var(--bg-input)",
                border: "1px solid var(--border-secondary)",
                color: "var(--text-primary)",
              }}
            />
          </div>

          <div className="flex gap-1 items-center">
            <span style={{ fontSize: 9, color: "var(--text-muted, #888)", minWidth: 30 }}>Out</span>
            <input
              aria-label="Output min"
              type="number"
              step={0.01}
              value={binding.outputMin}
              onChange={(e) =>
                onSet(stackId, paramId, { ...binding, outputMin: parseFloat(e.target.value) || 0 })
              }
              className="w-10 font-code-sm text-code-sm px-1 py-0.5 rounded"
              style={{
                background: "var(--bg-input)",
                border: "1px solid var(--border-secondary)",
                color: "var(--text-primary)",
              }}
            />
            <span style={{ fontSize: 9, color: "var(--text-muted, #666)" }}>to</span>
            <input
              aria-label="Output max"
              type="number"
              step={0.01}
              value={binding.outputMax}
              onChange={(e) =>
                onSet(stackId, paramId, { ...binding, outputMax: parseFloat(e.target.value) || 1 })
              }
              className="w-10 font-code-sm text-code-sm px-1 py-0.5 rounded"
              style={{
                background: "var(--bg-input)",
                border: "1px solid var(--border-secondary)",
                color: "var(--text-primary)",
              }}
            />
          </div>

          <div className="flex gap-2 items-center">
            <label style={{ fontSize: 9, color: "var(--text-muted, #888)", display: "flex", alignItems: "center", gap: 2 }}>
              <input
                type="checkbox"
                checked={binding.gateEnabled}
                onChange={(e) =>
                  onSet(stackId, paramId, { ...binding, gateEnabled: e.target.checked })
                }
              />
              Gate
            </label>
            <label style={{ fontSize: 9, color: "var(--text-muted, #888)", display: "flex", alignItems: "center", gap: 2 }}>
              <input
                type="checkbox"
                checked={binding.invert}
                onChange={(e) =>
                  onSet(stackId, paramId, { ...binding, invert: e.target.checked })
                }
              />
              Invert
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * One waveform choice in the LFO editor's segmented row. Material icons over
 * text glyphs: the mock's `~ ▲ ■` read ASCII-cheap next to the icon language
 * the rest of the panel already speaks.
 */
const LFO_WAVES: { id: LfoWaveform; icon: string; label: string }[] = [
  { id: "sine", icon: "waves", label: "Sine" },
  { id: "triangle", icon: "change_history", label: "Triangle" },
  { id: "square", icon: "check_box_outline_blank", label: "Square" },
  { id: "random", icon: "casino", label: "Random" },
];

/**
 * Per-parameter LFO modulator, modelled on the mock's `.modchip` contract:
 * a `+ LFO` chip when the param is free; an `LFO ~ N Hz` chip (same teal mono
 * 8px language as `.codec-chip`) once it oscillates, which expands to the
 * editor and removes on ×.
 *
 * Undo granularity mirrors the param fader it sits under: drags commit live
 * through `onSetSilent` and write ONE history entry on release via `onSet`,
 * while discrete edits (waveform, number fields) go straight to `onSet`.
 *
 * `offset` is the oscillation centre -- the param's "base value". The main
 * fader already edits it directly (see the map above); the row here exists
 * for discoverability and for the hint that a keyframe track, when present,
 * takes the centre over.
 */
function LfoControl({
  stackId,
  paramId,
  paramMin,
  paramMax,
  currentValue,
  spec,
  keyframed,
  onSet,
  onSetSilent,
  onRemove,
}: {
  stackId: string;
  paramId: string;
  paramMin: number;
  paramMax: number;
  currentValue: number;
  spec?: LfoSpec;
  keyframed: boolean;
  onSet: (stackId: string, paramId: string, spec: LfoSpec) => void;
  onSetSilent: (stackId: string, paramId: string, spec: LfoSpec) => void;
  onRemove: (stackId: string, paramId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = !!spec;
  const wave = spec ? LFO_WAVES.find((w) => w.id === spec.waveform) : undefined;

  const patch = (p: Partial<LfoSpec>, commit: boolean) => {
    if (!spec) return;
    const next = { ...spec, ...p };
    if (commit) onSet(stackId, paramId, next);
    else onSetSilent(stackId, paramId, next);
  };

  return (
    <div
      data-testid={`lfo-${paramId}`}
      style={{
        marginTop: 4,
        padding: active ? "4px 6px" : "2px 0",
        background: active ? "color-mix(in srgb, var(--accent-teal) 5%, transparent)" : "transparent",
        borderRadius: 4,
      }}
    >
      <div className="flex items-center justify-between">
        <button
          onClick={() => {
            if (active) {
              setOpen((o) => !o);
            } else {
              onSet(stackId, paramId, {
                // Deterministic id: the random waveform's seed derives from
                // it, and "the LFO on this param" is a stable identity.
                id: `${stackId}.${paramId}`,
                waveform: "sine",
                rateHz: 1,
                depth: 0.25,
                offset: currentValue,
              });
              setOpen(true);
            }
          }}
          title={
            active
              ? "Edit LFO modulation"
              : "Add an LFO: oscillates this parameter over time, synced to the transport"
          }
          aria-label={
            active ? `Edit LFO modulation on ${paramId}` : `Add LFO modulation to ${paramId}`
          }
          className={active ? "lfo-chip" : "lfo-chip-off"}
        >
          {active && wave ? `LFO ${wave.label.slice(0, 3).toUpperCase()} ${spec!.rateHz.toFixed(1)}Hz` : "+ LFO"}
        </button>
        {active && (
          <button
            onClick={() => onRemove(stackId, paramId)}
            title="Remove LFO"
            aria-label={`Remove LFO from ${paramId}`}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 4,
              color: "var(--text-muted, #888)",
              display: "flex",
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>close</span>
          </button>
        )}
      </div>

      {active && open && spec && (
        <div
          className="mt-1 space-y-1"
          onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } }}
        >
          {/* Waveform */}
          <div className="flex gap-1 items-center">
            {LFO_WAVES.map((w) => {
              const on = w.id === spec.waveform;
              return (
                <button
                  key={w.id}
                  onClick={() => patch({ waveform: w.id }, true)}
                  title={w.label}
                  aria-label={`LFO waveform ${w.label}`}
                  aria-pressed={on}
                  className={on ? "lfo-chip" : "lfo-chip-off"}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 9 }}>
                    {w.icon}
                  </span>
                  {w.label}
                </button>
              );
            })}
          </div>

          {/* Rate */}
          <div className="flex gap-1 items-center">
            <span style={{ fontSize: 9, color: "var(--text-muted, #888)", minWidth: 34 }}>Rate</span>
            <div className="flex-1">
              <FaderControl
                value={spec.rateHz}
                min={0.05}
                max={20}
                label="LFO rate"
                onLive={(v) => patch({ rateHz: v }, false)}
                onCommit={(v) => patch({ rateHz: v }, true)}
              />
            </div>
            <input
              aria-label="LFO rate (Hz)"
              type="number"
              min={0.05}
              max={20}
              step={0.1}
              value={spec.rateHz}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!Number.isNaN(v)) patch({ rateHz: v }, true);
              }}
              className="w-12 font-code-sm text-code-sm px-1 py-0.5 rounded"
              style={{
                background: "var(--bg-input)",
                border: "1px solid var(--border-secondary)",
                color: "var(--text-primary)",
              }}
            />
            <span style={{ fontSize: 9, color: "var(--text-muted, #666)" }}>Hz</span>
          </div>

          {/* Depth: 0..1 of the param's declared range */}
          <div className="flex gap-1 items-center">
            <span style={{ fontSize: 9, color: "var(--text-muted, #888)", minWidth: 34 }}>Depth</span>
            <div className="flex-1">
              <FaderControl
                value={spec.depth}
                min={0}
                max={1}
                label="LFO depth"
                onLive={(v) => patch({ depth: v }, false)}
                onCommit={(v) => patch({ depth: v }, true)}
              />
            </div>
            <span
              className="font-code-sm text-code-sm"
              style={{ color: "var(--text-muted, #888)", minWidth: 32, textAlign: "right" }}
            >
              {Math.round(spec.depth * 100)}%
            </span>
          </div>

          {/* Centre (offset) */}
          <div className="flex gap-1 items-center">
            <span
              style={{ fontSize: 9, color: "var(--text-muted, #888)", minWidth: 34 }}
              title={
                keyframed
                  ? "The keyframe track is the oscillation centre while it exists -- offset applies if it is removed"
                  : "Oscillation centre -- the parameter's base value"
              }
            >
              Centre
            </span>
            <div className="flex-1">
              <FaderControl
                value={spec.offset}
                min={paramMin}
                max={paramMax}
                label="LFO centre"
                onLive={(v) => patch({ offset: v }, false)}
                onCommit={(v) => patch({ offset: v }, true)}
              />
            </div>
            <input
              aria-label="LFO centre"
              type="number"
              step={0.01}
              value={spec.offset}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (!Number.isNaN(v))
                  patch({ offset: Math.min(paramMax, Math.max(paramMin, v)) }, true);
              }}
              className="w-12 font-code-sm text-code-sm px-1 py-0.5 rounded"
              style={{
                background: "var(--bg-input)",
                border: "1px solid var(--border-secondary)",
                color: "var(--text-primary)",
              }}
            />
          </div>

          {keyframed && (
            <div style={{ fontSize: 9, color: "var(--text-muted, #666)" }}>
              Keyframes set the centre — offset applies if the track is removed
            </div>
          )}
        </div>
      )}
    </div>
  );
}
