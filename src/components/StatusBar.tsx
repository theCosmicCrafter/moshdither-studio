import { useAppStore } from "../store";

export default function StatusBar() {
  const statusMessage = useAppStore((s) => s.statusMessage);
  const isProcessing = useAppStore((s) => s.isProcessing);
  const allEffects = useAppStore((s) => s.allEffects);
  const effectStack = useAppStore((s) => s.effectStack);
  const mediaLoaded = useAppStore((s) => s.mediaLoaded);
  const dockedPanels = useAppStore((s) => s.dockedPanels);
  const triggerExport = useAppStore((s) => s.triggerExport);
  const triggerLayoutAction = useAppStore((s) => s.triggerLayoutAction);
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);

  // Same open-or-trigger flow as Toolbar's export: the panel must be mounted
  // to receive the trigger, so a hidden Export panel opens instead of firing.
  const handleExportClick = () => {
    if (!mediaLoaded) {
      setStatusMessage("Load media first — nothing to export yet");
      return;
    }
    if (!dockedPanels.includes("export")) {
      triggerLayoutAction("add", "export");
      setStatusMessage("Export panel opened");
      return;
    }
    triggerExport();
    setStatusMessage("Export started from Export panel...");
  };
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
      className="flex items-center justify-between px-3 h-7 flex-shrink-0 font-body-sm text-body-sm neo-flat rounded-lg mx-1 mb-1 bg-surface/80 backdrop-blur-xl text-on-surface-variant"
    >
      <div className="flex items-center gap-2">
        {isProcessing ? (
          <span className="material-symbols-outlined animate-pulse text-accent-pink" style={{ fontSize: 14 }}>
            cloud_sync
          </span>
        ) : (
          <div className="w-1.5 h-1.5 rounded-full bg-accent-teal" />
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
          {effectStack.filter((e) => e.enabled).length} active{" "}
          {effectStack.filter((e) => e.enabled).length === 1 ? "layer" : "layers"}
        </span>
        <span className="text-outline-variant">|</span>
        <button
          onClick={handleExportClick}
          disabled={!mediaLoaded || isProcessing}
          title="Export — opens the Export panel if it isn't docked"
          className="flex items-center gap-1 font-label-sm text-label-sm font-semibold tracking-wider text-on-primary bg-accent-pink rounded px-2 py-0.5 disabled:opacity-40 disabled:cursor-not-allowed hover:enabled:brightness-110 transition-colors"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 12 }}>file_download</span>
          Export
        </button>
      </div>
    </div>
  );
}
