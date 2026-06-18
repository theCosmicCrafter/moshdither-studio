import { useAppStore } from "../../store";
import ParameterPanel from "./ParameterPanel";
import {
  GripVertical,
  Eye,
  EyeOff,
  Trash2,
  Layers,
  ArrowUp,
  ArrowDown,
  Shield,
} from "lucide-react";

export default function EffectStack() {
  const effectStack = useAppStore((s) => s.effectStack);
  const selectedStackId = useAppStore((s) => s.selectedStackId);
  const removeFromStack = useAppStore((s) => s.removeFromStack);
  const toggleStackItem = useAppStore((s) => s.toggleStackItem);
  const selectStackItem = useAppStore((s) => s.selectStackItem);
  const moveStackItem = useAppStore((s) => s.moveStackItem);
  const setStackItemMask = useAppStore((s) => s.setStackItemMask);
  const activeMask = useAppStore((s) => s.activeMask);
  const sam3Masks = useAppStore((s) => s.sam3Masks);

  const CAT_COLORS: Record<string, string> = {
    dithering: "var(--cat-dithering)",
    analog: "var(--cat-analog)",
    color: "var(--cat-color)",
    pixel_geometry: "var(--cat-pixel)",
    glitch: "var(--cat-glitch)",
    noise: "var(--cat-noise)",
    artistic: "var(--cat-artistic)",
    datamoshing: "var(--cat-datamoshing)",
  };

  return (
    <div className="flex flex-col h-full">
      {/* Stack Header */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ borderBottom: "1px solid var(--border-primary)" }}
      >
        <div className="flex items-center gap-2">
          <Layers size={13} style={{ color: "var(--accent)" }} />
          <span
            className="text-[11px] font-bold tracking-widest uppercase"
            style={{ color: "var(--text-muted)" }}
          >
            Stack
          </span>
          <span
            className="text-[10px] tabular-nums px-1.5 py-0.5 rounded"
            style={{
              background: "var(--bg-input)",
              color: "var(--text-muted)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {effectStack.length}
          </span>
        </div>
      </div>

      {/* Stack List */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1 min-h-0">
        {effectStack.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center gap-2 py-8"
            style={{ color: "var(--text-dim)" }}
          >
            <Layers size={24} opacity={0.2} />
            <span className="text-[11px] text-center">
              No effects in stack
              <br />
              Click an effect from the browser to add it
            </span>
          </div>
        ) : (
          effectStack.map((entry, index) => {
            const isSelected = selectedStackId === entry.id;
            const category = entry.effectId.split(".")[0];
            const color = CAT_COLORS[category] || "var(--text-muted)";

            return (
              <div
                key={entry.id}
                onClick={() => selectStackItem(entry.id)}
                className="group relative flex items-center gap-1.5 px-2 py-2 rounded-md cursor-pointer transition-all duration-150"
                style={{
                  background: isSelected
                    ? "var(--bg-active)"
                    : "transparent",
                  border: isSelected
                    ? `1px solid ${color}50`
                    : "1px solid transparent",
                  boxShadow: isSelected
                    ? `inset 3px 0 0 ${color}, 0 0 12px ${color}10`
                    : "none",
                  opacity: entry.enabled ? 1 : 0.4,
                }}
              >
                {/* Drag handle */}
                <GripVertical
                  size={14}
                  className="flex-shrink-0 opacity-0 group-hover:opacity-100 cursor-grab"
                  style={{ color: "var(--text-muted)" }}
                />

                {/* Category dot */}
                <div
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: color }}
                />

                {/* Name */}
                <div className="flex-1 min-w-0">
                  <div
                    className="text-[11px] font-medium truncate"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {entry.effectName}
                  </div>
                  <div className="flex items-center gap-1">
                    <span
                      className="text-[9px] truncate"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {Object.keys(entry.params).length} params
                    </span>
                    {entry.maskId && (
                      <Shield size={9} style={{ color: "var(--accent)" }} />
                    )}
                  </div>
                </div>

                {/* Mask selector */}
                <select
                  value={entry.maskId ?? ""}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    const val = e.target.value;
                    setStackItemMask(entry.id, val === "" ? null : val);
                  }}
                  className="text-[9px] rounded px-1 py-0.5 border-none cursor-pointer"
                  style={{
                    background: "var(--bg-input)",
                    color: "var(--text-muted)",
                    outline: "none",
                    maxWidth: 90,
                  }}
                  title="Assign mask to this effect"
                >
                  <option value="">No mask</option>
                  <option value="active" disabled={!activeMask}>Active Mask</option>
                  {sam3Masks.map((_, i) => (
                    <option key={i} value={`sam3-${i}`}>SAM3 Mask {i + 1}</option>
                  ))}
                </select>

                {/* Controls */}
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleStackItem(entry.id);
                    }}
                    className="btn-icon"
                    style={{ width: 22, height: 22 }}
                    title={entry.enabled ? "Disable" : "Enable"}
                  >
                    {entry.enabled ? (
                      <Eye size={11} />
                    ) : (
                      <EyeOff size={11} />
                    )}
                  </button>
                  {index > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        moveStackItem(index, index - 1);
                      }}
                      className="btn-icon"
                      style={{ width: 22, height: 22 }}
                      title="Move Up"
                    >
                      <ArrowUp size={11} />
                    </button>
                  )}
                  {index < effectStack.length - 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        moveStackItem(index, index + 1);
                      }}
                      className="btn-icon"
                      style={{ width: 22, height: 22 }}
                      title="Move Down"
                    >
                      <ArrowDown size={11} />
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFromStack(entry.id);
                    }}
                    className="btn-icon"
                    style={{ width: 22, height: 22 }}
                    title="Remove"
                  >
                    <Trash2 size={11} style={{ color: "var(--danger)" }} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Parameter Panel */}
      <div
        className="flex-shrink-0 flex flex-col"
        style={{
          height: effectStack.length > 0 ? 280 : 0,
          borderTop: effectStack.length > 0 ? "1px solid var(--border-primary)" : "none",
          overflow: "hidden",
        }}
      >
        {effectStack.length > 0 && <ParameterPanel />}
      </div>
    </div>
  );
}
