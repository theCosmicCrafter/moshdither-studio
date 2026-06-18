import { useAppStore } from "../store";
import { Activity } from "lucide-react";

export default function StatusBar() {
  const statusMessage = useAppStore((s) => s.statusMessage);
  const isProcessing = useAppStore((s) => s.isProcessing);
  const allEffects = useAppStore((s) => s.allEffects);
  const effectStack = useAppStore((s) => s.effectStack);

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
        <span>{allEffects.length} effects available</span>
        <span style={{ color: "var(--text-dim)" }}>|</span>
        <span>
          {effectStack.filter((e) => e.enabled).length} active in stack
        </span>
      </div>
    </div>
  );
}
