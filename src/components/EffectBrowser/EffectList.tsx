import { useMemo } from "react";
import { useAppStore } from "../../store";
import { Plus, Layers } from "lucide-react";

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
    <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
      {effects.length === 0 && (
        <div
          className="text-center py-8 text-xs"
          style={{ color: "var(--text-dim)" }}
        >
          <Layers size={20} className="mx-auto mb-2 opacity-30" />
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
            className="group w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-md transition-all duration-150"
            style={{
              background: "transparent",
              border: "1px solid transparent",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--bg-hover)";
              e.currentTarget.style.borderColor = `${color}30`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.borderColor = "transparent";
            }}
          >
            {/* Category indicator line */}
            <div
              className="w-1 h-8 rounded-full flex-shrink-0"
              style={{ background: color, opacity: 0.7 }}
            />
            <div className="flex-1 min-w-0">
              <div
                className="text-[12px] font-medium truncate"
                style={{ color: "var(--text-primary)" }}
              >
                {effect.name}
              </div>
              <div
                className="text-[10px] truncate"
                style={{ color: "var(--text-muted)" }}
              >
                {effect.parameters.length} parameter
                {effect.parameters.length !== 1 ? "s" : ""}
                {isInStack && (
                  <span style={{ color: "var(--accent)" }} className="ml-1">
                    • in stack
                  </span>
                )}
              </div>
            </div>
            <Plus
              size={14}
              className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ color: "var(--accent)" }}
            />
          </button>
        );
      })}
    </div>
  );
}
