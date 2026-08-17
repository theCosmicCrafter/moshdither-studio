import { useAppStore } from "../../store";

interface AudioVisualizerProps {
  variant?: "bars" | "spectrum";
  maxBars?: number;
  className?: string;
}

const BAND_COLORS = [
  "var(--accent-pink, #ff4444)",
  "var(--accent-teal, #ff8844)",
  "var(--primary, #ffcc44)",
  "#44ff44",
  "#44ffcc",
  "#4488ff",
  "#cc44ff",
];

export function AudioVisualizer({ variant = "bars", maxBars = 32, className = "" }: AudioVisualizerProps) {
  const audioBandEnergies = useAppStore((s) => s.audioBandEnergies);
  const values = Object.values(audioBandEnergies);

  if (values.length === 0) return null;

  return (
    <div className={`flex items-end justify-center gap-[2px] w-full overflow-hidden ${className}`}>
      {values.slice(0, maxBars).map((v: number, i: number) => {
        const color = variant === "spectrum" ? BAND_COLORS[i % BAND_COLORS.length] : undefined;
        return (
          <div
            key={i}
            // Bar height is driven by the inline style below, and `height` is
            // not in Tailwind's bare `transition` property list, so it must be
            // named explicitly or the meter jumps between values instead of
            // animating. `transition-all` would cover it but also animates
            // `outline`, which suppresses the app's :focus-visible ring.
            className={`w-1 rounded-t transition-[height] duration-75 ${
              variant === "spectrum" ? "" : "bg-accent-teal"
            }`}
            style={{
              height: `${Math.max(5, Math.min(100, v * 100))}%`,
              backgroundColor: color,
              opacity: 0.85,
            }}
          />
        );
      })}
    </div>
  );
}

export default AudioVisualizer;
