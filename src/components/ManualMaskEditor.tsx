import { useCallback, useEffect, useRef } from "react";
import { useAppStore } from "../store";

export default function ManualMaskEditor() {
  const mediaInfo = useAppStore((s) => s.mediaInfo);
  const activeMask = useAppStore((s) => s.activeMask);
  const maskTool = useAppStore((s) => s.maskTool);
  const brushSize = useAppStore((s) => s.brushSize);
  const setMaskTool = useAppStore((s) => s.setMaskTool);
  const setBrushSize = useAppStore((s) => s.setBrushSize);
  const setActiveMask = useAppStore((s) => s.setActiveMask);
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);

  const width = mediaInfo?.width ?? 0;
  const height = mediaInfo?.height ?? 0;

  const invertGenerationRef = useRef(0);
  const invertImageRef = useRef<HTMLImageElement | null>(null);
  const activeMaskRef = useRef(activeMask);
  activeMaskRef.current = activeMask;
  const dimensionsRef = useRef({ width, height });
  dimensionsRef.current = { width, height };

  useEffect(() => {
    return () => {
      invertGenerationRef.current += 1;
      if (invertImageRef.current) invertImageRef.current.onload = null;
    };
  }, []);

  const createBlankMask = useCallback(() => {
    if (width === 0 || height === 0) return null;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    return canvas.toDataURL("image/png");
  }, [width, height]);

  const clearMask = useCallback(() => {
    const blank = createBlankMask();
    if (blank) {
      setActiveMask(blank);
      setStatusMessage("Mask cleared");
    } else {
      setActiveMask(null);
      setStatusMessage("Mask cleared");
    }
  }, [createBlankMask, setActiveMask, setStatusMessage]);

  const invertMask = useCallback(() => {
    if (width === 0 || height === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const source = activeMask || createBlankMask();
    if (!source) return;

    const generation = ++invertGenerationRef.current;
    if (invertImageRef.current) invertImageRef.current.onload = null;
    const img = new Image();
    invertImageRef.current = img;
    img.onload = () => {
      if (
        generation !== invertGenerationRef.current ||
        activeMaskRef.current !== activeMask ||
        dimensionsRef.current.width !== width ||
        dimensionsRef.current.height !== height
      ) {
        return;
      }
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 255 - data[i];
        data[i + 1] = 255 - data[i + 1];
        data[i + 2] = 255 - data[i + 2];
      }
      ctx.putImageData(imageData, 0, 0);
      setActiveMask(canvas.toDataURL("image/png"));
      setStatusMessage("Mask inverted");
    };
    img.src = source;
  }, [activeMask, createBlankMask, setActiveMask, setStatusMessage, width, height]);

  if (width === 0 || height === 0) {
    return (
      <div className="p-3 text-on-surface-variant text-[11px] text-center">
        Load media to use manual mask drawing
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-2">
      {/* Toolbar */}
      <div className="flex gap-0.5 flex-wrap">
        <ToolButton
          icon="edit"
          label="Brush"
          active={maskTool === "brush"}
          onClick={() => setMaskTool("brush")}
        />
        <ToolButton
          icon="ink_eraser"
          label="Eraser"
          active={maskTool === "eraser"}
          onClick={() => setMaskTool("eraser")}
        />
        <ToolButton
          icon="crop_square"
          label="Rect"
          active={maskTool === "rect"}
          onClick={() => setMaskTool("rect")}
        />
        <ToolButton
          icon="circle"
          label="Ellipse"
          active={maskTool === "ellipse"}
          onClick={() => setMaskTool("ellipse")}
        />
        <ToolButton
          icon="hexagon"
          label="Polygon"
          active={maskTool === "polygon"}
          onClick={() => setMaskTool("polygon")}
        />
        <div className="w-px bg-outline-variant mx-1" />
        <ToolButton
          icon="flip"
          label="Invert"
          active={false}
          onClick={invertMask}
        />
        <ToolButton
          icon="delete"
          label="Clear"
          active={false}
          onClick={clearMask}
        />
      </div>

      {/* Brush size */}
      {(maskTool === "brush" || maskTool === "eraser") && (
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-on-surface-variant min-w-[50px]">Size: {brushSize}px</span>
          <input
            aria-label="Brush size"
            type="range"
            min={2}
            max={200}
            value={brushSize}
            onChange={(e) => setBrushSize(parseInt(e.target.value))}
            className="flex-1"
          />
        </div>
      )}

      {/* Polygon hint */}
      {maskTool === "polygon" && (
        <div className="text-[10px] text-on-surface-variant px-1">
          Click on the preview to add points. Double-click to close.
        </div>
      )}

      {/* Thumbnail preview of the current mask */}
      {activeMask && (
        <div className="border border-outline-variant rounded overflow-hidden max-h-40 bg-surface-main">
          <img
            src={activeMask}
            alt="Mask preview"
            className="w-full h-full object-contain block"
            style={{ filter: "invert(1)" }}
          />
        </div>
      )}
    </div>
  );
}

function ToolButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`flex items-center gap-[3px] px-2 py-1 text-[10px] rounded-sm border-none cursor-pointer ${
        active
          ? "bg-accent-teal/25 text-accent-teal"
          : "bg-surface-container-high text-on-surface-variant hover:text-on-surface"
      }`}
    >
      <span className="material-symbols-outlined text-[14px]">{icon}</span>
      {label}
    </button>
  );
}
