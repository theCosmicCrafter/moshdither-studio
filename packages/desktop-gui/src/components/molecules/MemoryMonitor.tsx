import React, { useMemo } from "react";
import { useMemoryMonitor } from "../../hooks/useMemoryMonitor";
import { Activity, AlertTriangle, AlertCircle } from "lucide-react";

export const MemoryMonitor: React.FC = () => {
  const { memory, warning, critical } = useMemoryMonitor({
    intervalMs: 5000,
    warningThreshold: 0.85,
    criticalThreshold: 0.95,
  });

  const usagePercent = useMemo(() => {
    if (!memory) return 0;
    return Math.round(memory.usagePercent * 100);
  }, [memory]);

  const usedMB = useMemo(() => {
    if (!memory) return 0;
    return Math.round(memory.usedJSHeapSize / (1024 * 1024));
  }, [memory]);

  const totalMB = useMemo(() => {
    if (!memory) return 0;
    return Math.round(memory.totalJSHeapSize / (1024 * 1024));
  }, [memory]);

  return (
    <div className={`memory-monitor ${critical ? "critical" : warning ? "warning" : ""}`}>
      <div className="memory-monitor__icon">
        {critical ? <AlertCircle size={14} /> : warning ? <AlertTriangle size={14} /> : <Activity size={14} />}
      </div>
      <div className="memory-monitor__bar">
        <div
          className="memory-monitor__fill"
          data-width={usagePercent}
        />
      </div>
      <span className="memory-monitor__text">
        {usedMB} / {totalMB} MB ({usagePercent}%)
      </span>
    </div>
  );
};
