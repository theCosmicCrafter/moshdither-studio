import React from "react";
import { useGPUInfo } from "../../hooks/useGPUInfo";
import { Gpu } from "lucide-react";

export const GPUInfoPanel: React.FC = () => {
  const { gpuInfo, support, loading } = useGPUInfo();

  if (loading) {
    return (
      <div className="gpu-panel">
        <div className="gpu-panel__header">
          <Gpu size={16} />
          <span>GPU</span>
        </div>
        <div className="gpu-panel__body">Detecting...</div>
      </div>
    );
  }

  if (!gpuInfo) {
    return (
      <div className="gpu-panel gpu-panel--error">
        <div className="gpu-panel__header">
          <Gpu size={16} />
          <span>GPU</span>
        </div>
        <div className="gpu-panel__body">WebGL not available</div>
      </div>
    );
  }

  return (
    <div className="gpu-panel">
      <div className="gpu-panel__header">
        <Gpu size={16} />
        <span>GPU</span>
      </div>
      <div className="gpu-panel__body">
        <div className="gpu-panel__row">
          <span className="gpu-panel__label">Renderer</span>
          <span className="gpu-panel__value" title={gpuInfo.unmaskedRenderer}>
            {gpuInfo.unmaskedRenderer}
          </span>
        </div>
        <div className="gpu-panel__row">
          <span className="gpu-panel__label">Vendor</span>
          <span className="gpu-panel__value">{gpuInfo.unmaskedVendor}</span>
        </div>
        <div className="gpu-panel__row">
          <span className="gpu-panel__label">Max Texture</span>
          <span className="gpu-panel__value">{gpuInfo.maxTextureSize}px</span>
        </div>
        <div className="gpu-panel__row">
          <span className="gpu-panel__label">WebGL2</span>
          <span className={`gpu-panel__value ${gpuInfo.supportsWebGL2 ? "ok" : "warn"}`}>
            {gpuInfo.supportsWebGL2 ? "Yes" : "No"}
          </span>
        </div>
        {support && support.warnings.length > 0 && (
          <div className="gpu-panel__warnings">
            {support.warnings.map((w, i) => (
              <div key={i} className="gpu-panel__warning">
                {w}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
