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
  { id: "audio_reactive", label: "Audio", color: "var(--cat-audio-reactive)" },
  { id: "segmentation", label: "Mask", color: "var(--cat-segmentation)" },
  { id: "composite", label: "Comp", color: "var(--cat-composite)" },
];

export default function CategoryTabs() {
  const active = useAppStore((s) => s.activeCategory);
  const setActiveCategory = useAppStore((s) => s.setActiveCategory);
  const allEffects = useAppStore((s) => s.allEffects);

  return (
    <div className="flex flex-wrap gap-1 px-3 py-2 border-b border-outline-variant/30">
      {CATEGORIES.map((cat) => {
        const count = allEffects.filter((e) => e.category === cat.id).length;
        const isActive = active === cat.id;
        return (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`relative px-2.5 py-1 rounded-md text-label-sm font-label-sm transition duration-300 ${isActive ? "neo-pressed" : "neo-btn"}`}
            style={{
              color: isActive ? cat.color : undefined,
            }}
          >
            <span className={isActive ? "" : "text-on-surface-variant"}>{cat.label}</span>
            {count > 0 && (
              <span
                className="ml-1 text-data-micro font-data-micro tabular-nums"
                style={{ color: isActive ? cat.color : undefined, opacity: 0.6 }}
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
