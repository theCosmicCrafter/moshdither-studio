import { useMemo } from "react";
import { useAppStore } from "../../store";

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

export default function EffectList() {
  const allEffects = useAppStore((s) => s.allEffects);
  const activeCategory = useAppStore((s) => s.activeCategory);
  const searchQuery = useAppStore((s) => s.searchQuery);
  const addToStack = useAppStore((s) => s.addToStack);
  const effectStack = useAppStore((s) => s.effectStack);

  const effects = useMemo(() => {
    let filtered = allEffects;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = allEffects.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.category.toLowerCase().includes(q)
      );
    } else {
      filtered = allEffects.filter((e) => e.category === activeCategory);
    }
    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }, [allEffects, activeCategory, searchQuery]);

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar px-2 py-2 space-y-1.5">
      {effects.length === 0 && (
        <div className="text-center py-8 font-body-sm text-body-sm text-on-surface-variant opacity-50">
          <span className="material-symbols-outlined mx-auto mb-2 opacity-30 block" style={{ fontSize: 24 }}>
            layers
          </span>
          No effects found
        </div>
      )}
      {effects.map((effect) => {
        const color = CAT_COLORS[effect.category] || "var(--text-muted)";
        const isInStack = effectStack.some((e) => e.effectId === effect.id);
        return (
          <button
            key={effect.id}
            onClick={() => addToStack(effect)}
            className="group w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-all duration-300 neo-flat filigree-corner hover:border-accent-pink"
          >
            {/* Category indicator line */}
            <div
              className="w-1 h-8 rounded-full flex-shrink-0"
              style={{ background: color, opacity: 0.7 }}
            />
            <div className="flex-1 min-w-0">
              <div className="text-label-md font-label-md text-on-surface group-hover:text-accent-pink transition-colors truncate">
                {effect.name}
              </div>
              <div className="text-label-sm font-label-sm text-on-surface-variant opacity-70 truncate">
                {effect.parameters.length} parameter
                {effect.parameters.length !== 1 ? "s" : ""}
                {isInStack && (
                  <span className="text-accent-pink ml-1">• in stack</span>
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
      })}
    </div>
  );
}
