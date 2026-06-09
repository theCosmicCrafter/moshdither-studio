import * as React from "react";
import { useState, useEffect, useCallback } from "react";
import { useStudio } from "../../context/StudioContext";
import { useGPUInfo } from "../../hooks/useGPUInfo";
import { useMemoryMonitor } from "../../hooks/useMemoryMonitor";
import { clearFrameCache, getCacheStats } from "../../utils/frameCache";

function formatTimecode(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const f = Math.floor((seconds % 1) * 30); // Assume 30fps for frame display
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}:${f.toString().padStart(2, "0")}`;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}:${f.toString().padStart(2, "0")}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export const StatusBar: React.FC = () => {
  const { currentTime, duration, renderProgress, isRendering, addToast } = useStudio();
  const { gpuInfo } = useGPUInfo();
  const [cacheStats, setCacheStats] = useState(() => getCacheStats());

  const refreshCacheStats = useCallback(() => setCacheStats(getCacheStats()), []);

  useEffect(() => {
    const id = setInterval(refreshCacheStats, 10000);
    return () => clearInterval(id);
  }, [refreshCacheStats]);

  const handleClearCache = useCallback(() => {
    clearFrameCache();
    refreshCacheStats();
    addToast("Frame cache cleared", "info");
  }, [refreshCacheStats, addToast]);

  const { memory, warning: memWarning, critical: memCritical } = useMemoryMonitor({
    onCritical: () => {
      clearFrameCache();
      refreshCacheStats();
      addToast("Critical memory — frame cache purged", "error");
    },
  });

  const gpuLabel = gpuInfo?.unmaskedRenderer.split(" ").slice(0, 3).join(" ") ?? null;

  return (
    <div className="status-bar">
      <div className="status-bar__left">
        <span className="status-bar__timecode">
          {formatTimecode(currentTime)}
        </span>
        <span className="status-bar__separator">/</span>
        <span>{formatTimecode(duration)}</span>
        {isRendering && (
          <span className="status-bar__rendering">
            Rendering {renderProgress.percent}%
          </span>
        )}
      </div>

      <div className="status-bar__right">
        {cacheStats.entries > 0 && (
          <button
            type="button"
            title="Clear frame cache"
            onClick={handleClearCache}
            className="status-bar__cache"
            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 'inherit', fontFamily: 'inherit' }}
          >
            Cache: {cacheStats.entries} frames ({cacheStats.sizeMB} MB)
          </button>
        )}
        {gpuLabel && (
          <span title={gpuInfo?.unmaskedRenderer} className="status-bar__gpu">
            GPU: {gpuLabel}
          </span>
        )}
        {memory && (
          <span className={`status-bar__memory ${memCritical ? "critical" : memWarning ? "warning" : ""}`}>
            Mem: {formatBytes(memory.usedJSHeapSize)} ({Math.round(memory.usagePercent * 100)}%)
          </span>
        )}
      </div>
    </div>
  );
};
