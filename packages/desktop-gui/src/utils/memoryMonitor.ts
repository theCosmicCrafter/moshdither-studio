/**
 * Memory pressure handling for MoshDither Studio.
 *
 * Monitors process.memoryUsage() via IPC from the main process.
 * Warns user when approaching limits and can trigger low-memory mode.
 */

export interface MemorySnapshot {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
  usagePercent: number;
}

const _listeners: Set<(mem: MemorySnapshot) => void> = new Set();
let _intervalId: ReturnType<typeof setInterval> | null = null;
let _warningThreshold = 0.85;
let _criticalThreshold = 0.95;

interface ChromeMemory {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
}

function getMemoryInfo(): MemorySnapshot | null {
  const perf = (performance as unknown as { memory?: ChromeMemory }).memory;
  if (!perf) return null;

  const used = perf.usedJSHeapSize;
  const total = perf.totalJSHeapSize;
  const limit = perf.jsHeapSizeLimit;

  return {
    usedJSHeapSize: used,
    totalJSHeapSize: total,
    jsHeapSizeLimit: limit,
    usagePercent: limit ? used / limit : 0,
  };
}

export function startMemoryMonitoring(options?: {
  intervalMs?: number;
  warningThreshold?: number;
  criticalThreshold?: number;
  onWarning?: (mem: MemorySnapshot) => void;
  onCritical?: (mem: MemorySnapshot) => void;
}): () => void {
  const {
    intervalMs = 5000,
    warningThreshold = 0.85,
    criticalThreshold = 0.95,
    onWarning,
    onCritical,
  } = options ?? {};

  _warningThreshold = warningThreshold;
  _criticalThreshold = criticalThreshold;

  // Stop any existing monitoring
  stopMemoryMonitoring();

  let warned = false;
  let criticaled = false;

  _intervalId = setInterval(() => {
    const mem = getMemoryInfo();
    if (!mem) return;

    for (const listener of _listeners) {
      try {
        listener(mem);
      } catch {
        // Ignore listener errors
      }
    }

    if (mem.usagePercent >= _criticalThreshold && !criticaled) {
      criticaled = true;
      onCritical?.(mem);
    } else if (mem.usagePercent >= _warningThreshold && !warned) {
      warned = true;
      onWarning?.(mem);
    }

    // Reset flags when memory drops below thresholds
    if (mem.usagePercent < _warningThreshold) {
      warned = false;
      criticaled = false;
    } else if (mem.usagePercent < _criticalThreshold) {
      criticaled = false;
    }
  }, intervalMs);

  return stopMemoryMonitoring;
}

export function stopMemoryMonitoring(): void {
  if (_intervalId) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
}

export function subscribeMemory(
  listener: (mem: MemorySnapshot) => void,
): () => void {
  _listeners.add(listener);
  return () => {
    _listeners.delete(listener);
  };
}

export function getCurrentMemory(): MemorySnapshot | null {
  return getMemoryInfo();
}
