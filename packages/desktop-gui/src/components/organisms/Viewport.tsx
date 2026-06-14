import * as React from 'react';
import { useStudio } from '../../context/StudioContext';
import { WebGLCanvas } from '../canvas/WebGLCanvas';
import { Switch } from '../atoms/Switch';
import { Icon } from '../atoms/Icon';
import { SplitView } from './SplitView';
import { collectStrokePoints, renderStroke, BRUSH_PRESETS } from '../../lib/BrushEngine';
import { useSAM3 } from '../../hooks/useSAM3';
import { Loader2 } from 'lucide-react';

export const Viewport: React.FC = () => {
  const {
    mediaUrl,
    qualityMode,
    setQualityMode,
    zoomLevel,
    setZoomLevel,
    pixelGrid,
    setPixelGrid,
    aspectRatio,
    setAspectRatio,
    isPlaying,
    isPaintingMask,
    maskBrushSize,
    setMaskBrushSize,
    maskBrushEraser,
    setMaskBrushEraser,
    setMaskCanvas,
    setMediaUrl,
    setMediaType,
    activeEffects,
    setActiveEffects,
    selectedEffectId,
  } = useStudio();

  const paintCanvasRef = React.useRef<HTMLCanvasElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = React.useState(false);
  const lastPoint = React.useRef<import('../../lib/BrushEngine').BrushPoint | null>(null);
  const [brushPreset, setBrushPreset] = React.useState('softRound');

  const activeFx = React.useMemo(
    () => activeEffects.find((fx) => fx.id === selectedEffectId),
    [activeEffects, selectedEffectId],
  );

  const [paintStyle, setPaintStyle] = React.useState<React.CSSProperties>({
    position: 'absolute',
    display: 'none',
  });
  const [samOverlayStyle, setSamOverlayStyle] = React.useState<React.CSSProperties>({
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    zIndex: 10,
    display: 'block',
    pointerEvents: 'auto',
    cursor: 'crosshair',
  });
  const [splitView, setSplitView] = React.useState(false);
  const [isDraggingFile, setIsDraggingFile] = React.useState(false);
  const [hideSplitLine, setHideSplitLine] = React.useState(false);
  const samOverlayRef = React.useRef<HTMLDivElement>(null);
  const {
    predictBatch,
    hoverPreview,
    cancelHover,
    status: samStatus,
    progress: samProgress,
    loadingStep: samLoadingStep,
    error: samError,
    hoverMask,
  } = useSAM3();

  // Multi-click point state for SAM
  const [samPoints, setSamPoints] = React.useState<{ x: number; y: number; label: 1 | 0 }[]>([]);
  const samHoverTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverCanvasRef = React.useRef<HTMLCanvasElement | null>(null);

  const brushDataRef = React.useRef<string | undefined>(undefined);
  React.useEffect(() => {
    brushDataRef.current = activeFx?.mask?.brushData;
  }, [activeFx?.mask?.brushData]);

  const isSAMMode = activeFx?.mask?.type === 'sam';

  const syncPaintCanvasSize = React.useCallback(() => {
    const container = containerRef.current;
    const canvas = paintCanvasRef.current;
    if (container && canvas && isPaintingMask) {
      const glCanvas = container.querySelector('.webgl-canvas') as HTMLCanvasElement;
      if (glCanvas) {
        // Only set canvas resolution if changed to prevent clearing painted drawings
        if (canvas.width !== glCanvas.width || canvas.height !== glCanvas.height) {
          // Snapshot current canvas contents before resize (preserves in-progress strokes)
          const currentData = canvas.toDataURL();

          canvas.width = glCanvas.width;
          canvas.height = glCanvas.height;

          const ctx = canvas.getContext('2d');
          if (ctx) {
            // Restore from snapshot first (includes any unsaved in-progress stroke)
            const img = new Image();
            img.src = currentData;
            img.onload = () => {
              ctx.drawImage(img, 0, 0);
              // Then overlay any saved brushData if it exists (committed strokes)
              const brushData = brushDataRef.current;
              if (brushData && brushData !== currentData) {
                const brushImg = new Image();
                brushImg.src = brushData;
                brushImg.onload = () => {
                  ctx.drawImage(brushImg, 0, 0);
                  setMaskCanvas(canvas);
                };
              } else {
                setMaskCanvas(canvas);
              }
            };
          }
        }

        // Match WebGL display size and position exactly using getBoundingClientRect
        // The WebGL canvas is centered via flexbox, so offsetLeft/offsetTop are incorrect
        const containerRect = container.getBoundingClientRect();
        const glRect = glCanvas.getBoundingClientRect();
        const relativeLeft = glRect.left - containerRect.left;
        const relativeTop = glRect.top - containerRect.top;

        setPaintStyle({
          position: 'absolute',
          left: `${relativeLeft}px`,
          top: `${relativeTop}px`,
          width: `${glRect.width}px`,
          height: `${glRect.height}px`,
          cursor: maskBrushEraser ? 'cell' : 'crosshair',
          zIndex: 5,
          pointerEvents: 'auto',
          opacity: 0.5,
          borderRadius: '4px',
          display: 'block',
        });
      }
    }
  }, [isPaintingMask, maskBrushEraser, setMaskCanvas]);

  // Sync / initialize drawing canvas size and contents
  React.useEffect(() => {
    const canvas = paintCanvasRef.current;
    const container = containerRef.current;
    let cancelled = false;
    let img: HTMLImageElement | null = null;

    if (canvas && container && isPaintingMask) {
      const glCanvas = container.querySelector('.webgl-canvas') as HTMLCanvasElement;
      if (glCanvas) {
        syncPaintCanvasSize();

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          if (activeFx?.mask?.brushData) {
            img = new Image();
            img.src = activeFx.mask.brushData;
            img.onload = () => {
              if (!cancelled && img) {
                ctx.drawImage(img, 0, 0);
                setMaskCanvas(canvas);
              }
            };
          } else {
            setMaskCanvas(canvas);
          }
        }
      }
    } else {
      setMaskCanvas(null);
    }

    return () => {
      cancelled = true;
      img = null;
    };
  }, [isPaintingMask, selectedEffectId, activeFx?.mask?.brushData, syncPaintCanvasSize, setMaskCanvas]);

  // Sync size automatically on WebGL canvas resize
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container || !isPaintingMask) return;

    const glCanvas = container.querySelector('.webgl-canvas');
    if (!glCanvas) return;

    syncPaintCanvasSize();

    const observer = new ResizeObserver(() => {
      syncPaintCanvasSize();
    });
    observer.observe(glCanvas);

    return () => {
      observer.disconnect();
    };
  }, [isPaintingMask, syncPaintCanvasSize]);

  // Sync SAM overlay position to match WebGL canvas
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container || !isSAMMode) return;

    const glCanvas = container.querySelector('.webgl-canvas') as HTMLCanvasElement;
    if (!glCanvas) return;

    const updateOverlayPosition = () => {
      const containerRect = container.getBoundingClientRect();
      const glRect = glCanvas.getBoundingClientRect();
      const relativeLeft = glRect.left - containerRect.left;
      const relativeTop = glRect.top - containerRect.top;

      setSamOverlayStyle({
        position: 'absolute',
        left: `${relativeLeft}px`,
        top: `${relativeTop}px`,
        width: `${glRect.width}px`,
        height: `${glRect.height}px`,
        zIndex: 10,
        display: 'block',
        pointerEvents: 'auto',
        cursor: 'crosshair',
        border: '2px dashed rgba(0, 255, 170, 0.3)',
        borderRadius: '4px',
        boxSizing: 'border-box',
      });
    };

    updateOverlayPosition();

    const observer = new ResizeObserver(() => {
      updateOverlayPosition();
    });
    observer.observe(glCanvas);

    return () => {
      observer.disconnect();
    };
  }, [isSAMMode]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      // Electron exposes File.path for dropped files (native absolute path).
      // Convert to media:// so the main process can resolve it for SAM/ffprobe.
      const nativePath = (file as File & { path?: string }).path;
      const url = nativePath
        ? `media://${nativePath.replace(/\\/g, '/')}`
        : URL.createObjectURL(file);
      setMediaUrl(url);
      setMediaType(file.type.startsWith('video') ? 'video' : 'image');
      return;
    }

    const uriList = e.dataTransfer.getData('text/uri-list');
    if (uriList) {
      setMediaUrl(uriList);
      setMediaType(uriList.match(/\.(mp4|webm|mov|avi|mkv)$/i) ? 'video' : 'image');
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = paintCanvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    setIsDrawing(true);

    const points = collectStrokePoints(e.nativeEvent, canvas);
    const ctx = canvas.getContext('2d');
    if (ctx && points.length > 0) {
      const preset = BRUSH_PRESETS[brushPreset] || BRUSH_PRESETS.softRound;
      const result = renderStroke(ctx, points, { ...preset, size: maskBrushSize }, maskBrushEraser);
      lastPoint.current = result.lastPos;
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = paintCanvasRef.current;
    if (!canvas) return;

    const points = collectStrokePoints(e.nativeEvent, canvas);
    const ctx = canvas.getContext('2d');
    if (ctx && points.length > 0) {
      const preset = BRUSH_PRESETS[brushPreset] || BRUSH_PRESETS.softRound;
      const result = renderStroke(ctx, points, { ...preset, size: maskBrushSize }, maskBrushEraser, lastPoint.current);
      lastPoint.current = result.lastPos;
    }
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = paintCanvasRef.current;
    if (canvas) {
      try { canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    }
    setIsDrawing(false);
    lastPoint.current = null;
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = paintCanvasRef.current;
    if (canvas) {
      try { canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    }
    setIsDrawing(false);
    lastPoint.current = null;

    if (canvas && activeFx) {
      const dataUrl = canvas.toDataURL();
      // Use functional update to avoid stale closure on activeEffects
      setActiveEffects((prev) =>
        prev.map((fx) =>
          fx.id === activeFx.id
            ? { ...fx, mask: { ...fx.mask, type: 'brush', brushData: dataUrl } }
            : fx
        )
      );
    }
  };

  // AI Masking click-to-segment handler with multi-click & negative points
  const handleSAMClick = React.useCallback(
    async (e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation(); // Prevent drag/drop from firing
      e.preventDefault();  // Prevent default pointer behavior
      console.log('[SAM CLICK] fired', { isSAMMode, hasActiveFx: !!activeFx, hasMediaUrl: !!mediaUrl, button: e.button, ctrl: e.ctrlKey });
      if (!isSAMMode || !activeFx || !mediaUrl) {
        console.log('[SAM CLICK] early return — missing prerequisites');
        return;
      }

      const container = containerRef.current;
      if (!container) {
        console.log('[SAM CLICK] early return — no container');
        return;
      }

      const glCanvas = container.querySelector('.webgl-canvas') as HTMLCanvasElement;
      if (!glCanvas) {
        console.log('[SAM CLICK] early return — no .webgl-canvas');
        return;
      }
      const rect = glCanvas.getBoundingClientRect();
      // Scale display coordinates to actual canvas pixel dimensions
      const scaleX = glCanvas.width / rect.width;
      const scaleY = glCanvas.height / rect.height;
      const clickX = (e.clientX - rect.left) * scaleX;
      const clickY = (e.clientY - rect.top) * scaleY;
      if (clickX < 0 || clickY < 0 || clickX > glCanvas.width || clickY > glCanvas.height) {
        console.log('[SAM CLICK] early return — click outside canvas bounds');
        return;
      }

      const normX = clickX / glCanvas.width;
      const normY = clickY / glCanvas.height;
      console.log('[SAM CLICK] coords', { clickX, clickY, normX, normY, rect: { w: rect.width, h: rect.height } });

      // Flood fill on Ctrl+click (or Cmd+click on macOS)
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        try {
          const { floodFillCanvas } = await import('../../lib/floodFill');
          const ffCanvas = document.createElement('canvas');
          ffCanvas.width = glCanvas.width;
          ffCanvas.height = glCanvas.height;
          const ffCtx = ffCanvas.getContext('2d');
          if (!ffCtx) return;
          ffCtx.drawImage(glCanvas, 0, 0);
          const result = floodFillCanvas(ffCanvas, Math.round(normX * ffCanvas.width), Math.round(normY * ffCanvas.height), {
            tolerance: 32,
            connectivity: 4,
          });
          if (result.filledPixels === 0) return;
          const maskCanvas = document.createElement('canvas');
          maskCanvas.width = result.width;
          maskCanvas.height = result.height;
          const mCtx = maskCanvas.getContext('2d');
          if (!mCtx) return;
          const rgba = new Uint8ClampedArray(result.width * result.height * 4);
          for (let i = 0; i < result.mask.length; i++) {
            const v = result.mask[i] ? 255 : 0;
            rgba[i * 4] = v;
            rgba[i * 4 + 1] = v;
            rgba[i * 4 + 2] = v;
            rgba[i * 4 + 3] = 255;
          }
          mCtx.putImageData(new ImageData(rgba, result.width, result.height), 0, 0);
          const samMaskData = maskCanvas.toDataURL('image/png');
          setActiveEffects((prev) =>
            prev.map((fx) =>
              fx.id === activeFx.id
                ? { ...fx, mask: { ...(fx.mask || {}), type: 'sam', samMaskData, samClickPoint: { x: normX, y: normY } } }
                : fx,
            ),
          );
          setSamPoints([]);
        } catch (err) {
          console.error('[AI Masking] Flood fill failed:', err);
        }
        return;
      }

      // Right click = negative point, left click = positive point
      const isRightClick = e.button === 2;
      const newPoint = { x: normX, y: normY, label: (isRightClick ? 0 : 1) as 1 | 0 };

      // Prevent context menu from showing on right click
      if (isRightClick) {
        e.preventDefault();
        e.stopPropagation();
      }

      const nextPoints = [...samPoints, newPoint];
      setSamPoints(nextPoints);

      try {
        const positive = nextPoints.filter((p) => p.label === 1);
        const negative = nextPoints.filter((p) => p.label === 0);
        console.log('[SAM CLICK] calling predictBatch', { mediaUrl, positiveCount: positive.length, negativeCount: negative.length });

        const mask = await predictBatch(mediaUrl, positive, negative);
        console.log('[SAM CLICK] predictBatch result', { hasMask: !!mask, maskSize: mask ? `${mask.width}x${mask.height}` : 'null' });
        if (!mask) {
          console.warn('[AI Masking] predictBatch returned no mask');
          return;
        }

        const samMaskData = mask.dataUrl || (() => {
          // Fallback: create data URL from raw bytes if dataUrl missing
          const c = document.createElement('canvas');
          c.width = mask.width;
          c.height = mask.height;
          const cx = c.getContext('2d');
          if (!cx) return '';
          const rgba = new Uint8ClampedArray(mask.width * mask.height * 4);
          for (let i = 0; i < mask.data.length; i++) {
            const val = mask.data[i] ? 255 : 0;
            rgba[i * 4] = val;
            rgba[i * 4 + 1] = val;
            rgba[i * 4 + 2] = val;
            rgba[i * 4 + 3] = 255;
          }
          cx.putImageData(new ImageData(rgba, mask.width, mask.height), 0, 0);
          return c.toDataURL('image/png');
        })();

        setActiveEffects((prev) =>
          prev.map((fx) =>
            fx.id === activeFx.id
              ? {
                  ...fx,
                  mask: {
                    ...(fx.mask || {}),
                    type: 'sam',
                    samMaskData,
                    samClickPoint: { x: normX, y: normY },
                  },
                }
              : fx,
          ),
        );
      } catch (err) {
        console.error('[AI Masking] Click-to-segment failed:', err);
      }
    },
    [isSAMMode, activeFx, mediaUrl, samPoints, predictBatch, setActiveEffects],
  );

  // Debounced hover preview for SAM
  const handleSAMMouseMove = React.useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isSAMMode || !mediaUrl || samStatus !== 'ready') return;
      const container = containerRef.current;
      if (!container) return;
      const glCanvas = container.querySelector('.webgl-canvas') as HTMLCanvasElement;
      if (!glCanvas) return;
      const rect = glCanvas.getBoundingClientRect();
      const scaleX = glCanvas.width / rect.width;
      const scaleY = glCanvas.height / rect.height;
      const x = ((e.clientX - rect.left) * scaleX) / glCanvas.width;
      const y = ((e.clientY - rect.top) * scaleY) / glCanvas.height;
      if (x < 0 || y < 0 || x > 1 || y > 1) return;

      if (samHoverTimeoutRef.current) {
        clearTimeout(samHoverTimeoutRef.current);
      }
      samHoverTimeoutRef.current = setTimeout(() => {
        hoverPreview(mediaUrl, { x, y }).catch(() => {
          /* ignore hover errors */
        });
      }, 120);
    },
    [isSAMMode, mediaUrl, samStatus, hoverPreview],
  );

  const handleSAMMouseLeave = React.useCallback(() => {
    if (samHoverTimeoutRef.current) {
      clearTimeout(samHoverTimeoutRef.current);
      samHoverTimeoutRef.current = null;
    }
    cancelHover();
  }, [cancelHover]);

  // Cleanup hover timeout on unmount to prevent leaks
  React.useEffect(() => {
    return () => {
      if (samHoverTimeoutRef.current) {
        clearTimeout(samHoverTimeoutRef.current);
        samHoverTimeoutRef.current = null;
      }
    };
  }, []);

  // Draw hover mask directly to a canvas ref (avoids setState-in-effect lint)
  React.useEffect(() => {
    const canvas = hoverCanvasRef.current;
    if (!canvas || !hoverMask) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let cancelled = false;
    let img: HTMLImageElement | null = null;

    if (hoverMask.dataUrl) {
      // Use base64 PNG directly from Python backend
      img = new Image();
      img.onload = () => {
        if (cancelled) return;
        canvas.width = hoverMask.width;
        canvas.height = hoverMask.height;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 0.7; // semi-transparent for preview
        ctx.drawImage(img!, 0, 0);
        ctx.globalAlpha = 1.0;
      };
      img.src = hoverMask.dataUrl;
    } else {
      // Fallback: create from raw bytes if dataUrl missing
      canvas.width = hoverMask.width;
      canvas.height = hoverMask.height;
      const rgba = new Uint8ClampedArray(hoverMask.width * hoverMask.height * 4);
      for (let i = 0; i < hoverMask.data.length; i++) {
        const v = hoverMask.data[i] ? 255 : 0;
        rgba[i * 4] = v;
        rgba[i * 4 + 1] = v;
        rgba[i * 4 + 2] = v;
        rgba[i * 4 + 3] = 180; // semi-transparent for preview
      }
      ctx.putImageData(new ImageData(rgba, hoverMask.width, hoverMask.height), 0, 0);
    }

    return () => {
      cancelled = true;
      img = null;
    };
  }, [hoverMask]);

  // Keyboard shortcut: Escape clears SAM points
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isSAMMode) {
        setSamPoints([]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isSAMMode]);

  // Brush size shortcuts: [ decrease, ] increase
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isPaintingMask) return;
      if (e.key === '[') {
        e.preventDefault();
        setMaskBrushSize(Math.max(1, maskBrushSize - 2));
      } else if (e.key === ']') {
        e.preventDefault();
        setMaskBrushSize(Math.min(200, maskBrushSize + 2));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isPaintingMask, maskBrushSize, setMaskBrushSize]);

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="glass-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: '1 1 0%',
        minHeight: 0,
        minWidth: 0,
        padding: '0',
        background: 'var(--bg-panel)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-subtle)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Main Viewport Window */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#040405',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {mediaUrl ? (
          <div
            style={{
              transition: 'transform 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
              transform: `scale(${zoomLevel})`,
              transformOrigin: 'center center',
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              ref={containerRef}
              style={{
                width: '100%',
                height: '100%',
                imageRendering: pixelGrid ? 'pixelated' : 'auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
              }}
            >
              <SplitView enabled={splitView} hideSplitLine={hideSplitLine} originalSrc={mediaUrl}>
                <WebGLCanvas />
              </SplitView>
              {isPaintingMask && (
                <canvas
                  ref={paintCanvasRef}
                  style={paintStyle}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerCancel}
                  onPointerLeave={handlePointerCancel}
                />
              )}
              {isSAMMode && (
                <div
                  ref={samOverlayRef}
                  onPointerDown={handleSAMClick}
                  onMouseMove={handleSAMMouseMove}
                  onMouseLeave={handleSAMMouseLeave}
                  onContextMenu={(e) => e.preventDefault()}
                  style={samOverlayStyle}
                  className={`sam-overlay ${samStatus === 'segmenting' || samStatus === 'loading' ? 'sam-overlay--loading' : 'sam-overlay--ready'}`}
                >
                  {/* Hover preview canvas */}
                  {hoverMask && (
                    <canvas
                      ref={hoverCanvasRef}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        pointerEvents: 'none',
                        opacity: 0.5,
                        mixBlendMode: 'screen',
                      }}
                    />
                  )}
                  {/* Positive / negative point indicators */}
                  {samPoints.map((p, i) => (
                    <div
                      key={i}
                      style={{
                        position: 'absolute',
                        left: `${p.x * 100}%`,
                        top: `${p.y * 100}%`,
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: p.label === 1 ? '#00ffaa' : '#ff5050',
                        border: '2px solid #fff',
                        transform: 'translate(-50%, -50%)',
                        pointerEvents: 'none',
                        zIndex: 11,
                      }}
                      title={p.label === 1 ? 'Positive point' : 'Negative point'}
                    />
                  ))}
                  {(samStatus === 'loading' || samStatus === 'segmenting') && (
                    <div className="sam-hud">
                      <Loader2 size={28} className="sam-spinner" />
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                        <span className="sam-hud__title">
                          {samStatus === 'loading' ? 'Loading AI Masking Model' : 'Generating Mask'}
                        </span>
                        <span className="sam-hud__subtitle">
                          {samStatus === 'loading' ? samLoadingStep || 'Preparing...' : 'Processing segmentation...'}
                        </span>
                      </div>
                      <div className="sam-hud__progress-track">
                        <div
                          className="sam-hud__progress-fill"
                          style={{ width: `${samProgress}%` }}
                        />
                      </div>
                      <span className="sam-hud__percent">{Math.round(samProgress)}%</span>
                    </div>
                  )}
                  {samStatus === 'error' && samError && (
                    <div className="sam-error">
                      <span className="sam-error__title">AI Masking Error</span>
                      <span className="sam-error__message">{samError}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          // SAM model auto-loads on next segmentation attempt
                          window.location.reload();
                        }}
                        className="btn-primary"
                        style={{ marginTop: 4 }}
                      >
                        Reload
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
              color: 'var(--text-tertiary)',
            }}
          >
            <Icon name="folder" size={48} style={{ opacity: 0.5 }} />
            <span style={{ fontSize: '14px', fontWeight: 500 }}>No Media Loaded</span>
            <span style={{ fontSize: '12px', opacity: 0.8 }}>Import an image or video file to start.</span>
          </div>
        )}

        {/* Floating HUD Viewport Controls */}
        {isDraggingFile && (
          <div className="drag-drop-overlay">
            <span style={{ fontSize: '18px', fontWeight: 600 }}>Drop media here</span>
            <span style={{ fontSize: '13px', opacity: 0.7 }}>Images and videos supported</span>
          </div>
        )}
        {mediaUrl && (
          <div
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              background: 'rgba(28, 28, 30, 0.85)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-lg)',
              padding: '6px 14px',
              boxShadow: 'var(--shadow-lg)',
              zIndex: 100,
              backdropFilter: 'blur(12px) saturate(180%)',
              WebkitBackdropFilter: 'blur(12px) saturate(180%)',
              pointerEvents: 'auto',
            }}
            className="viewport-hud-controls animate-fade-in"
          >
            {/* Aspect Ratio */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Aspect</span>
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value)}
                style={{
                  padding: '2px 4px',
                  fontSize: '11px',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                <option value="free">Free</option>
                <option value="1:1">1:1</option>
                <option value="16:9">16:9</option>
                <option value="4:3">4:3</option>
              </select>
            </div>

            <div style={{ width: '1px', height: '14px', backgroundColor: 'var(--border-color)' }} />

            {/* Quality Mode */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Render</span>
              <div
                style={{
                  display: 'flex',
                  background: 'rgba(0,0,0,0.2)',
                  padding: '1px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-color)',
                }}
              >
                {(['full', 'live', 'still'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setQualityMode(mode)}
                    style={{
                      padding: '2px 6px',
                      fontSize: '10px',
                      borderRadius: '2px',
                      background: qualityMode === mode ? 'var(--accent-primary)' : 'transparent',
                      color: qualityMode === mode ? '#fff' : 'var(--text-secondary)',
                      fontWeight: qualityMode === mode ? 600 : 400,
                      transition: 'all 0.15s ease',
                      textTransform: 'capitalize',
                      lineHeight: 1.2,
                    }}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ width: '1px', height: '14px', backgroundColor: 'var(--border-color)' }} />

            {/* Pixel Grid */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pixel</span>
              <Switch checked={pixelGrid} onChange={setPixelGrid} />
            </div>

            <div style={{ width: '1px', height: '14px', backgroundColor: 'var(--border-color)' }} />

            {/* Zoom Slider */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Zoom: {Math.round(zoomLevel * 100)}%
              </span>
              <input
                type="range"
                min={0.5}
                max={4}
                step={0.1}
                value={zoomLevel}
                onChange={(e) => setZoomLevel(Number(e.target.value))}
                style={{ width: '60px', height: '3px', cursor: 'pointer' }}
              />
            </div>

            <div style={{ width: '1px', height: '14px', backgroundColor: 'var(--border-color)' }} />

            {/* Split View Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>A/B</span>
              <Switch checked={splitView} onChange={setSplitView} />
            </div>
            {splitView && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Hide Line</span>
                <Switch checked={hideSplitLine} onChange={setHideSplitLine} />
              </div>
            )}

            {/* Brush Controls when painting mask */}
            {isPaintingMask && (
              <>
                <div style={{ width: '1px', height: '14px', backgroundColor: 'var(--border-color)' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Preset</span>
                  <select
                    title="Brush preset"
                    value={brushPreset}
                    onChange={(e) => setBrushPreset(e.target.value)}
                    style={{ padding: '2px 4px', fontSize: '11px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', cursor: 'pointer', outline: 'none' }}
                  >
                    {Object.keys(BRUSH_PRESETS).map((key) => (
                      <option key={key} value={key}>{key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}</option>
                    ))}
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Size {maskBrushSize}</span>
                  <input
                    type="range"
                    min={1}
                    max={100}
                    step={1}
                    value={maskBrushSize}
                    onChange={(e) => setMaskBrushSize(Number(e.target.value))}
                    style={{ width: '50px', height: '3px', cursor: 'pointer' }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Eraser</span>
                  <Switch checked={maskBrushEraser} onChange={setMaskBrushEraser} />
                </div>
              </>
            )}
          </div>
        )}

        {/* Playback Indicator Overlay */}
        {isPlaying && mediaUrl && (
          <div
            style={{
              position: 'absolute',
              top: '12px',
              left: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(0,0,0,0.6)',
              padding: '4px 10px',
              borderRadius: '12px',
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--accent-primary)',
              border: '1px solid var(--accent-glow)',
              backdropFilter: 'blur(4px)',
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: 'var(--accent-primary)',
                animation: 'pulse 1.5s infinite ease-in-out',
                display: 'inline-block',
              }}
            />
            LIVE PREVIEW (24 FPS)
          </div>
        )}
      </div>
    </div>
  );
};
