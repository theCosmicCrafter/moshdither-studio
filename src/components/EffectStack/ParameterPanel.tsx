import { useAppStore, type AudioBinding } from "../../store";
import { PALETTE_PRESETS, fillPaletteParams } from "../../engine/palettePresets";

import { isVideoOnlyEffect, VIDEO_ONLY_ON_IMAGE_WARNING } from "../../utils/effectConverter";

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

function ParameterWheel({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const range = max - min;
  const angle = range > 0 ? ((value - min) / range) * 270 - 135 : 0;

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const step = range > 0 ? range / 50 : 1;
    const dir = e.deltaY > 0 ? -1 : 1;
    const next = Math.max(min, Math.min(max, value + step * dir));
    onChange(next);
  };

  const handleDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startValue = value;
    // Raw mousemove can fire far faster than the screen repaints (OS/mouse
    // polling rate, sometimes 100-1000Hz) -- calling onChange synchronously
    // on every event pushed a full store update (and, downstream, a real
    // preview re-render/backend IPC call) on every single tick, which is
    // what made dragging a slider on a CPU-preview dithering effect feel
    // choppy. Coalesce to at most one commit per animation frame instead;
    // the eye can't perceive more than that anyway, and the final value is
    // still always committed on mouseup even if it lands between frames.
    let rafId: number | null = null;
    let pendingValue: number | null = null;
    const flush = () => {
      rafId = null;
      if (pendingValue !== null) {
        onChange(pendingValue);
        pendingValue = null;
      }
    };
    const handleMove = (ev: MouseEvent) => {
      const delta = startY - ev.clientY;
      const step = range > 0 ? range / 200 : 1;
      const next = Math.max(min, Math.min(max, startValue + delta * step));
      pendingValue = next;
      if (rafId === null) {
        rafId = requestAnimationFrame(flush);
      }
    };
    const handleUp = () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      flush();
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const step = range > 0 ? range / 50 : 1;
    if (e.key === "ArrowUp" || e.key === "ArrowRight") {
      e.preventDefault();
      onChange(Math.max(min, Math.min(max, value + step)));
    } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
      e.preventDefault();
      onChange(Math.max(min, Math.min(max, value - step)));
    }
  };

  return (
    <div className="flex items-center gap-3 mt-1">
      <div
        className="relative w-10 h-10 rounded-full neo-panel flex items-center justify-center cursor-pointer border border-accent-pink/30"
        onWheel={handleWheel}
        onMouseDown={handleDrag}
        onKeyDown={handleKeyDown}
        title="Scroll or drag to adjust"
        role="slider"
        aria-label="Parameter wheel"
        aria-valuemin={Number(min)}
        aria-valuemax={Number(max)}
        aria-valuenow={Number(value)}
        tabIndex={0}
      >
        <div
          className="w-1 h-3 bg-accent-pink absolute top-1 left-1/2 -translate-x-1/2 rounded-full origin-[50%_18px]"
          style={{ transform: `rotate(${angle}deg)`, boxShadow: "0 0 8px #ffade0" }}
        />
        <div className="w-6 h-6 rounded-full neo-pressed flex items-center justify-center">
          <span className="font-data-micro text-data-micro text-accent-teal">{value.toFixed(0)}</span>
        </div>
      </div>
    </div>
  );
}


export default function ParameterPanel({ stackId }: { stackId?: string } = {}) {
  const entry = useAppStore((s) => s.effectStack.find((e) => e.id === (stackId || s.selectedStackId)));
  const effectMeta = useAppStore((s) => s.allEffects.find((e) => e.id === entry?.effectId));
  const mediaLoaded = useAppStore((s) => s.mediaLoaded);
  const isVideo = useAppStore((s) => s.isVideo);
  const updateStackParams = useAppStore((s) => s.updateStackParams);
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

  return (
    <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4 custom-scrollbar">
      <div
        className="text-dense-lg font-semibold filigree-header"
        style={{ color: "var(--text-secondary)", fontFamily: "var(--font-hand)" }}
      >
        {entry.effectName} Parameters
      </div>

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
              outline: "none",
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
                {typeof value === "number" && (
                  <KeyframeButton
                    stackId={entry.id}
                    paramId={param.id}
                    currentTime={currentTime}
                    currentValue={Number(value)}
                    keyframes={keyframes}
                    addKeyframe={addKeyframe}
                    removeKeyframe={removeKeyframe}
                  />
                )}
                {typeof value === "number" ? (
                  <input
                    type="number"
                    value={Number(value)}
                    aria-label={param.name}
                    title={param.name}
                    placeholder="0"
                    onChange={(e) => updateStackParams(entry.id, { [param.id]: parseFloat(e.target.value) || 0 })}
                    className="param-readout bg-transparent border-b border-[var(--border-secondary)] px-1 w-12 text-right outline-none focus:border-[var(--accent)]"
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
              const val = Number(value);
              return (
                <ParameterWheel
                  value={val}
                  min={min}
                  max={max}
                  onChange={(v) => updateStackParams(entry.id, { [param.id]: v })}
                />
              );
            })()}

            {/* Audio binding for slider parameters */}
            {audioEnabled && String(param.type).toLowerCase() === "slider" && (
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
  const live = binding ? (currentValue[binding.source] ?? 0) : 0;

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
