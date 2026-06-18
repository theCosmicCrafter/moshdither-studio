import { useAppStore } from "../store";
import { Activity, BarChart3, Waves, Palette } from "lucide-react";

export default function StatusBar() {
  const statusMessage = useAppStore((s) => s.statusMessage);
  const isProcessing = useAppStore((s) => s.isProcessing);
  const allEffects = useAppStore((s) => s.allEffects);
  const effectStack = useAppStore((s) => s.effectStack);
  const scopeMode = useAppStore((s) => s.scopeMode);
  const scopesVisible = useAppStore((s) => s.scopesVisible);
  const setScopeMode = useAppStore((s) => s.setScopeMode);
  const setScopesVisible = useAppStore((s) => s.setScopesVisible);

  const scopeButton = (mode: typeof scopeMode, icon: React.ReactNode, label: string) => (
    <button
      title={label}
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
      className="flex items-center gap-1"
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        color: scopesVisible && scopeMode === mode ? "var(--accent)" : "var(--text-dim)",
        opacity: scopesVisible && scopeMode === mode ? 1 : 0.6,
      }}
    >
      {icon}
    </button>
  );

  return (
    <div
      className="flex items-center justify-between px-3 h-6 flex-shrink-0 text-[11px]"
      style={{
        borderTop: "1px solid var(--border-primary)",
        background: "var(--bg-secondary)",
        color: "var(--text-muted)",
        fontFamily: "var(--font-mono)",
      }}
    >
      <div className="flex items-center gap-2">
        {isProcessing ? (
          <Activity size={11} className="animate-pulse" style={{ color: "var(--accent)" }} />
        ) : (
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: "var(--success)" }}
          />
        )}
        <span>{statusMessage}</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          {scopeButton("histogram", <BarChart3 size={11} />, "Histogram")}
          {scopeButton("waveform", <Waves size={11} />, "Waveform")}
          {scopeButton("rgb_parade", <Palette size={11} />, "RGB Parade")}
        </div>
        <span style={{ color: "var(--text-dim)" }}>|</span>
        <span>{allEffects.length} effects available</span>
        <span style={{ color: "var(--text-dim)" }}>|</span>
        <span>
          {effectStack.filter((e) => e.enabled).length} active in stack
        </span>
      </div>
    </div>
  );
}
