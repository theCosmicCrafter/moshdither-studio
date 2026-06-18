/**
 * SAM3 Interactive Mask Editor
 *
 * Canvas-based component for click-to-segment with SAM3.
 * Supports:
 *   - Point prompts (green = positive, red = negative)
 *   - Box prompts (drag to draw)
 *   - Hover preview (debounced single-point)
 *   - Mask overlay with adjustable opacity
 *   - Clearing points / resetting
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSAM3 } from "../../hooks/useSAM3";
import type { SAM3Mask, SAM3Status } from "../../hooks/useSAM3";

export interface SAM3EditorProps {
  imagePath: string;
  onMaskChange?: (mask: SAM3Mask | null) => void;
  initialMask?: SAM3Mask | null;
  samStatus?: SAM3Status;
}

type PromptMode = "point-positive" | "point-negative" | "box";
type EditorPoint = { x: number; y: number; label: 1 | 0 };

function dataUrlToImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

export const SAM3Editor: React.FC<SAM3EditorProps> = ({
  imagePath,
  onMaskChange,
  initialMask,
  samStatus: propSamStatus,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const uiCanvasRef = useRef<HTMLCanvasElement>(null);

  const [mode, setMode] = useState<PromptMode>("point-positive");
  const [points, setPoints] = useState<EditorPoint[]>([]);
  const [committedMask, setCommittedMask] = useState<SAM3Mask | null>(initialMask ?? null);
  const [hoverMask, setHoverMask] = useState<SAM3Mask | null>(null);
  const [overlayOpacity, setOverlayOpacity] = useState(0.4);
  const [overlayColor, setOverlayColor] = useState("#00ffff");
  const [showOverlay, setShowOverlay] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null);
  const [imgDims, setImgDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [imgOffset, setImgOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const isReady = propSamStatus === 'ready';

  const {
    status: samStatus,
    hoverPreview,
    cancelHover,
    predictBatch,
    predictBox,
  } = useSAM3();

  // Load source image and size canvases to match container, draw image centered
  useEffect(() => {
    let cancelled = false;

    async function load() {
      const img = await dataUrlToImage(imagePath);
      if (cancelled) return;

      const container = containerRef.current;
      if (!container) return;

      // Canvas internal resolution matches image native size exactly
      setImgDims({ w: img.width, h: img.height });
      setImgOffset({ x: 0, y: 0 });

      const canvases = [canvasRef.current, maskCanvasRef.current, uiCanvasRef.current];
      for (const c of canvases) {
        if (!c) continue;
        c.width = img.width;
        c.height = img.height;
      }

      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, img.width, img.height);
        ctx.drawImage(img, 0, 0);
      }
    }

    load().catch((e) => console.error("[SAM3Editor] image load failed:", e));
    return () => {
      cancelled = true;
    };
  }, [imagePath]);

  // Draw mask overlay whenever committedMask, hoverMask, or settings change
  useEffect(() => {
    const c = maskCanvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, c.width, c.height);
    if (!showOverlay) return;

    const maskToDraw = hoverMask || committedMask;
    if (!maskToDraw || !maskToDraw.dataUrl) return;

    const img = new Image();
    img.onload = () => {
      ctx.save();
      ctx.globalAlpha = overlayOpacity;
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(img, imgOffset.x, imgOffset.y, imgDims.w, imgDims.h);

      // Tint with overlay color using multiply-like effect
      ctx.globalCompositeOperation = "source-in";
      ctx.fillStyle = overlayColor;
      ctx.fillRect(imgOffset.x, imgOffset.y, imgDims.w, imgDims.h);
      ctx.restore();
    };
    img.src = maskToDraw.dataUrl;
  }, [committedMask, hoverMask, showOverlay, overlayOpacity, overlayColor, imgDims, imgOffset]);

  // Draw UI layer (points, drag box)
  useEffect(() => {
    const c = uiCanvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, c.width, c.height);

    // Draw points (relative to img area)
    for (const p of points) {
      const px = imgOffset.x + p.x * imgDims.w;
      const py = imgOffset.y + p.y * imgDims.h;
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fillStyle = p.label === 1 ? "#22c55e" : "#ef4444";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#fff";
      ctx.stroke();
    }

    // Draw drag box
    if (isDragging && dragStart && dragCurrent) {
      const x1 = imgOffset.x + Math.min(dragStart.x, dragCurrent.x) * imgDims.w;
      const y1 = imgOffset.y + Math.min(dragStart.y, dragCurrent.y) * imgDims.h;
      const x2 = imgOffset.x + Math.max(dragStart.x, dragCurrent.x) * imgDims.w;
      const y2 = imgOffset.y + Math.max(dragStart.y, dragCurrent.y) * imgDims.h;

      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(245, 158, 11, 0.15)";
      ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
    }
  }, [points, isDragging, dragStart, dragCurrent, imgDims, imgOffset]);

  const getNormCoords = useCallback(
    (clientX: number, clientY: number) => {
      const c = canvasRef.current;
      if (!c) return { x: 0, y: 0 };
      const rect = c.getBoundingClientRect();
      const x = (clientX - rect.left) / rect.width;
      const y = (clientY - rect.top) / rect.height;
      return {
        x: Math.max(0, Math.min(1, x)),
        y: Math.max(0, Math.min(1, y)),
      };
    },
    [],
  );

  const handleMouseMove = useCallback(
    async (e: React.MouseEvent<HTMLCanvasElement>) => {
      const { x, y } = getNormCoords(e.clientX, e.clientY);

      if (isDragging && dragStart) {
        setDragCurrent({ x, y });
        return;
      }

      if (mode.startsWith("point")) {
        // Debounced hover preview
        if (samStatus === "segmenting" || samStatus === "hovering") return;
        const mask = await hoverPreview(imagePath, { x, y }, 120);
        if (mask) setHoverMask(mask);
      }
    },
    [mode, isDragging, dragStart, imagePath, hoverPreview, samStatus, getNormCoords],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (e.button === 2) return; // ignore right-click down
      if (mode === "box") {
        const { x, y } = getNormCoords(e.clientX, e.clientY);
        setIsDragging(true);
        setDragStart({ x, y });
        setDragCurrent({ x, y });
      }
    },
    [mode, getNormCoords],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const { x, y } = getNormCoords(e.clientX, e.clientY);
      // Remove nearest point within 20px radius
      const c = uiCanvasRef.current;
      if (!c) return;
      const radiusNorm = 20 / c.width;
      let nearestIdx = -1;
      let nearestDist = Infinity;
      points.forEach((p, idx) => {
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < nearestDist && d < radiusNorm * 2) {
          nearestDist = d;
          nearestIdx = idx;
        }
      });
      if (nearestIdx >= 0) {
        const newPoints = points.filter((_, i) => i !== nearestIdx);
        setPoints(newPoints);
        // Re-run segmentation with remaining points
        const pos = newPoints.filter((p) => p.label === 1).map((p) => ({ x: p.x, y: p.y }));
        const neg = newPoints.filter((p) => p.label === 0).map((p) => ({ x: p.x, y: p.y }));
        predictBatch(imagePath, pos, neg).then((mask) => {
          if (mask) {
            setCommittedMask(mask);
            onMaskChange?.(mask);
          } else {
            setCommittedMask(null);
            onMaskChange?.(null);
          }
        });
      }
    },
    [points, imagePath, predictBatch, onMaskChange, getNormCoords],
  );

  const handleMouseUp = useCallback(
    async (e: React.MouseEvent<HTMLCanvasElement>) => {
      // Shift+click toggles point mode
      if (e.shiftKey && mode.startsWith("point")) {
        setMode(mode === "point-positive" ? "point-negative" : "point-positive");
      }

      if (mode === "box" && isDragging && dragStart) {
        setIsDragging(false);
        const { x, y } = getNormCoords(e.clientX, e.clientY);
        const x1 = Math.min(dragStart.x, x);
        const y1 = Math.min(dragStart.y, y);
        const x2 = Math.max(dragStart.x, x);
        const y2 = Math.max(dragStart.y, y);
        setDragStart(null);
        setDragCurrent(null);

        if (x2 - x1 < 0.01 || y2 - y1 < 0.01) return; // too small

        const mask = await predictBox(imagePath, { x1, y1, x2, y2 });
        if (mask) {
          setCommittedMask(mask);
          onMaskChange?.(mask);
        }
        return;
      }

      if (mode.startsWith("point")) {
        const { x, y } = getNormCoords(e.clientX, e.clientY);
        const label = mode === "point-positive" ? (1 as const) : (0 as const);
        const newPoints = [...points, { x, y, label }];
        setPoints(newPoints);

        // Run batch segmentation with all points
        const pos = newPoints.filter((p) => p.label === 1).map((p) => ({ x: p.x, y: p.y }));
        const neg = newPoints.filter((p) => p.label === 0).map((p) => ({ x: p.x, y: p.y }));
        const mask = await predictBatch(imagePath, pos, neg);
        if (mask) {
          setCommittedMask(mask);
          onMaskChange?.(mask);
        }
      }
    },
    [mode, isDragging, dragStart, imagePath, points, predictBox, predictBatch, onMaskChange, getNormCoords],
  );

  const handleMouseLeave = useCallback(() => {
    setIsDragging(false);
    setDragStart(null);
    setDragCurrent(null);
    cancelHover();
    setHoverMask(null);
  }, [cancelHover]);

  const handleClearPoints = useCallback(() => {
    setPoints([]);
    setCommittedMask(null);
    setHoverMask(null);
    onMaskChange?.(null);
  }, [onMaskChange]);

  const isBusy = samStatus === "segmenting" || samStatus === "hovering" || samStatus === "loading";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px", width: "100%" }}>
      {/* Toolbar */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <button
          onClick={() => setMode("point-positive")}
          style={{
            padding: "6px 12px",
            borderRadius: "4px",
            border: "1px solid var(--border-color)",
            background: mode === "point-positive" ? "#22c55e" : "#1c1c1e",
            color: "#fff",
            cursor: "pointer",
            fontSize: "12px",
          }}
          title="Click to add positive points (include)"
        >
          + Point
        </button>
        <button
          onClick={() => setMode("point-negative")}
          style={{
            padding: "6px 12px",
            borderRadius: "4px",
            border: "1px solid var(--border-color)",
            background: mode === "point-negative" ? "#ef4444" : "#1c1c1e",
            color: "#fff",
            cursor: "pointer",
            fontSize: "12px",
          }}
          title="Click to add negative points (exclude)"
        >
          - Point
        </button>
        <button
          onClick={() => setMode("box")}
          style={{
            padding: "6px 12px",
            borderRadius: "4px",
            border: "1px solid var(--border-color)",
            background: mode === "box" ? "#f59e0b" : "#1c1c1e",
            color: "#fff",
            cursor: "pointer",
            fontSize: "12px",
          }}
          title="Drag to draw a box prompt"
        >
          Box
        </button>
        <button
          onClick={handleClearPoints}
          style={{
            padding: "6px 12px",
            borderRadius: "4px",
            border: "1px solid var(--border-color)",
            background: "#1c1c1e",
            color: "#fff",
            cursor: "pointer",
            fontSize: "12px",
          }}
        >
          Clear
        </button>

        {isBusy && (
          <span style={{ fontSize: "12px", color: "var(--text-secondary)", marginLeft: "auto" }}>
            {samStatus === "loading" ? "Loading model..." : "Segmenting..."}
          </span>
        )}
      </div>

      {/* Overlay controls */}
      <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--text-secondary)" }}>
          <input
            type="checkbox"
            checked={showOverlay}
            onChange={(e) => setShowOverlay(e.target.checked)}
          />
          Show Mask
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--text-secondary)" }}>
          Opacity
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={overlayOpacity}
            onChange={(e) => setOverlayOpacity(parseFloat(e.target.value))}
            style={{ width: "80px" }}
          />
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--text-secondary)" }}>
          Color
          <input
            type="color"
            value={overlayColor}
            onChange={(e) => setOverlayColor(e.target.value)}
            style={{ width: "32px", height: "20px", padding: 0, border: "none" }}
          />
        </label>
      </div>

      {/* Canvas Stack */}
      <div
        ref={containerRef}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: "100%",
          background: "#000",
          borderRadius: "4px",
          overflow: "auto",
          cursor: mode === "box" ? "crosshair" : "pointer",
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ display: "block", width: "100%", height: "auto" }}
        />
        <canvas
          ref={maskCanvasRef}
          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none" }}
        />
        <canvas
          ref={uiCanvasRef}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onContextMenu={handleContextMenu}
          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: isReady ? 'auto' : 'none' }}
        />
        {!isReady && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.6)',
            color: 'var(--text-secondary)',
            fontSize: '13px',
            zIndex: 5,
            borderRadius: '4px',
          }}>
            Load SAM 3 Model to start segmenting
          </div>
        )}
      </div>

      {/* Point legend */}
      {points.length > 0 && (
        <div style={{ display: "flex", gap: "12px", fontSize: "12px", color: "var(--text-secondary)" }}>
          <span>{points.filter((p) => p.label === 1).length} positive</span>
          <span>{points.filter((p) => p.label === 0).length} negative</span>
        </div>
      )}
    </div>
  );
};
