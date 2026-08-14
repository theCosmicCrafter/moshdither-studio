interface LabeledSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  ariaLabel: string;
  title: string;
  /** Suffix appended after the numeric readout, e.g. "px". */
  unit?: string;
}

/**
 * Compact label + range input + numeric readout row, in the
 * `font-label-sm text-label-sm uppercase` / `font-code-sm text-code-sm`
 * design-token style used by PostProcessControls.tsx's three sliders.
 *
 * Deliberately scoped to that one file for now (Wave 9g of the codebase
 * cleanup audit): the app has ~12 other slider sites across 8 more files,
 * but they span at least 3 different, actively-diverging styling
 * paradigms (this one's design tokens, older Tailwind arbitrary-value
 * classes, and raw inline `style={{}}` objects) plus real per-site
 * differences (drag-and-drop `stopPropagation`, a bespoke CSS class).
 * Folding those in here would mean either baking in today's
 * inconsistency or unilaterally picking a winning style -- a bigger call
 * than this component should make on its own.
 */
export default function LabeledSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  ariaLabel,
  title,
  unit = "",
}: LabeledSliderProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-label-sm text-label-sm uppercase text-[var(--text-muted)] w-12">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={ariaLabel}
        title={title}
        onChange={(e) => onChange(Number.parseInt(e.target.value, 10))}
        className="flex-1 h-1 bg-[var(--surface-2)] rounded-lg appearance-none cursor-pointer"
      />
      <span className="font-code-sm text-code-sm text-[var(--text-muted)] w-8 text-right">
        {value}
        {unit}
      </span>
    </div>
  );
}
