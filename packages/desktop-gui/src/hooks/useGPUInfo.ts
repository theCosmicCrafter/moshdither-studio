import { useState } from "react";
import { detectGPU, checkGPUSupport } from "../utils/webgl/gpuDetector";

export function useGPUInfo() {
  const [gpuInfo] = useState(() => detectGPU());
  const [support] = useState(() => checkGPUSupport());

  return { gpuInfo, support, loading: false };
}
