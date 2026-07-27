import { useAppStore } from "../store";

export default function StatusBar() {
  const statusMessage = useAppStore((s) => s.statusMessage);
  const isProcessing = useAppStore((s) => s.isProcessing);
  const allEffects = useAppStore((s) => s.allEffects);
  const effectStack = useAppStore((s) => s.effectStack);
  const scopeMode = useAppStore((s) => s.scopeMode);
  const scopesVisible = useAppStore((s) => s.scopesVisible);
  const setScopeMode = useAppStore((s) => s.setScopeMode);
  const setScopesVisible = useAppStore((s) => s.setScopesVisible);

  const scopeButton = (mode: typeof scopeMode, icon: string, label: string) => (
    <button
      title={label}
      aria-label={label}
      aria-pressed={scopesVisible && scopeMode === mode}
      onClick={() => {
        if (!scopesVisible) {
          setScopesVisible(true);
          setScopeMode(mode);
        } else if (scopeMode === mode) {
          setScopesVisible(false);
        } else {
          setScopeMode(mode);
        }
      }}
      className={`material-symbols-outlined neo-btn p-1 rounded-full transition-colors ${scopesVisible && scopeMode === mode ? "text-accent-pink neo-pressed" : "text-on-surface-variant hover:text-accent-teal"}`}
      style={{ fontSize: 14 }}
    >
      {icon}
    </button>
  );

  return (
    <div
      className="flex items-center justify-between px-3 h-7 flex-shrink-0 text-code-sm font-code-sm neo-flat rounded-lg mx-1 mb-1 bg-surface/80 backdrop-blur-xl text-on-surface-variant"
    >
      <div className="flex items-center gap-2">
        {isProcessing ? (
          <span className="material-symbols-outlined animate-pulse text-accent-pink" style={{ fontSize: 14 }}>
            cloud_sync
          </span>
        ) : (
          <div className="w-1.5 h-1.5 rounded-full bg-accent-teal animate-pulse-glow" />
        )}
        <span data-testid="status-message">{statusMessage}</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          {scopeButton("histogram", "graphic_eq", "Histogram")}
          {scopeButton("waveform", "view_timeline", "Waveform")}
          {scopeButton("rgb_parade", "palette", "RGB Parade")}
        </div>
        <span className="text-outline-variant">|</span>
        <span>{allEffects.length} effects available</span>
        <span className="text-outline-variant">|</span>
        <span>
          {effectStack.filter((e) => e.enabled).length} active in stack
        </span>
      </div>
    </div>
  );
}
