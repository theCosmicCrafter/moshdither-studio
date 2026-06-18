import { useAppStore, type AudioBinding } from "../../store";
import { SlidersHorizontal, AudioLines, Diamond, Palette } from "lucide-react";
import { PALETTE_PRESETS, fillPaletteParams } from "../../engine/palettePresets";

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

export default function ParameterPanel() {
  const effectStack = useAppStore((s) => s.effectStack);
  const selectedStackId = useAppStore((s) => s.selectedStackId);
  const allEffects = useAppStore((s) => s.allEffects);
  const updateStackParams = useAppStore((s) => s.updateStackParams);
  const audioBindings = useAppStore((s) => s.audioBindings);
  const setAudioBinding = useAppStore((s) => s.setAudioBinding);
  const audioMappedValues = useAppStore((s) => s.audioMappedValues);
  const audioEnabled = useAppStore((s) => s.audioEnabled);
  const currentTime = useAppStore((s) => s.currentTime);
  const keyframes = useAppStore((s) => s.keyframes);
  const addKeyframe = useAppStore((s) => s.addKeyframe);
  const removeKeyframe = useAppStore((s) => s.removeKeyframe);

  const entry = effectStack.find((e) => e.id === selectedStackId);
  if (!entry) {
    return (
      <div
        className="flex-1 flex flex-col items-center justify-center gap-2"
        style={{ color: "var(--text-dim)" }}
      >
        <SlidersHorizontal size={20} opacity={0.3} />
        <span className="text-[11px]">Select an effect to edit parameters</span>
      </div>
    );
  }

  const effectMeta = allEffects.find((e) => e.id === entry.effectId);
  if (!effectMeta) return null;

  return (
    <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
      <div
        className="text-[11px] font-bold tracking-widest uppercase"
        style={{ color: "var(--text-muted)" }}
      >
        {entry.effectName} Parameters
      </div>

      {entry.effectId === "dithering.palette" && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Palette size={12} style={{ color: "var(--accent)" }} />
            <span className="text-[10px] font-medium" style={{ color: "var(--text-secondary)" }}>
              Palette Preset
            </span>
          </div>
          <select
            title="Palette preset"
            aria-label="Palette preset"
            className="w-full text-[10px] rounded px-2 py-1 border-none cursor-pointer"
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

      {effectMeta.parameters.map((param) => {
        const value = entry.params[param.id] ?? param.default;
        return (
          <div key={param.id} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                className="text-[11px] font-medium"
                style={{ color: "var(--text-secondary)" }}
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
                    onChange={(e) => updateStackParams(entry.id, { [param.id]: parseFloat(e.target.value) || 0 })}
                    className="param-readout bg-transparent border-b border-[var(--border-secondary)] px-1 w-12 text-right outline-none focus:border-[var(--accent)]"
                    style={{ fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--text-primary)" }}
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
              const percent = max > min ? Math.min(100, Math.max(0, ((val - min) / (max - min)) * 100)) : 0;
              return (
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={param.step ?? 1}
                  value={val}
                  onChange={(e) =>
                    updateStackParams(entry.id, {
                      [param.id]:
                        param.step && param.step < 1
                          ? parseFloat(e.target.value)
                          : parseInt(e.target.value),
                    })
                  }
                  className="slider-track mt-1"
                  style={{
                    background: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${percent}%, var(--bg-input) ${percent}%, var(--bg-input) 100%)`
                  }}
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
                binding={audioBindings[entry.id]?.[param.id]}
                onSet={setAudioBinding}
                currentValue={audioMappedValues}
              />
            )}

            {String(param.type).toLowerCase() === "select" && param.options && (
              <select
                value={String(param.options[Number(value)] ?? value)}
                onChange={(e) => {
                  const idx = param.options!.indexOf(e.target.value);
                  updateStackParams(entry.id, { [param.id]: idx });
                }}
                className="w-full text-xs rounded px-2 py-1.5 outline-none"
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

            {String(param.type).toLowerCase() === "toggle" && (
              <button
                onClick={() =>
                  updateStackParams(entry.id, {
                    [param.id]: !value,
                  })
                }
                className="w-10 h-5 rounded-full relative transition-all duration-300 shadow-inner"
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
                  className="absolute top-[1px] w-4 h-4 rounded-full bg-white transition-all duration-300"
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
  keyframes: Record<string, Record<string, { id: string; time: number; value: number }[]>>;
  addKeyframe: (stackId: string, paramId: string, keyframe: { id: string; time: number; value: number; easing: "linear" | "easeIn" | "easeOut" | "easeInOut" | "hold" }) => void;
  removeKeyframe: (stackId: string, paramId: string, keyframeId: string) => void;
}) {
  const track = keyframes[stackId]?.[paramId] || [];
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
        color: existing ? "var(--accent)" : "#666",
      }}
    >
      <Diamond size={10} fill={existing ? "var(--accent)" : "none"} />
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
            color: isBound ? "#6cf" : "#888",
          }}
        >
          <AudioLines size={10} />
          {isBound ? "Audio Bound" : "Bind Audio"}
        </button>
        {isBound && (
          <span style={{ fontSize: 10, color: "#6cf", fontFamily: "var(--font-mono)" }}>
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
            className="w-full text-[10px] rounded px-1 py-0.5 outline-none"
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
            <span style={{ fontSize: 9, color: "#888", minWidth: 30 }}>In</span>
            <input
              aria-label="Input min"
              type="number"
              step={0.01}
              value={binding.inputMin}
              onChange={(e) =>
                onSet(stackId, paramId, { ...binding, inputMin: parseFloat(e.target.value) || 0 })
              }
              className="w-10 text-[9px] px-1 py-0.5 rounded outline-none"
              style={{
                background: "var(--bg-input)",
                border: "1px solid var(--border-secondary)",
                color: "var(--text-primary)",
              }}
            />
            <span style={{ fontSize: 9, color: "#666" }}>to</span>
            <input
              aria-label="Input max"
              type="number"
              step={0.01}
              value={binding.inputMax}
              onChange={(e) =>
                onSet(stackId, paramId, { ...binding, inputMax: parseFloat(e.target.value) || 1 })
              }
              className="w-10 text-[9px] px-1 py-0.5 rounded outline-none"
              style={{
                background: "var(--bg-input)",
                border: "1px solid var(--border-secondary)",
                color: "var(--text-primary)",
              }}
            />
          </div>

          <div className="flex gap-1 items-center">
            <span style={{ fontSize: 9, color: "#888", minWidth: 30 }}>Out</span>
            <input
              aria-label="Output min"
              type="number"
              step={0.01}
              value={binding.outputMin}
              onChange={(e) =>
                onSet(stackId, paramId, { ...binding, outputMin: parseFloat(e.target.value) || 0 })
              }
              className="w-10 text-[9px] px-1 py-0.5 rounded outline-none"
              style={{
                background: "var(--bg-input)",
                border: "1px solid var(--border-secondary)",
                color: "var(--text-primary)",
              }}
            />
            <span style={{ fontSize: 9, color: "#666" }}>to</span>
            <input
              aria-label="Output max"
              type="number"
              step={0.01}
              value={binding.outputMax}
              onChange={(e) =>
                onSet(stackId, paramId, { ...binding, outputMax: parseFloat(e.target.value) || 1 })
              }
              className="w-10 text-[9px] px-1 py-0.5 rounded outline-none"
              style={{
                background: "var(--bg-input)",
                border: "1px solid var(--border-secondary)",
                color: "var(--text-primary)",
              }}
            />
          </div>

          <div className="flex gap-2 items-center">
            <label style={{ fontSize: 9, color: "#888", display: "flex", alignItems: "center", gap: 2 }}>
              <input
                type="checkbox"
                checked={binding.gateEnabled}
                onChange={(e) =>
                  onSet(stackId, paramId, { ...binding, gateEnabled: e.target.checked })
                }
              />
              Gate
            </label>
            <label style={{ fontSize: 9, color: "#888", display: "flex", alignItems: "center", gap: 2 }}>
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
