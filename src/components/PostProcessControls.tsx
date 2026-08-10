// src/components/PostProcessControls.tsx
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
          <div className="flex items-center gap-2">
            <span className="font-label-sm text-label-sm uppercase text-[var(--text-muted)] w-12">Grow</span>
            <input
              type="range"
              min={0}
              max={20}
              step={1}
              value={ppGrow}
              aria-label="Grow mask by pixels"
              title="Grow mask by pixels"
              onChange={(e) => setPpGrow(parseInt(e.target.value))}
              className="flex-1 h-1 bg-[var(--surface-2)] rounded-lg appearance-none cursor-pointer"
            />
            <span className="font-code-sm text-code-sm text-[var(--text-muted)] w-6 text-right">{ppGrow}px</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-label-sm text-label-sm uppercase text-[var(--text-muted)] w-12">Shrink</span>
            <input
              type="range"
              min={0}
              max={20}
              step={1}
              value={ppShrink}
              aria-label="Shrink mask by pixels"
              title="Shrink mask by pixels"
              onChange={(e) => setPpShrink(parseInt(e.target.value))}
              className="flex-1 h-1 bg-[var(--surface-2)] rounded-lg appearance-none cursor-pointer"
            />
            <span className="font-code-sm text-code-sm text-[var(--text-muted)] w-6 text-right">{ppShrink}px</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-label-sm text-label-sm uppercase text-[var(--text-muted)] w-12">Feather</span>
            <input
              type="range"
              min={0}
              max={20}
              step={1}
              value={ppFeather}
              aria-label="Feather mask edge by pixels"
              title="Feather mask edge by pixels"
              onChange={(e) => setPpFeather(parseInt(e.target.value))}
              className="flex-1 h-1 bg-[var(--surface-2)] rounded-lg appearance-none cursor-pointer"
            />
            <span className="font-code-sm text-code-sm text-[var(--text-muted)] w-6 text-right">{ppFeather}px</span>
          </div>
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
            className="w-full py-1.5 px-3 rounded bg-[var(--accent)] text-black font-label-md text-label-md uppercase hover:brightness-110 transition-all disabled:opacity-50"
          >
            {isLoading ? "Processing..." : "Apply"}
          </button>
        </div>
      )}
    </div>
  );
}
