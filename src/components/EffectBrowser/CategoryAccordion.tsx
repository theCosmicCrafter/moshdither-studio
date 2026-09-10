import { useState } from "react";
import { useAppStore, type EffectMeta } from "../../store";
import { isVideoOnlyEffect, VIDEO_ONLY_ON_IMAGE_WARNING } from "../../utils/effectConverter";

const CATEGORIES: { id: string; label: string; icon: string; color: string }[] = [
  { id: "dithering", label: "Dither", icon: "grain", color: "var(--cat-dithering)" },
  { id: "analog", label: "Analog", icon: "videocam", color: "var(--cat-analog)" },
  { id: "color", label: "Color", icon: "palette", color: "var(--cat-color)" },
  { id: "pixel_geometry", label: "Pixel", icon: "grid_on", color: "var(--cat-pixel)" },
  { id: "glitch", label: "Glitch", icon: "broken_image", color: "var(--cat-glitch)" },
  { id: "noise", label: "Noise", icon: "texture", color: "var(--cat-noise)" },
  { id: "artistic", label: "Art", icon: "brush", color: "var(--cat-artistic)" },
  { id: "datamoshing", label: "Mosh", icon: "auto_fix_high", color: "var(--cat-datamoshing)" },
  { id: "audio_reactive", label: "Audio", icon: "graphic_eq", color: "var(--cat-audio-reactive)" },
  { id: "segmentation", label: "Mask", icon: "masks", color: "var(--cat-segmentation)" },
  { id: "composite", label: "Comp", icon: "layers", color: "var(--cat-composite)" },
];

export default function CategoryAccordion() {
  const allEffects = useAppStore((s) => s.allEffects);
  const activeCategory = useAppStore((s) => s.activeCategory);
  const setActiveCategory = useAppStore((s) => s.setActiveCategory);
  const searchQuery = useAppStore((s) => s.searchQuery);
  const addToStack = useAppStore((s) => s.addToStack);
  const effectStack = useAppStore((s) => s.effectStack);

  const [expanded, setExpanded] = useState<string | null>(activeCategory);

  const isSearching = searchQuery.trim().length > 0;

  const toggle = (id: string) => {
    const next = expanded === id ? null : id;
    setExpanded(next);
    if (next) setActiveCategory(next);
  };

  const effectsForCategory = (catId: string) => {
    const q = searchQuery.toLowerCase();
    return allEffects
      .filter((e) => {
        if (e.category !== catId) return false;
        if (!isSearching) return true;
        return (
          e.name.toLowerCase().includes(q) || e.category.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  };

  // Search mode: flat grouped list of matching effects
  if (isSearching) {
    return (
      <div className="flex-1 overflow-y-auto custom-scrollbar px-2 py-2 space-y-3">
        {CATEGORIES.map((cat) => {
          const effects = effectsForCategory(cat.id);
          if (effects.length === 0) return null;
          return (
            <div key={cat.id}>
              <div
                className="flex items-center gap-2 px-2 py-1 text-label-sm font-label-sm uppercase tracking-wider"
                style={{ color: cat.color }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                  {cat.icon}
                </span>
                {cat.label}
                <span className="text-data-micro font-data-micro text-on-surface-variant opacity-60 ml-auto">
                  {effects.length}
                </span>
              </div>
              <div className="space-y-1.5">
                {effects.map((effect) => (
                  <EffectItem
                    key={effect.id}
                    effect={effect}
                    effectStack={effectStack}
                    addToStack={addToStack}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar">
      {CATEGORIES.map((cat) => {
        const isExpanded = expanded === cat.id;
        const effects = effectsForCategory(cat.id);
        return (
          <div key={cat.id} className="border-b border-outline-variant/20 last:border-b-0">
            <button
              onClick={() => toggle(cat.id)}
              className="w-full flex items-center justify-between px-3 py-2 hover:bg-surface/40 transition-colors"
              aria-expanded={isExpanded}
            >
              <div className="flex items-center gap-2">
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 16, color: cat.color }}
                >
                  {cat.icon}
                </span>
                <span className="text-label-sm font-label-sm text-on-surface uppercase tracking-wider">
                  {cat.label}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {effects.length > 0 && (
                  <span className="text-data-micro font-data-micro text-on-surface-variant opacity-60">
                    {effects.length}
                  </span>
                )}
                <span
                  className="material-symbols-outlined text-on-surface-variant transition-transform duration-200"
                  style={{
                    fontSize: 16,
                    transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                  }}
                >
                  expand_more
                </span>
              </div>
            </button>
            {isExpanded && (
              <div className="px-2 pb-2 space-y-1.5">
                {effects.length === 0 ? (
                  <div className="text-center py-4 font-body-sm text-body-sm text-on-surface-variant opacity-50">
                    No effects found
                  </div>
                ) : (
                  effects.map((effect) => (
                    <EffectItem
                      key={effect.id}
                      effect={effect}
                      effectStack={effectStack}
                      addToStack={addToStack}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function EffectItem({
  effect,
  effectStack,
  addToStack,
}: {
  effect: EffectMeta;
  effectStack: { effectId: string }[];
  addToStack: (effect: EffectMeta) => void;
}) {
  const isInStack = effectStack.some((e) => e.effectId === effect.id);
  const mediaLoaded = useAppStore((s) => s.mediaLoaded);
  const isVideo = useAppStore((s) => s.isVideo);
  const isIncompatible = mediaLoaded && !isVideo && isVideoOnlyEffect(effect);
  return (
    <button
      onClick={() => addToStack(effect)}
      className={`group w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition duration-300 neo-flat filigree-corner hover:border-accent-pink ${
        isIncompatible ? "toolbar-disabled" : ""
      }`}
      title={isIncompatible ? VIDEO_ONLY_ON_IMAGE_WARNING : undefined}
    >
      <div className="flex-1 min-w-0">
        <div className="text-label-md font-label-md text-on-surface group-hover:text-accent-pink transition-colors truncate">
          {effect.name}
        </div>
        <div className="text-label-sm font-label-sm text-on-surface-variant opacity-70 truncate">
          {effect.parameters.length} parameter
          {effect.parameters.length === 1 ? "" : "s"}
          {isInStack && <span className="text-accent-pink ml-1">• in stack</span>}
          {isIncompatible && (
            <span
              className="material-symbols-outlined text-amber-400 ml-1 align-middle"
              style={{ fontSize: 12 }}
              title={VIDEO_ONLY_ON_IMAGE_WARNING}
            >
              movie
            </span>
          )}
        </div>
      </div>
      <span
        className="material-symbols-outlined flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-accent-pink"
        style={{ fontSize: 16 }}
      >
        add_circle
      </span>
    </button>
  );
}
