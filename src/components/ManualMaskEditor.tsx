import { useCallback } from "react";
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

    const img = new Image();
    img.onload = () => {
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
      <div style={{ padding: 12, color: "#888", fontSize: 11, textAlign: "center" }}>
        Load media to use manual mask drawing
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 8 }}>
      {/* Toolbar */}
      <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
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
        <div style={{ width: 1, background: "#444", margin: "0 4px" }} />
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
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, color: "#888", minWidth: 50 }}>Size: {brushSize}px</span>
          <input
            aria-label="Brush size"
            type="range"
            min={2}
            max={200}
            value={brushSize}
            onChange={(e) => setBrushSize(parseInt(e.target.value))}
            style={{ flex: 1 }}
          />
        </div>
      )}

      {/* Polygon hint */}
      {maskTool === "polygon" && (
        <div style={{ fontSize: 10, color: "#888", padding: "0 4px" }}>
          Click on the preview to add points. Double-click to close.
        </div>
      )}

      {/* Thumbnail preview of the current mask */}
      {activeMask && (
        <div
          style={{
            border: "1px solid #444",
            borderRadius: 4,
            overflow: "hidden",
            maxHeight: 160,
            background: "#111",
          }}
        >
          <img
            src={activeMask}
            alt="Mask preview"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              display: "block",
              filter: "invert(1)",
            }}
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
      style={{
        display: "flex",
        alignItems: "center",
        gap: 3,
        padding: "4px 8px",
        fontSize: 10,
        borderRadius: 3,
        border: "none",
        background: active ? "rgba(74, 144, 217, 0.25)" : "#2a2a2a",
        color: active ? "#6cf" : "#aaa",
        cursor: "pointer",
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{icon}</span>
      {label}
    </button>
  );
}
