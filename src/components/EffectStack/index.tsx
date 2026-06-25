import { useState, useRef, useCallback } from "react";
import { useAppStore } from "../../store";
import ParameterPanel from "./ParameterPanel";

export default function EffectStack() {
  const effectStack = useAppStore((s) => s.effectStack);
  const selectedStackId = useAppStore((s) => s.selectedStackId);
  const stackCount = useAppStore((s) => s.effectStack.length);
  const removeFromStack = useAppStore((s) => s.removeFromStack);
  const toggleStackItem = useAppStore((s) => s.toggleStackItem);
  const selectStackItem = useAppStore((s) => s.selectStackItem);
  const moveStackItem = useAppStore((s) => s.moveStackItem);
  const setStackItemMask = useAppStore((s) => s.setStackItemMask);
  const setStackItemMaskMode = useAppStore((s) => s.setStackItemMaskMode);
  const hasActiveMask = useAppStore((s) => !!s.activeMask);
  const sam3MaskCount = useAppStore((s) => s.sam3Masks.length);

  const [paramsExpanded, setParamsExpanded] = useState(true);
  const [paramsHeight, setParamsHeight] = useState(220);
  const dragRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = true;
    const startY = e.clientY;
    const startHeight = paramsHeight;
    const containerH = containerRef.current?.offsetHeight ?? 600;
    const handleMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = startY - ev.clientY;
      const next = Math.max(120, Math.min(containerH - 120, startHeight + delta));
      setParamsHeight(next);
    };
    const handleUp = () => {
      dragRef.current = false;
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  }, [paramsHeight]);

  const CAT_COLORS: Record<string, string> = {
    dithering: "var(--cat-dithering)",
    analog: "var(--cat-analog)",
    color: "var(--cat-color)",
    pixel_geometry: "var(--cat-pixel)",
    glitch: "var(--cat-glitch)",
    noise: "var(--cat-noise)",
    artistic: "var(--cat-artistic)",
    datamoshing: "var(--cat-datamoshing)",
    audio_reactive: "var(--cat-audio-reactive)",
    segmentation: "var(--cat-segmentation)",
    composite: "var(--cat-composite)",
    overlay: "var(--cat-overlay, var(--accent-teal))",
  };

  return (
    <div ref={containerRef} className="flex flex-col h-full bg-transparent backdrop-blur-md">
      {/* Stack Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/30 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div>
            <h3 className="font-headline-md text-headline-md solar-text uppercase filigree-header ml-6 cursor-default">
              Inspector
            </h3>
            <p className="font-label-sm text-label-sm text-accent-teal opacity-90 mt-1 pl-6">
              {stackCount > 0 ? `${stackCount} effect${stackCount !== 1 ? "s" : ""} in stack` : "Empty stack"}
            </p>
          </div>
        </div>
        <span className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-widest bg-surface/40 px-2 rounded">
          Stack
        </span>
      </div>

      {/* Stack List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-3 space-y-3 min-h-0">
        {stackCount === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-on-surface-variant opacity-50">
            <span className="material-symbols-outlined opacity-20" style={{ fontSize: 32 }}>
              layers
            </span>
            <span className="text-label-sm font-label-sm text-center" style={{ fontFamily: "var(--font-hand)" }}>
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
                className={`group relative flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all duration-300 filigree-corner ${isSelected ? "neo-pressed active-card-pulse" : "neo-flat"} ${entry.maskId ? "ring-1 ring-accent-pink/50 shadow-[0_0_10px_rgba(236,72,153,0.2)]" : ""}`}
                style={{ opacity: entry.enabled ? 1 : 0.4 }}
              >
                {/* Drag handle */}
                <span
                  className="material-symbols-outlined flex-shrink-0 opacity-0 group-hover:opacity-100 cursor-grab text-on-surface-variant hover:text-accent-pink transition-transform hover:scale-110"
                  style={{ fontSize: 16 }}
                >
                  drag_indicator
                </span>

                {/* Category dot */}
                <div
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: color }}
                />

                {/* Name */}
                <div className="flex-1 min-w-0">
                  <div
                    className="text-label-md font-label-md truncate"
                    style={{ color: isSelected ? color : undefined }}
                  >
                    <span className={isSelected ? "" : "text-on-surface"}>{entry.effectName}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-label-sm font-label-sm text-on-surface-variant opacity-70 truncate">
                      {Object.keys(entry.params).length} params
                    </span>
                    {entry.maskId && (
                      <span className="material-symbols-outlined text-accent-pink" style={{ fontSize: 12 }} title="Effect locked to mask">
                        lock
                      </span>
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
                  className="themed-select text-data-micro font-data-micro cursor-pointer"
                  style={{ maxWidth: 90 }}
                  title="Assign mask to this effect"
                >
                  <option value="">No mask</option>
                  <option value="active" disabled={!hasActiveMask}>Active Mask</option>
                  {Array.from({ length: Math.max(sam3MaskCount, entry.maskId?.startsWith("sam3-") ? Number.parseInt(entry.maskId.replace("sam3-", ""), 10) + 1 : 0) }, (_, i) => (
                    <option key={i} value={`sam3-${i}`}>SAM3 Mask {i + 1}{i >= sam3MaskCount ? " (saved)" : ""}</option>
                  ))}
                </select>

                {/* Mask mode selector */}
                {entry.maskId && (
                  <select
                    value={entry.maskMode}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      setStackItemMaskMode(entry.id, e.target.value as "inside" | "outside" | "alpha");
                    }}
                    className="themed-select text-data-micro font-data-micro cursor-pointer"
                    style={{ maxWidth: 70 }}
                    title="Mask blending mode"
                  >
                    <option value="inside">Inside</option>
                    <option value="outside">Outside</option>
                    <option value="alpha">Alpha</option>
                  </select>
                )}

                {/* Controls */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleStackItem(entry.id); }}
                    className="material-symbols-outlined neo-btn p-1 rounded-full text-on-surface-variant hover:text-accent-teal transition-colors"
                    style={{ fontSize: 14 }}
                    title={entry.enabled ? "Disable" : "Enable"}
                  >
                    {entry.enabled ? "visibility" : "visibility_off"}
                  </button>
                  {index > 0 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); moveStackItem(index, index - 1); }}
                      className="material-symbols-outlined neo-btn p-1 rounded-full text-on-surface-variant hover:text-accent-teal transition-colors"
                      style={{ fontSize: 14 }}
                      title="Move Up"
                    >
                      arrow_upward
                    </button>
                  )}
                  {index < stackCount - 1 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); moveStackItem(index, index + 1); }}
                      className="material-symbols-outlined neo-btn p-1 rounded-full text-on-surface-variant hover:text-accent-teal transition-colors"
                      style={{ fontSize: 14 }}
                      title="Move Down"
                    >
                      arrow_downward
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); removeFromStack(entry.id); }}
                    className="material-symbols-outlined neo-btn p-1 rounded-full text-on-surface-variant hover:text-accent-pink transition-colors"
                    style={{ fontSize: 14 }}
                    title="Remove"
                  >
                    delete
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Parameter Panel — collapsible & resizable */}
      {stackCount > 0 && (
        <>
          {/* Drag handle / collapse bar */}
          <div
            onMouseDown={paramsExpanded ? handleDragStart : undefined}
            className="flex-shrink-0 flex items-center justify-between px-3 py-1.5 border-t border-outline-variant/30 cursor-row-resize hover:bg-accent-teal/5 transition-colors group"
            title={paramsExpanded ? "Drag to resize, click to collapse" : "Click to expand parameters"}
            onClick={(e) => {
              if (e.target === e.currentTarget) setParamsExpanded((v) => !v);
            }}
          >
            <span className="text-[10px] font-label-sm text-on-surface-variant uppercase tracking-wider flex items-center gap-1.5">
              <span className="material-symbols-outlined" style={{ fontSize: 12 }}>tune</span>
              Parameters
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); setParamsExpanded((v) => !v); }}
              className="text-on-surface-variant hover:text-accent-teal transition-colors"
              title={paramsExpanded ? "Collapse" : "Expand"}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14, transition: "transform 0.2s", transform: paramsExpanded ? "rotate(180deg)" : "none" }}>
                expand_less
              </span>
            </button>
          </div>

          {paramsExpanded && (
            <div
              className="flex-shrink-0 flex flex-col overflow-hidden"
              style={{ height: paramsHeight }}
            >
              <ParameterPanel />
            </div>
          )}
        </>
      )}
    </div>
  );
}
