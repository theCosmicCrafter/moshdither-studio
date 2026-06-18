import { useAppStore } from "../../store";

const CATEGORIES: { id: string; label: string; color: string }[] = [
  { id: "dithering", label: "Dither", color: "var(--cat-dithering)" },
  { id: "analog", label: "Analog", color: "var(--cat-analog)" },
  { id: "color", label: "Color", color: "var(--cat-color)" },
  { id: "pixel_geometry", label: "Pixel", color: "var(--cat-pixel)" },
  { id: "glitch", label: "Glitch", color: "var(--cat-glitch)" },
  { id: "noise", label: "Noise", color: "var(--cat-noise)" },
  { id: "artistic", label: "Art", color: "var(--cat-artistic)" },
  { id: "datamoshing", label: "Mosh", color: "var(--cat-datamoshing)" },
];

export default function CategoryTabs() {
  const active = useAppStore((s) => s.activeCategory);
  const setActiveCategory = useAppStore((s) => s.setActiveCategory);
  const allEffects = useAppStore((s) => s.allEffects);

  return (
    <div
      className="flex flex-wrap gap-1 px-3 py-2"
      style={{ borderBottom: "1px solid var(--border-primary)" }}
    >
      {CATEGORIES.map((cat) => {
        const count = allEffects.filter((e) => e.category === cat.id).length;
        const isActive = active === cat.id;
        return (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className="relative px-2.5 py-1 rounded text-[11px] font-semibold tracking-wide transition-all duration-150"
            style={{
              background: isActive ? "var(--bg-active)" : "transparent",
              color: isActive ? cat.color : "var(--text-muted)",
              border: isActive ? `1px solid ${cat.color}40` : "1px solid transparent",
              boxShadow: isActive ? `inset 0 0 8px ${cat.color}15` : "none",
            }}
          >
            {cat.label}
            {count > 0 && (
              <span
                className="ml-1 text-[9px] tabular-nums"
                style={{ color: isActive ? cat.color : "var(--text-dim)", opacity: 0.6 }}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
