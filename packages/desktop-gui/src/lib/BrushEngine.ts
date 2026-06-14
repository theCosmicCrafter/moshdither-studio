/**
 * BrushEngine — Mask painting brush using standard canvas line drawing.
 *
 * Replaces the broken perfect-freehand incremental approach with robust
 * beginPath/moveTo/lineTo/stroke rendering with round caps.
 */

export interface BrushPoint {
  x: number;
  y: number;
  pressure: number;
}

export interface BrushOptions {
  size: number;
  hardness: number;
  opacity: number;
}

const DEFAULT_OPTIONS: BrushOptions = {
  size: 20,
  hardness: 0.5,
  opacity: 1.0,
};

/**
 * Get the last known brush position from a PointerEvent, scaled to canvas pixels.
 */
export function getBrushPos(
  e: PointerEvent,
  canvas: HTMLCanvasElement,
): BrushPoint {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY,
    pressure: e.pressure ?? 0.5,
  };
}

/**
 * Collect all coalesced pointer positions for a single event.
 */
export function collectStrokePoints(
  e: PointerEvent,
  canvas: HTMLCanvasElement,
): BrushPoint[] {
  const toPoint = (evt: PointerEvent): BrushPoint => getBrushPos(evt, canvas);

  const points: BrushPoint[] = [];
  const coalesced = e.getCoalescedEvents?.() ?? [];
  if (coalesced.length > 0) {
    for (const evt of coalesced) {
      points.push(toPoint(evt as PointerEvent));
    }
  } else {
    points.push(toPoint(e));
  }
  return points;
}

/**
 * Draw a single round stamp (dot) at the given position.
 */
function drawStamp(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  isEraser: boolean,
): void {
  ctx.beginPath();
  ctx.arc(x, y, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = isEraser ? "rgba(0,0,0,1)" : "rgba(255,0,0,1)";
  ctx.fill();
}

/**
 * Draw a line segment between two points with a round brush.
 * Uses standard canvas stroke with round lineCap for smooth, continuous strokes.
 */
function drawSegment(
  ctx: CanvasRenderingContext2D,
  from: BrushPoint,
  to: BrushPoint,
  size: number,
  isEraser: boolean,
): void {
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = size;
  ctx.strokeStyle = isEraser ? "rgba(0,0,0,1)" : "rgba(255,0,0,1)";
  ctx.stroke();
}

/**
 * Render a single brush stroke segment onto the canvas.
 * Call this for each pointer move event with the new points.
 *
 * @param lastPos - Previous brush position (null for first dot)
 * @param points - New points from the current pointer event (coalesced)
 */
export function renderStroke(
  ctx: CanvasRenderingContext2D,
  points: BrushPoint[],
  options: Partial<BrushOptions> = {},
  isEraser = false,
  lastPos: BrushPoint | null = null,
): { lastPos: BrushPoint | null; drawn: boolean } {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (points.length === 0) return { lastPos, drawn: false };

  ctx.save();
  ctx.globalCompositeOperation = isEraser ? "destination-out" : "source-over";
  ctx.globalAlpha = opts.opacity;

  // For very soft brushes, use a slight shadow blur
  if (opts.hardness < 0.5) {
    const blur = (1 - opts.hardness) * (opts.size * 0.3);
    ctx.shadowBlur = blur;
    ctx.shadowColor = isEraser ? "rgba(0,0,0,1)" : "rgba(255,0,0,1)";
  }

  let prev = lastPos;

  for (const pt of points) {
    if (prev) {
      const dx = pt.x - prev.x;
      const dy = pt.y - prev.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > opts.size * 0.15) {
        // Draw line segment if we've moved enough
        drawSegment(ctx, prev, pt, opts.size, isEraser);
        prev = pt;
      }
      // If very close, skip to avoid stacking artifacts
    } else {
      // First point of the stroke — draw a dot
      drawStamp(ctx, pt.x, pt.y, opts.size, isEraser);
      prev = pt;
    }
  }

  ctx.restore();
  return { lastPos: prev, drawn: true };
}

export const BRUSH_PRESETS: Record<string, Partial<BrushOptions>> = {
  softRound: { size: 30, hardness: 0.3, opacity: 1.0 },
  hardRound: { size: 15, hardness: 1.0, opacity: 1.0 },
  pencil: { size: 8, hardness: 0.8, opacity: 0.7 },
  charcoal: { size: 25, hardness: 0.3, opacity: 0.6 },
  watercolor: { size: 35, hardness: 0.2, opacity: 0.4 },
  marker: { size: 12, hardness: 0.5, opacity: 0.9 },
};
