import { useEffect, useState } from "react";
import { detectGPU, checkGPUSupport, type GPUInfo } from "../utils/webgl/gpuDetector";

export function useGPUInfo() {
  const [gpuInfo, setGpuInfo] = useState<GPUInfo | null>(null);
  const [support, setSupport] = useState<{
    supported: boolean;
    warnings: string[];
    recommendedQuality: "full" | "reduced" | "software";
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const info = detectGPU();
    setGpuInfo(info);
    setSupport(checkGPUSupport());
    setLoading(false);
  }, []);

  return { gpuInfo, support, loading };
}
