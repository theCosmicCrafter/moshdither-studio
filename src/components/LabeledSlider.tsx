interface LabeledSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  /** Defaults to `label` when omitted -- most sliders don't need a longer
   * spoken description than their visible label. */
  ariaLabel?: string;
  title?: string;
  /** Suffix appended after the numeric readout, e.g. "px", "%". */
  unit?: string;
  /** Overrides `value` for the readout text only (e.g. a rounded
   * percentage for a 0-1 opacity slider). Defaults to `value` itself. */
  displayValue?: number;
  /** Set false to render no readout at all -- e.g. a compact toolbar
   * slider that only shows its value via `title`'s tooltip. */
  showValue?: boolean;
  /** "inline" (default): label, slider, and readout share one row.
   * "stacked": label (and optional readout) on one line, slider full-width
   * below -- for settings-panel-style controls with more vertical room. */
  layout?: "inline" | "stacked";
  /** Material Symbols icon name shown before the label (stacked layout only). */
  icon?: string;
  /** When set, pairs a real <label htmlFor> with the input's id instead of
   * aria-label -- the stronger accessibility association, for contexts
   * that have the vertical room for a two-line stacked control. */
  id?: string;
  /** Full override of the <input>'s className, for a genuinely different
   * track/thumb treatment (e.g. a neumorphic slider style) rather than
   * the shared flat track. */
  trackClassName?: string;
  /** Full override of the readout span's className. */
  valueClassName?: string;
  /** Passthrough for the input's own click handler -- e.g.
   * `stopPropagation` when the slider lives inside a draggable/clickable
   * row that would otherwise also react to the click. */
  onInputClick?: (e: React.MouseEvent<HTMLInputElement>) => void;
}

const DEFAULT_TRACK_CLASSNAME =
  "flex-1 h-1 bg-surface-container rounded-lg appearance-none cursor-pointer";
const DEFAULT_STACKED_TRACK_CLASSNAME = "w-full accent-[var(--accent-teal)]";

/**
 * Shared label + range input + numeric readout control, in the
 * `font-label-sm`/`font-code-sm` design-token style. Originally scoped to
 * PostProcessControls.tsx's 3 sliders only (Wave 9g), then extended to
 * cover the app's other ~12 slider sites once the design-token migration
 * from PR #21 had actually landed everywhere -- consolidating earlier
 * would have meant baking in a still-unsettled mix of styles.
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
  displayValue,
  showValue = true,
  layout = "inline",
  icon,
  id,
  trackClassName,
  valueClassName,
  onInputClick,
}: LabeledSliderProps) {
  const shownValue = displayValue ?? value;
  const resolvedAriaLabel = ariaLabel ?? label;

  const input = (
    <input
      id={id}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      aria-label={id ? undefined : resolvedAriaLabel}
      title={title}
      onChange={(e) => onChange(Number.parseFloat(e.target.value))}
      onClick={onInputClick}
      className={
        trackClassName ?? (layout === "stacked" ? DEFAULT_STACKED_TRACK_CLASSNAME : DEFAULT_TRACK_CLASSNAME)
      }
    />
  );

  const valueNode = showValue && (
    <span
      className={
        valueClassName ??
        (layout === "stacked"
          ? "font-code-sm text-code-sm text-on-surface-variant"
          : "font-code-sm text-code-sm text-[var(--text-muted)] min-w-[32px] text-right whitespace-nowrap")
      }
    >
      {shownValue}
      {unit}
    </span>
  );

  const LabelTag = id ? "label" : "span";
  const labelNode = (
    <LabelTag
      {...(id ? { htmlFor: id } : {})}
      className={
        layout === "stacked"
          ? "font-label-md text-label-md text-on-surface-variant flex items-center gap-1.5"
          : "font-label-sm text-label-sm uppercase text-[var(--text-muted)] min-w-[50px] whitespace-nowrap"
      }
    >
      {icon && (
        <span className="material-symbols-outlined panel-menu-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      {label}
    </LabelTag>
  );

  if (layout === "stacked") {
    return (
      <div className="space-y-1">
        <div className="flex justify-between items-center">
          {labelNode}
          {valueNode}
        </div>
        {input}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {labelNode}
      {input}
      {valueNode}
    </div>
  );
}
