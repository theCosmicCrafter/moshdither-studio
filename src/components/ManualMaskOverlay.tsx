import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "../store";

export default function ManualMaskOverlay() {
  const mediaInfo = useAppStore((s) => s.mediaInfo);
  const activeMask = useAppStore((s) => s.activeMask);
  const maskTool = useAppStore((s) => s.maskTool);
  const brushSize = useAppStore((s) => s.brushSize);
  const setActiveMask = useAppStore((s) => s.setActiveMask);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskLoadedRef = useRef<string | null>("__uninitialized__");
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [snapshot, setSnapshot] = useState<ImageData | null>(null);
  const [polygonPoints, setPolygonPoints] = useState<{ x: number; y: number }[]>([]);
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number } | null>(null);

  const width = mediaInfo?.width ?? 0;
  const height = mediaInfo?.height ?? 0;

  const commitMask = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL("image/png");
    maskLoadedRef.current = dataUrl;
    setActiveMask(dataUrl);
  }, [setActiveMask]);

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

  // Initialize canvas from activeMask or blank white.
  // Skip reload when the activeMask change came from this overlay's own commit.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0 || height === 0) return;
    if (activeMask === maskLoadedRef.current) return;

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    setPolygonPoints([]);
    setHoverPoint(null);

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
    maskLoadedRef.current = activeMask;
  }, [width, height, activeMask]);

  // Polygon preview overlay
  useEffect(() => {
    if (maskTool !== "polygon" || polygonPoints.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const baseImage = ctx.getImageData(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "rgba(108, 204, 255, 0.8)";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(polygonPoints[0].x, polygonPoints[0].y);
    for (let i = 1; i < polygonPoints.length; i++) {
      ctx.lineTo(polygonPoints[i].x, polygonPoints[i].y);
    }
    if (hoverPoint) {
      ctx.lineTo(hoverPoint.x, hoverPoint.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    for (const pt of polygonPoints) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = "#6cf";
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    const timer = setTimeout(() => {
      ctx.putImageData(baseImage, 0, 0);
    }, 0);

    return () => clearTimeout(timer);
  }, [maskTool, polygonPoints, hoverPoint]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current) return;
      const ctx = canvasRef.current.getContext("2d");
      if (!ctx) return;
      const { x, y } = getCoords(e);
      setIsDrawing(true);

      if (maskTool === "brush" || maskTool === "eraser") {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.lineWidth = brushSize;
        ctx.strokeStyle = maskTool === "brush" ? "#000000" : "#ffffff";
      } else if (maskTool === "polygon") {
        setPolygonPoints((prev) => [...prev, { x, y }]);
      } else {
        setStartPoint({ x, y });
        setSnapshot(ctx.getImageData(0, 0, width, height));
      }
    },
    [maskTool, brushSize, getCoords, width, height]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDrawing || !canvasRef.current) return;
      const ctx = canvasRef.current.getContext("2d");
      if (!ctx) return;
      const { x, y } = getCoords(e);

      if (maskTool === "brush" || maskTool === "eraser") {
        ctx.lineTo(x, y);
        ctx.stroke();
      } else if (maskTool === "polygon" && polygonPoints.length > 0) {
        setHoverPoint({ x, y });
      } else if (startPoint && snapshot) {
        ctx.putImageData(snapshot, 0, 0);
        ctx.beginPath();
        if (maskTool === "rect") {
          ctx.rect(startPoint.x, startPoint.y, x - startPoint.x, y - startPoint.y);
        } else if (maskTool === "ellipse") {
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
    [isDrawing, maskTool, startPoint, snapshot, getCoords, polygonPoints]
  );

  const handleMouseUp = useCallback(() => {
    if (isDrawing) {
      setIsDrawing(false);
      setStartPoint(null);
      setSnapshot(null);
      if (maskTool !== "polygon") {
        commitMask();
      }
    }
  }, [isDrawing, commitMask, maskTool]);

  const handleMouseLeave = useCallback(() => {
    setHoverPoint(null);
    handleMouseUp();
  }, [handleMouseUp]);

  const closePolygon = useCallback(() => {
    if (polygonPoints.length < 3) {
      setPolygonPoints([]);
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.beginPath();
    ctx.moveTo(polygonPoints[0].x, polygonPoints[0].y);
    for (let i = 1; i < polygonPoints.length; i++) {
      ctx.lineTo(polygonPoints[i].x, polygonPoints[i].y);
    }
    ctx.closePath();
    ctx.fillStyle = "#000000";
    ctx.fill();

    setPolygonPoints([]);
    setHoverPoint(null);
    commitMask();
  }, [polygonPoints, commitMask]);

  if (width === 0 || height === 0) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0"
      style={{
        width: "100%",
        height: "100%",
        pointerEvents: "auto",
        zIndex: 10,
        cursor:
          maskTool === "brush" || maskTool === "eraser"
            ? "crosshair"
            : maskTool === "polygon"
            ? "pointer"
            : "default",
        opacity: 0.5,
        mixBlendMode: "multiply",
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onDoubleClick={closePolygon}
    />
  );
}
