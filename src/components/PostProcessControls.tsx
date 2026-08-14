// src/components/PostProcessControls.tsx
import LabeledSlider from "./LabeledSlider";

interface PostProcessControlsProps {
  ppGrow: number;
  setPpGrow: (v: number) => void;
  ppShrink: number;
  setPpShrink: (v: number) => void;
  ppFeather: number;
  setPpFeather: (v: number) => void;
  ppFillHoles: boolean;
  setPpFillHoles: (v: boolean) => void;
  isLoading: boolean;
  handlePostprocess: () => void;
  showPostProcess: boolean;
  setShowPostProcess: (v: boolean) => void;
}

export default function PostProcessControls({
  ppGrow,
  setPpGrow,
  ppShrink,
  setPpShrink,
  ppFeather,
  setPpFeather,
  ppFillHoles,
  setPpFillHoles,
  isLoading,
  handlePostprocess,
  showPostProcess,
  setShowPostProcess,
}: PostProcessControlsProps) {
  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => setShowPostProcess(!showPostProcess)}
        className="w-full py-1.5 px-3 rounded border border-[var(--panel-border)] text-[var(--text-muted)] font-label-md text-label-md uppercase hover:text-[var(--text-primary)] transition-colors"
      >
        {showPostProcess ? "Hide" : "Show"} Post-Process
      </button>

      {showPostProcess && (
        <div className="flex flex-col gap-2 p-2 rounded bg-[var(--surface-1)]">
          <LabeledSlider
            label="Grow"
            value={ppGrow}
            min={0}
            max={20}
            step={1}
            onChange={setPpGrow}
            ariaLabel="Grow mask by pixels"
            title="Grow mask by pixels"
            unit="px"
          />
          <LabeledSlider
            label="Shrink"
            value={ppShrink}
            min={0}
            max={20}
            step={1}
            onChange={setPpShrink}
            ariaLabel="Shrink mask by pixels"
            title="Shrink mask by pixels"
            unit="px"
          />
          <LabeledSlider
            label="Feather"
            value={ppFeather}
            min={0}
            max={20}
            step={1}
            onChange={setPpFeather}
            ariaLabel="Feather mask edge by pixels"
            title="Feather mask edge by pixels"
            unit="px"
          />
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={ppFillHoles}
              onChange={(e) => setPpFillHoles(e.target.checked)}
              className="w-3 h-3 accent-[var(--accent)]"
            />
            <span className="font-label-sm text-label-sm uppercase text-[var(--text-muted)]">Fill Holes</span>
          </label>
          <button
            onClick={handlePostprocess}
            disabled={isLoading || (ppGrow === 0 && ppShrink === 0 && ppFeather === 0 && !ppFillHoles)}
            className="w-full py-1.5 px-3 rounded bg-[var(--accent)] text-black font-label-md text-label-md font-semibold uppercase hover:brightness-110 transition-all disabled:opacity-50"
          >
            {isLoading ? "Processing..." : "Apply"}
          </button>
        </div>
      )}
    </div>
  );
}
