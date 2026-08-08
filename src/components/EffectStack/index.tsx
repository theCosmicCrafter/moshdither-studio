import { useRef, useState, useMemo } from "react";
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

  const containerRef = useRef<HTMLDivElement>(null);
  
  const [filterQuery, setFilterQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const filteredStack = useMemo(() => {
    if (!filterQuery.trim()) return effectStack;
    const lower = filterQuery.toLowerCase();
    return effectStack.filter(e => e.effectName.toLowerCase().includes(lower));
  }, [effectStack, filterQuery]);

  const handleExpandAll = () => setExpandedIds(new Set(effectStack.map(e => e.id)));
  const handleCollapseAll = () => {
    setExpandedIds(new Set());
    if (selectedStackId) selectStackItem(null);
  };

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
        <div className="flex items-center gap-2">
          <button
            onClick={expandedIds.size > 0 || selectedStackId ? handleCollapseAll : handleExpandAll}
            className="material-symbols-outlined neo-btn p-1 rounded-full text-on-surface-variant hover:text-accent-teal transition-colors"
            style={{ fontSize: 16 }}
            title={expandedIds.size > 0 || selectedStackId ? "Collapse All" : "Expand All"}
          >
            {expandedIds.size > 0 || selectedStackId ? "unfold_less" : "unfold_more"}
          </button>
          <span className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-widest bg-surface/40 px-2 rounded">
            Stack
          </span>
        </div>
      </div>

      {/* Filter Input */}
      {stackCount > 0 && (
        <div className="px-4 py-2 border-b border-outline-variant/30 flex-shrink-0">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-2 top-1/2 -translate-y-1/2 text-on-surface-variant/50" style={{ fontSize: 16 }}>
              search
            </span>
            <input
              type="text"
              placeholder="Filter effects..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="w-full bg-surface/50 border border-outline/20 rounded pl-8 pr-2 py-1 text-[11px] text-on-surface outline-none focus:border-accent-teal/50 transition-colors"
            />
          </div>
        </div>
      )}

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
        ) : filteredStack.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-on-surface-variant opacity-50">
            <span className="text-label-sm font-label-sm text-center">
              No matching effects
            </span>
          </div>
        ) : (
          filteredStack.map((entry) => {
            const isSelected = selectedStackId === entry.id || expandedIds.has(entry.id);
            const category = entry.effectId.split(".")[0];
            const color = CAT_COLORS[category] || "var(--text-muted)";
            // moveStackItem splices the full, unfiltered effectStack by
            // position, so the index passed to it must be this entry's
            // position there -- not its position within filteredStack. With a
            // filter active those differ, and reordering by the filtered
            // position moved a different, invisible pair of effects instead
            // of the one the user clicked.
            const realIndex = effectStack.findIndex((e) => e.id === entry.id);

            return (
              <div
                key={entry.id}
                onClick={() => selectStackItem(entry.id)}
                className={`group relative flex flex-col p-3 rounded-lg cursor-pointer transition-all duration-300 filigree-corner ${
                  isSelected ? "neo-pressed active-card-pulse border border-accent-pink/40" : "neo-flat hover:border-outline-variant/50"
                } ${entry.maskId ? "ring-1 ring-accent-pink/50 shadow-[0_0_10px_rgba(236,72,153,0.2)]" : ""}`}
                style={{ opacity: entry.enabled ? 1 : 0.4 }}
              >
                {/* Header row */}
                <div className="flex items-center gap-3 w-full">
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
                    {realIndex > 0 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); moveStackItem(realIndex, realIndex - 1); }}
                        className="material-symbols-outlined neo-btn p-1 rounded-full text-on-surface-variant hover:text-accent-teal transition-colors"
                        style={{ fontSize: 14 }}
                        title="Move Up"
                      >
                        arrow_upward
                      </button>
                    )}
                    {realIndex < stackCount - 1 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); moveStackItem(realIndex, realIndex + 1); }}
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

                {/* Inline Parameters directly inside active card */}
                {isSelected && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="mt-3 pt-3 border-t border-outline-variant/30 overflow-y-auto max-h-[340px] custom-scrollbar"
                  >
                    <ParameterPanel stackId={entry.id} />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
