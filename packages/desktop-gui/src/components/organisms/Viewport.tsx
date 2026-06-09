import * as React from 'react';
import { useStudio } from '../../context/StudioContext';
import { WebGLCanvas } from '../canvas/WebGLCanvas';
import { Switch } from '../atoms/Switch';
import { Icon } from '../atoms/Icon';
import { SplitView } from './SplitView';
import { AudioWaveform } from './AudioWaveform';
import { collectStrokePoints, renderStroke, BRUSH_PRESETS } from '../../lib/BrushEngine';

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
    currentTime,
    duration,
    isPaintingMask,
    maskBrushSize,
    setMaskBrushSize,
    maskBrushEraser,
    setMaskBrushEraser,
    setMaskCanvas,
    activeEffects,
    setActiveEffects,
    selectedEffectId,
  } = useStudio();

  const paintCanvasRef = React.useRef<HTMLCanvasElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = React.useState(false);
  const lastPoint = React.useRef<{ x: number; y: number } | null>(null);
  const strokePoints = React.useRef<ReturnType<typeof collectStrokePoints>>([]);
  const [brushPreset, setBrushPreset] = React.useState('softRound');

  const activeFx = React.useMemo(
    () => activeEffects.find((fx) => fx.id === selectedEffectId),
    [activeEffects, selectedEffectId],
  );

  const [paintStyle, setPaintStyle] = React.useState<React.CSSProperties>({
    position: 'absolute',
    display: 'none',
  });
  const [splitView, setSplitView] = React.useState(false);

  const brushDataRef = React.useRef<string | undefined>(undefined);
  React.useEffect(() => {
    brushDataRef.current = activeFx?.mask?.brushData;
  }, [activeFx?.mask?.brushData]);

  const syncPaintCanvasSize = React.useCallback(() => {
    const container = containerRef.current;
    const canvas = paintCanvasRef.current;
    if (container && canvas && isPaintingMask) {
      const glCanvas = container.querySelector('.webgl-canvas') as HTMLCanvasElement;
      if (glCanvas) {
        // Only set canvas resolution if changed to prevent clearing painted drawings
        if (canvas.width !== glCanvas.width || canvas.height !== glCanvas.height) {
          canvas.width = glCanvas.width;
          canvas.height = glCanvas.height;

          const ctx = canvas.getContext('2d');
          const brushData = brushDataRef.current;
          if (ctx && brushData) {
            const img = new Image();
            img.src = brushData;
            img.onload = () => {
              ctx.drawImage(img, 0, 0);
              setMaskCanvas(canvas);
            };
          }
        }

        // Match WebGL display size and position exactly
        setPaintStyle({
          position: 'absolute',
          left: `${glCanvas.offsetLeft}px`,
          top: `${glCanvas.offsetTop}px`,
          width: `${glCanvas.clientWidth}px`,
          height: `${glCanvas.clientHeight}px`,
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

  // Helper to get CSS aspect ratio value
  const getAspectRatioStyle = (): string => {
    switch (aspectRatio) {
      case '1:1':
        return '1 / 1';
      case '16:9':
        return '16 / 9';
      case '4:3':
        return '4 / 3';
      default:
        return 'auto';
    }
  };

  // Sync / initialize drawing canvas size and contents
  React.useEffect(() => {
    const canvas = paintCanvasRef.current;
    const container = containerRef.current;
    if (canvas && container && isPaintingMask) {
      const glCanvas = container.querySelector('.webgl-canvas') as HTMLCanvasElement;
      if (glCanvas) {
        syncPaintCanvasSize();

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          
          if (activeFx?.mask?.brushData) {
            const img = new Image();
            img.src = activeFx.mask.brushData;
            img.onload = () => {
              ctx.drawImage(img, 0, 0);
              setMaskCanvas(canvas);
            };
          } else {
            setMaskCanvas(canvas);
          }
        }
      }
    } else {
      setMaskCanvas(null);
    }
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

  const getCanvasMousePos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = paintCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = paintCanvasRef.current;
    if (!canvas) return;
    setIsDrawing(true);
    lastPoint.current = getCanvasMousePos(e);
    strokePoints.current = collectStrokePoints(e.nativeEvent, canvas);

    const ctx = canvas.getContext('2d');
    if (ctx && strokePoints.current.length > 0) {
      const preset = BRUSH_PRESETS[brushPreset] || BRUSH_PRESETS.softRound;
      renderStroke(ctx, strokePoints.current, { ...preset, size: maskBrushSize }, maskBrushEraser);
      setMaskCanvas(null);
      setMaskCanvas(canvas);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = paintCanvasRef.current;
    if (!canvas) return;
    const pos = getCanvasMousePos(e);
    lastPoint.current = pos;

    const newPoints = collectStrokePoints(e.nativeEvent, canvas);
    strokePoints.current.push(...newPoints);

    const ctx = canvas.getContext('2d');
    if (ctx && newPoints.length > 0) {
      const preset = BRUSH_PRESETS[brushPreset] || BRUSH_PRESETS.softRound;
      renderStroke(ctx, newPoints, { ...preset, size: maskBrushSize }, maskBrushEraser);
      setMaskCanvas(null);
      setMaskCanvas(canvas);
    }
  };

  const handlePointerUp = () => {
    setIsDrawing(false);
    lastPoint.current = null;

    const canvas = paintCanvasRef.current;
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
      className="glass-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        height: '100%',
        padding: '0', // Full screen viewport
        background: 'var(--bg-panel)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-color)',
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
          overflow: 'auto',
        }}
      >
        {mediaUrl ? (
          <div
            style={{
              transition: 'transform 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
              transform: `scale(${zoomLevel})`,
              transformOrigin: 'center center',
              aspectRatio: getAspectRatioStyle(),
              width: '100%',
              height: '100%',
              maxWidth: aspectRatio !== 'free' ? '800px' : '100%',
              maxHeight: aspectRatio !== 'free' ? '600px' : '100%',
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
              <SplitView enabled={splitView} originalSrc={mediaUrl}>
                <WebGLCanvas />
              </SplitView>
              {isPaintingMask && (
                <canvas
                  ref={paintCanvasRef}
                  style={paintStyle}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                />
              )}
              <AudioWaveform
                mediaUrl={mediaUrl}
                currentTime={currentTime}
                duration={duration}
                isPlaying={isPlaying}
              />
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
              backdropFilter: 'var(--glass-blur)',
              WebkitBackdropFilter: 'var(--glass-blur)',
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
