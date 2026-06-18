import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "../store";
import { Pencil, Eraser, Square, Circle, Trash2, FlipHorizontal } from "lucide-react";

type Tool = "brush" | "eraser" | "rect" | "ellipse";

export default function ManualMaskEditor() {
  const mediaInfo = useAppStore((s) => s.mediaInfo);
  const activeMask = useAppStore((s) => s.activeMask);
  const setActiveMask = useAppStore((s) => s.setActiveMask);
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tool, setTool] = useState<Tool>("brush");
  const [brushSize, setBrushSize] = useState(20);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [snapshot, setSnapshot] = useState<ImageData | null>(null);

  const width = mediaInfo?.width ?? 0;
  const height = mediaInfo?.height ?? 0;

  // Initialize canvas from existing mask or blank white
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0 || height === 0) return;

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (activeMask) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
      };
      img.src = activeMask;
    } else {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
    }
  }, [width, height, activeMask]);

  const getCoords = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    },
    []
  );

  const commitMask = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    setActiveMask(dataUrl);
  }, [setActiveMask]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current) return;
      const ctx = canvasRef.current.getContext("2d");
      if (!ctx) return;
      const { x, y } = getCoords(e);
      setIsDrawing(true);

      if (tool === "brush" || tool === "eraser") {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.lineWidth = brushSize;
        ctx.strokeStyle = tool === "brush" ? "#000000" : "#ffffff";
      } else {
        setStartPoint({ x, y });
        setSnapshot(ctx.getImageData(0, 0, width, height));
      }
    },
    [tool, brushSize, getCoords, width, height]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDrawing || !canvasRef.current) return;
      const ctx = canvasRef.current.getContext("2d");
      if (!ctx) return;
      const { x, y } = getCoords(e);

      if (tool === "brush" || tool === "eraser") {
        ctx.lineTo(x, y);
        ctx.stroke();
      } else if (startPoint && snapshot) {
        ctx.putImageData(snapshot, 0, 0);
        ctx.beginPath();
        if (tool === "rect") {
          ctx.rect(startPoint.x, startPoint.y, x - startPoint.x, y - startPoint.y);
        } else if (tool === "ellipse") {
          const rx = Math.abs(x - startPoint.x) / 2;
          const ry = Math.abs(y - startPoint.y) / 2;
          const cx = (startPoint.x + x) / 2;
          const cy = (startPoint.y + y) / 2;
          ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        }
        ctx.fillStyle = "#000000";
        ctx.fill();
      }
    },
    [isDrawing, tool, startPoint, snapshot, getCoords]
  );

  const handleMouseUp = useCallback(() => {
    if (isDrawing) {
      setIsDrawing(false);
      setStartPoint(null);
      setSnapshot(null);
      commitMask();
    }
  }, [isDrawing, commitMask]);

  const clearMask = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    commitMask();
    setStatusMessage("Mask cleared");
  }, [commitMask, setStatusMessage]);

  const invertMask = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255 - data[i];
      data[i + 1] = 255 - data[i + 1];
      data[i + 2] = 255 - data[i + 2];
    }
    ctx.putImageData(imageData, 0, 0);
    commitMask();
    setStatusMessage("Mask inverted");
  }, [commitMask, setStatusMessage]);

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
          icon={<Pencil size={14} />}
          label="Brush"
          active={tool === "brush"}
          onClick={() => setTool("brush")}
        />
        <ToolButton
          icon={<Eraser size={14} />}
          label="Eraser"
          active={tool === "eraser"}
          onClick={() => setTool("eraser")}
        />
        <ToolButton
          icon={<Square size={14} />}
          label="Rect"
          active={tool === "rect"}
          onClick={() => setTool("rect")}
        />
        <ToolButton
          icon={<Circle size={14} />}
          label="Ellipse"
          active={tool === "ellipse"}
          onClick={() => setTool("ellipse")}
        />
        <div style={{ width: 1, background: "#444", margin: "0 4px" }} />
        <ToolButton
          icon={<FlipHorizontal size={14} />}
          label="Invert"
          active={false}
          onClick={invertMask}
        />
        <ToolButton
          icon={<Trash2 size={14} />}
          label="Clear"
          active={false}
          onClick={clearMask}
        />
      </div>

      {/* Brush size */}
      {(tool === "brush" || tool === "eraser") && (
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

      {/* Canvas */}
      <div
        style={{
          border: "1px solid #444",
          borderRadius: 4,
          overflow: "hidden",
          cursor: tool === "brush" || tool === "eraser" ? "crosshair" : "default",
          maxHeight: 200,
        }}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{
            width: "100%",
            height: "100%",
            display: "block",
            imageRendering: "pixelated",
          }}
        />
      </div>
    </div>
  );
}

function ToolButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
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
      {icon}
      {label}
    </button>
  );
}
