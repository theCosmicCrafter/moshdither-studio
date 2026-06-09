import { useEffect, useState, useCallback } from "react";
import {
  startMemoryMonitoring,
  subscribeMemory,
  getCurrentMemory,
  type MemorySnapshot,
} from "../utils/memoryMonitor";

export function useMemoryMonitor(options?: {
  intervalMs?: number;
  warningThreshold?: number;
  criticalThreshold?: number;
  onWarning?: (mem: MemorySnapshot) => void;
  onCritical?: (mem: MemorySnapshot) => void;
}) {
  const [memory, setMemory] = useState<MemorySnapshot | null>(getCurrentMemory);
  const [warning, setWarning] = useState(false);
  const [critical, setCritical] = useState(false);

  const handleWarning = useCallback(
    (mem: MemorySnapshot) => {
      setWarning(true);
      options?.onWarning?.(mem);
    },
    [options],
  );

  const handleCritical = useCallback(
    (mem: MemorySnapshot) => {
      setCritical(true);
      options?.onCritical?.(mem);
    },
    [options],
  );

  useEffect(() => {
    const unsub = subscribeMemory((mem) => setMemory(mem));

    const stop = startMemoryMonitoring({
      intervalMs: options?.intervalMs,
      warningThreshold: options?.warningThreshold,
      criticalThreshold: options?.criticalThreshold,
      onWarning: handleWarning,
      onCritical: handleCritical,
    });

    return () => {
      unsub();
      stop();
    };
  }, [options, handleWarning, handleCritical]);

  return { memory, warning, critical };
}
