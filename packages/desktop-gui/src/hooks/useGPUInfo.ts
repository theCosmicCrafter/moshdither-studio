import { useMemo } from "react";
import { detectGPU, checkGPUSupport } from "../utils/webgl/gpuDetector";

export function useGPUInfo() {
  const gpuInfo = useMemo(() => detectGPU(), []);
  const support = useMemo(() => checkGPUSupport(), []);

  return { gpuInfo, support, loading: false };
}
