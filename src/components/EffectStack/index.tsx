import { useRef, useState, useMemo } from "react";
import { useAppStore } from "../../store";
import ParameterPanel from "./ParameterPanel";
import StackContextMenu, { type StackContextMenuItem } from "./StackContextMenu";
import { isVideoOnlyEffect, VIDEO_ONLY_ON_IMAGE_WARNING } from "../../utils/effectConverter";
import { effectPipeline } from "../../lib/effectPipeline";

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
  const allEffects = useAppStore((s) => s.allEffects);
  const mediaLoaded = useAppStore((s) => s.mediaLoaded);
  const isVideo = useAppStore((s) => s.isVideo);
  // True only while a still image (not video) is loaded -- gates the
  // video-only-effect warning below. Video-only effects (the datamoshing
  // family) have a process_frame that is a literal no-op clone on a single
  // frame, so left in the stack over a still image they change nothing with
  // no indication why.
  const showVideoOnlyWarnings = mediaLoaded && !isVideo;

  const duplicateStackItem = useAppStore((s) => s.duplicateStackItem);
  const soloStackItem = useAppStore((s) => s.soloStackItem);
  const copyStackItem = useAppStore((s) => s.copyStackItem);
  const pasteStackItem = useAppStore((s) => s.pasteStackItem);
  const copiedStackEntry = useAppStore((s) => s.copiedStackEntry);

  const containerRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  
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
      {/* Layers header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-outline-variant/30 flex-shrink-0">
        <div className="flex items-center gap-3">
          <h3 className="text-label-sm font-label-sm uppercase tracking-widest text-on-surface-variant cursor-default">
            Layers
          </h3>
          <span className="font-mono text-[11px] text-accent-teal" data-testid="layers-count">
            {stackCount > 0 ? `${stackCount}` : "empty"}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={expandedIds.size > 0 || selectedStackId ? handleCollapseAll : handleExpandAll}
            className="material-symbols-outlined btn-icon p-1 rounded text-on-surface-variant hover:text-on-surface transition-colors"
            style={{ fontSize: 16 }}
            title={expandedIds.size > 0 || selectedStackId ? "Collapse All" : "Expand All"}
          >
            {expandedIds.size > 0 || selectedStackId ? "unfold_less" : "unfold_more"}
          </button>
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
              className="w-full bg-surface/50 border border-outline/20 rounded pl-8 pr-2 py-1 text-label-sm font-label-sm text-on-surface focus:border-accent-teal/50 transition-colors"
            />
          </div>
        </div>
      )}

      {/* Stack List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-3 space-y-3 min-h-0">
        {stackCount === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-on-surface-variant">
            <span className="material-symbols-outlined opacity-20" style={{ fontSize: 32 }}>
              layers
            </span>
            <span className="text-label-sm font-label-sm text-center">
              No layers yet
              <br />
              Click an effect in the Library to add it
            </span>
          </div>
        ) : filteredStack.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-on-surface-variant">
            <span className="text-label-sm font-label-sm text-center">
              No matching effects
            </span>
          </div>
        ) : (
          filteredStack.map((entry) => {
            const isSelected = selectedStackId === entry.id || expandedIds.has(entry.id);
            const category = entry.effectId.split(".")[0];
            const color = CAT_COLORS[category] || "var(--text-muted)";
            const effectMeta = allEffects.find((e) => e.id === entry.effectId);
            const isVideoOnlyOnImage =
              showVideoOnlyWarnings && !!effectMeta && isVideoOnlyEffect(effectMeta);

            return (
              <div
                key={entry.id}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                aria-label={`${entry.effectName} layer`}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    selectStackItem(entry.id);
                  } else if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
                    e.preventDefault();
                    selectStackItem(entry.id);
                    const r = e.currentTarget.getBoundingClientRect();
                    setContextMenu({ x: r.left + 24, y: r.top + 24, id: entry.id });
                  }
                }}
                onClick={() => selectStackItem(entry.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  selectStackItem(entry.id);
                  setContextMenu({ x: e.clientX, y: e.clientY, id: entry.id });
                }}
                className={`group relative flex flex-col p-3 rounded-lg cursor-pointer transition duration-150 border-l-2 ${
                  isSelected ? "neo-pressed border-l-accent-pink" : "neo-flat border-l-transparent hover:border-outline-variant/50"
                } ${entry.maskId ? "ring-1 ring-accent-pink/50" : ""}`}
                style={{ opacity: entry.enabled ? 1 : 0.45 }}
              >
                {/* Header row */}
                <div className="flex items-center gap-2.5 w-full">
                  {/* Drag handle */}
                  <span
                    className="material-symbols-outlined flex-shrink-0 opacity-0 group-hover:opacity-100 cursor-grab text-on-surface-variant hover:text-on-surface"
                    style={{ fontSize: 16 }}
                  >
                    drag_indicator
                  </span>

                  {/* Always-visible eye toggle */}
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleStackItem(entry.id); }}
                    className={`material-symbols-outlined flex-shrink-0 w-6 h-6 flex items-center justify-center rounded transition-colors ${
                      entry.enabled ? "text-accent-pink" : "text-on-surface-variant opacity-60"
                    }`}
                    style={{ fontSize: 16 }}
                    title={entry.enabled ? "Disable layer" : "Enable layer"}
                  >
                    {entry.enabled ? "visibility" : "visibility_off"}
                  </button>

                  {/* Name */}
                  <div className="flex-1 min-w-0">
                    <div className="text-label-md font-label-md truncate flex items-center gap-1.5">
                      <span className="text-on-surface truncate">{entry.effectName}</span>
                      {(() => {
                        const pipeline = effectMeta ? effectPipeline(effectMeta) : null;
                        if (pipeline === "sim")
                          return (
                            <span className="sim-chip" title="Pixel-domain simulation — not real codec corruption. True bitstream mosh uses FFglitch in Export.">
                              sim
                            </span>
                          );
                        if (pipeline === "codec")
                          return (
                            <span className="codec-chip" title="Real bitstream corruption via FFglitch">
                              codec
                            </span>
                          );
                        return null;
                      })()}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-label-sm font-label-sm truncate" style={{ color }}>
                        {category}
                        {entry.maskId ? " · masked" : ""}
                      </span>
                      {isVideoOnlyOnImage && (
                        <span
                          className="material-symbols-outlined"
                          style={{ fontSize: 12, color: "var(--accent-gold, #ffb400)" }}
                          title={VIDEO_ONLY_ON_IMAGE_WARNING}
                        >
                          warning
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Kebab menu — all layer actions live here */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      selectStackItem(entry.id);
                      setContextMenu({ x: e.clientX, y: e.clientY, id: entry.id });
                    }}
                    className="material-symbols-outlined flex-shrink-0 w-6 h-6 flex items-center justify-center rounded text-on-surface-variant opacity-0 group-hover:opacity-100 focus-visible:opacity-100 group-focus-within:opacity-100 hover:text-on-surface transition-opacity"
                    style={{ fontSize: 18 }}
                    title="Layer actions"
                  >
                    more_vert
                  </button>
                </div>

                {/* Expanded: mask controls + parameters */}
                {isSelected && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="mt-3 pt-3 border-t border-outline-variant/30 overflow-y-auto max-h-[340px] custom-scrollbar"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <select
                        value={entry.maskId ?? ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          setStackItemMask(entry.id, val === "" ? null : val);
                        }}
                        className="themed-select text-data-micro font-data-micro cursor-pointer"
                        style={{ maxWidth: 110 }}
                        title="Assign mask to this effect"
                      >
                        <option value="">No mask</option>
                        <option value="active" disabled={!hasActiveMask}>Active Mask</option>
                        {Array.from({ length: Math.max(sam3MaskCount, entry.maskId?.startsWith("sam3-") ? Number.parseInt(entry.maskId.replace("sam3-", ""), 10) + 1 : 0) }, (_, i) => (
                          <option key={i} value={`sam3-${i}`}>SAM3 Mask {i + 1}{i >= sam3MaskCount ? " (saved)" : ""}</option>
                        ))}
                      </select>
                      {entry.maskId && (
                        <select
                          value={entry.maskMode}
                          onChange={(e) => {
                            setStackItemMaskMode(entry.id, e.target.value as "inside" | "outside" | "alpha");
                          }}
                          className="themed-select text-data-micro font-data-micro cursor-pointer"
                          style={{ maxWidth: 80 }}
                          title="Mask blending mode"
                        >
                          <option value="inside">Inside</option>
                          <option value="outside">Outside</option>
                          <option value="alpha">Alpha</option>
                        </select>
                      )}
                    </div>
                    <ParameterPanel stackId={entry.id} />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {contextMenu && (() => {
        const entry = effectStack.find((e) => e.id === contextMenu.id);
        if (!entry) return null;
        const realIndex = effectStack.findIndex((e) => e.id === entry.id);
        const soloed =
          entry.enabled && effectStack.every((e) => e.id === entry.id || !e.enabled);
        const items: StackContextMenuItem[] = [
          {
            label: entry.enabled ? "Disable" : "Enable",
            icon: entry.enabled ? "visibility_off" : "visibility",
            onSelect: () => toggleStackItem(entry.id),
          },
          {
            // Label reflects what the action will do, so the toggle is not a
            // guess -- "Solo" isolates, "Unsolo" restores the rest.
            label: soloed ? "Unsolo" : "Solo",
            icon: "headphones",
            onSelect: () => soloStackItem(entry.id),
          },
          {
            label: "Move Up",
            icon: "arrow_upward",
            disabled: realIndex <= 0,
            onSelect: () => moveStackItem(realIndex, realIndex - 1),
          },
          {
            label: "Move Down",
            icon: "arrow_downward",
            disabled: realIndex >= effectStack.length - 1,
            onSelect: () => moveStackItem(realIndex, realIndex + 1),
          },
          {
            label: "Duplicate",
            icon: "file_copy",
            separatorBefore: true,
            onSelect: () => duplicateStackItem(entry.id),
          },
          { label: "Copy", icon: "content_copy", onSelect: () => copyStackItem(entry.id) },
          {
            label: copiedStackEntry ? `Paste ${copiedStackEntry.effectName}` : "Paste",
            icon: "content_paste",
            disabled: !copiedStackEntry,
            onSelect: () => pasteStackItem(),
          },
          {
            label: "Remove",
            icon: "delete",
            separatorBefore: true,
            onSelect: () => removeFromStack(entry.id),
          },
        ];
        return (
          <StackContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={items}
            onClose={() => setContextMenu(null)}
          />
        );
      })()}
    </div>
  );
}
