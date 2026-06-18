import { Crosshair, FileUp, Image, Maximize2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { getFrameData, getMediaInfo, loadMediaFile, loadMediaFromBase64, sam3BoxPrompt, sam3PointPrompt } from "../lib/tauri";
import { useAppStore } from "../store";
import { WebGLContext, MediaUploader, EffectChain } from "../engine/webgl2";
import { stackToRenderPasses, buildShaderMap } from "../utils/effectConverter";
import ScopesOverlay from "./ScopesOverlay";
import PlaybackOverlay from "./PlaybackOverlay";

interface Props {
  isDropTarget?: boolean;
}

/** Map a screen (client) coordinate to image pixel coords using the rendered element rect. */
function screenToImageCoords(
  clientX: number,
  clientY: number,
  el: HTMLElement,
  mediaW: number,
  mediaH: number
): { x: number; y: number } {
  const rect = el.getBoundingClientRect();
  const naturalWidth = (el as HTMLImageElement).naturalWidth || mediaW;
  const naturalHeight = (el as HTMLImageElement).naturalHeight || mediaH;
  const scaleX = naturalWidth / rect.width;
  const scaleY = naturalHeight / rect.height;
  const x = Math.round((clientX - rect.left) * scaleX);
  const y = Math.round((clientY - rect.top) * scaleY);
  return {
    x: Math.max(0, Math.min(mediaW - 1, x)),
    y: Math.max(0, Math.min(mediaH - 1, y)),
  };
}

export default function PreviewViewport({ isDropTarget = false }: Props) {
  const mediaLoaded = useAppStore((s) => s.mediaLoaded);
  const previewDataUrl = useAppStore((s) => s.previewDataUrl);
  const originalDataUrl = useAppStore((s) => s.originalDataUrl);
  const mediaInfo = useAppStore((s) => s.mediaInfo);
  const showBeforeAfter = useAppStore((s) => s.showBeforeAfter);
  const zoom = useAppStore((s) => s.zoom);
  const effectStack = useAppStore((s) => s.effectStack);
  const audioEnabled = useAppStore((s) => s.audioEnabled);
  const audioBandEnergies = useAppStore((s) => s.audioBandEnergies);
  const audioBeatFlags = useAppStore((s) => s.audioBeatFlags);
  const audioMappedValues = useAppStore((s) => s.audioMappedValues);
  const activeMask = useAppStore((s) => s.activeMask);
  const maskVisible = useAppStore((s) => s.maskVisible);
  const sam3Ready = useAppStore((s) => s.sam3Ready);
  const sam3Mode = useAppStore((s) => s.sam3Mode);
  const sam3Points = useAppStore((s) => s.sam3Points);
  const sam3HoverMask = useAppStore((s) => s.sam3HoverMask);
  const sam3OverlayOpacity = useAppStore((s) => s.sam3OverlayOpacity);
  const sam3OverlayColor = useAppStore((s) => s.sam3OverlayColor);
  const setMediaLoaded = useAppStore((s) => s.setMediaLoaded);
  const setMediaInfo = useAppStore((s) => s.setMediaInfo);
  const setPreviewDataUrl = useAppStore((s) => s.setPreviewDataUrl);
  const setOriginalDataUrl = useAppStore((s) => s.setOriginalDataUrl);
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);
  const setSam3Masks = useAppStore((s) => s.setSam3Masks);
  const addSam3Point = useAppStore((s) => s.addSam3Point);
  const clearSam3Points = useAppStore((s) => s.clearSam3Points);
  const setSam3HoverMask = useAppStore((s) => s.setSam3HoverMask);
  const setFilePath = useAppStore((s) => s.setFilePath);

  const containerRef = useRef<HTMLDivElement>(null);
  const previewImgRef = useRef<HTMLImageElement>(null);
  const webglCanvasRef = useRef<HTMLCanvasElement>(null);
  const glCtxRef = useRef<WebGLContext | null>(null);
  const uploaderRef = useRef<MediaUploader | null>(null);
  const chainRef = useRef<EffectChain | null>(null);
  const sourceTexRef = useRef<WebGLTexture | null>(null);
  const rafRef = useRef<number>(0);
  const sam3CanvasRef = useRef<HTMLCanvasElement>(null);
  const hoverTimeoutRef = useRef<number | null>(null);
  const isProcessingRef = useRef(false);

  const [isPanDragging, setIsPanDragging] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panDragStart, setPanDragStart] = useState({ x: 0, y: 0 });
  const [splitPosition, setSplitPosition] = useState(50);
  const [isSplitDragging, setIsSplitDragging] = useState(false);
  const [isHtmlDropTarget, setIsHtmlDropTarget] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Box-drag state
  const [isBoxDragging, setIsBoxDragging] = useState(false);
  const [boxStart, setBoxStart] = useState<{ x: number; y: number } | null>(null);
  const [boxCurrent, setBoxCurrent] = useState<{ x: number; y: number } | null>(null);

  // ── Pan / Zoom / Split ─────────────────────────────────────
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      useAppStore.getState().setZoom(zoom + delta);
    },
    [zoom]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 1 && !(e.button === 0 && e.altKey)) return;
      setIsPanDragging(true);
      setPanDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    },
    [pan]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isPanDragging) {
        setPan({ x: e.clientX - panDragStart.x, y: e.clientY - panDragStart.y });
      }
      if (isSplitDragging && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const pct = ((e.clientX - rect.left) / rect.width) * 100;
        setSplitPosition(Math.max(5, Math.min(95, pct)));
      }
    },
    [isPanDragging, isSplitDragging, panDragStart]
  );

  const handleMouseUp = useCallback(() => {
    setIsPanDragging(false);
    setIsSplitDragging(false);
  }, []);

  useEffect(() => {
    const handleGlobalUp = () => {
      setIsPanDragging(false);
      setIsSplitDragging(false);
    };
    window.addEventListener("mouseup", handleGlobalUp);
    return () => window.removeEventListener("mouseup", handleGlobalUp);
  }, []);

  // ── Drag-and-drop ──────────────────────────────────────────
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsHtmlDropTarget(true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsHtmlDropTarget(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsHtmlDropTarget(false);
  }, []);

  // ── Backend sync ───────────────────────────────────────────
  const refreshPreviewFromBackend = useCallback(async () => {
    const info = await getMediaInfo();
    if (!info.loaded) return false;
    setMediaLoaded(true);
    setMediaInfo({ width: info.width, height: info.height });
    const frame = await getFrameData();
    setPreviewDataUrl(frame);
    setOriginalDataUrl(frame);
    return true;
  }, [setMediaLoaded, setMediaInfo, setPreviewDataUrl, setOriginalDataUrl]);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsHtmlDropTarget(false);
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        const file = files[0];
        setStatusMessage(`Loading ${file.name}...`);
        try {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
          });
          await loadMediaFromBase64(dataUrl);
          await refreshPreviewFromBackend();
          setStatusMessage(`Loaded: ${file.name}`);
        } catch (err) {
          setStatusMessage(`Failed to load ${file.name}: ${err}`);
          console.error("[html5-drop] error:", err);
        }
      }
    },
    [setStatusMessage, refreshPreviewFromBackend]
  );

  const handleClickOpen = async () => {
    try {
      setStatusMessage("Opening file dialog...");
      const path = await loadMediaFile();
      if (path) {
        setFilePath(path);
        const synced = await refreshPreviewFromBackend();
        setStatusMessage(synced ? `Loaded: ${path}` : `Loaded: ${path} (preview sync pending)`);
      } else {
        setStatusMessage("Open cancelled");
      }
    } catch (err) {
      console.error("[PreviewViewport] handleClickOpen failed:", err);
      setStatusMessage(`Open error: ${err}`);
    }
  };

  // ── SAM3 Tree Masking ──────────────────────────────────────

  /** True when the SAM3 canvas overlay should capture pointer events. */
  const isSam3Interactive = sam3Ready && !showBeforeAfter && (sam3Mode === "point" || sam3Mode === "box");

  /** Run point prediction with the full accumulated tree. */
  const runPointTree = useCallback(
    async (extraPoint?: { x: number; y: number; label: 1 | 0 }) => {
      if (isProcessingRef.current) return;
      const canvas = webglCanvasRef.current || previewImgRef.current;
      if (!canvas || !mediaInfo) return;

      const allPoints = extraPoint ? [...sam3Points, extraPoint] : sam3Points;
      if (allPoints.length === 0) return;

      isProcessingRef.current = true;
      try {
        const coords = allPoints.map((p) => [p.x, p.y] as [number, number]);
        const labels = allPoints.map((p) => p.label);
        const result = await sam3PointPrompt(coords, labels);
        if (result.count > 0) {
          setSam3Masks(result.masks, result.scores);
          const ptCount = allPoints.length;
          setStatusMessage(`SAM3 tree: ${ptCount} point(s) → ${result.count} mask candidate(s)`);
        } else {
          setSam3Masks([], []);
          setStatusMessage("SAM3: no mask from point tree");
        }
      } catch (err) {
        setStatusMessage(`SAM3 point tree failed: ${err}`);
      } finally {
        isProcessingRef.current = false;
      }
    },
    [sam3Points, mediaInfo, setSam3Masks, setStatusMessage]
  );

  /** Run box prediction. */
  const runBox = useCallback(
    async (x1: number, y1: number, x2: number, y2: number) => {
      if (isProcessingRef.current) return;
      isProcessingRef.current = true;
      try {
        const result = await sam3BoxPrompt([[x1, y1, x2, y2]]);
        if (result.count > 0) {
          setSam3Masks(result.masks, result.scores);
          setStatusMessage(`Box mask: ${result.count} candidate(s) ready`);
        } else {
          setSam3Masks([], []);
          setStatusMessage("SAM3: no mask from box");
        }
      } catch (err) {
        setStatusMessage(`SAM3 box failed: ${err}`);
      } finally {
        isProcessingRef.current = false;
      }
    },
    [setSam3Masks, setStatusMessage]
  );

  /** Debounced hover preview in point mode. */
  const scheduleHover = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = webglCanvasRef.current || previewImgRef.current;
      if (sam3Mode !== "point" || !mediaInfo || !canvas) return;
      if (hoverTimeoutRef.current) window.clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = window.setTimeout(async () => {
        const { x, y } = screenToImageCoords(clientX, clientY, canvas, mediaInfo.width, mediaInfo.height);
        const allPoints = [...sam3Points, { x, y, label: 1 as const }];
        try {
          const coords = allPoints.map((p) => [p.x, p.y] as [number, number]);
          const labels = allPoints.map((p) => p.label);
          const result = await sam3PointPrompt(coords, labels);
          if (result.count > 0) setSam3HoverMask(result.masks[0]);
        } catch {
          setSam3HoverMask(null);
        }
      }, 80);
    },
    [sam3Mode, mediaInfo, sam3Points, setSam3HoverMask]
  );

  const cancelHover = useCallback(() => {
    if (hoverTimeoutRef.current) {
      window.clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setSam3HoverMask(null);
  }, [setSam3HoverMask]);

  // ── Canvas overlay event handlers ──────────────────────────

  const handleCanvasClick = useCallback(
    async (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = webglCanvasRef.current || previewImgRef.current;
      if (sam3Mode !== "point" || !mediaInfo || !canvas) return;
      e.preventDefault();
      e.stopPropagation();

      const { x, y } = screenToImageCoords(e.clientX, e.clientY, canvas, mediaInfo.width, mediaInfo.height);
      const label: 1 | 0 = e.shiftKey ? 0 : 1;

      const point: { x: number; y: number; label: 1 | 0 } = { x, y, label };
      addSam3Point(point);
      cancelHover();

      // Pass the new point directly to avoid stale closure in runPointTree
      runPointTree(point);
    },
    [sam3Mode, mediaInfo, addSam3Point, cancelHover, runPointTree]
  );

  const handleCanvasContextMenu = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = webglCanvasRef.current || previewImgRef.current;
      if (sam3Mode !== "point" || !mediaInfo || !canvas) return;
      e.preventDefault();
      e.stopPropagation();

      const { x, y } = screenToImageCoords(e.clientX, e.clientY, canvas, mediaInfo.width, mediaInfo.height);
      const point: { x: number; y: number; label: 1 | 0 } = { x, y, label: 0 };
      addSam3Point(point); // negative point
      cancelHover();
      runPointTree(point);
    },
    [sam3Mode, mediaInfo, addSam3Point, cancelHover, runPointTree]
  );

  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = webglCanvasRef.current || previewImgRef.current;
      if (sam3Mode !== "box" || !mediaInfo || !canvas) return;
      if (e.button !== 0) return; // only left click
      e.preventDefault();
      e.stopPropagation();

      const { x, y } = screenToImageCoords(e.clientX, e.clientY, canvas, mediaInfo.width, mediaInfo.height);
      setIsBoxDragging(true);
      setBoxStart({ x, y });
      setBoxCurrent({ x, y });
    },
    [sam3Mode, mediaInfo]
  );

  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = webglCanvasRef.current || previewImgRef.current;
      if (!mediaInfo || !canvas) return;

      if (sam3Mode === "box" && isBoxDragging && boxStart) {
        e.preventDefault();
        const { x, y } = screenToImageCoords(e.clientX, e.clientY, canvas, mediaInfo.width, mediaInfo.height);
        setBoxCurrent({ x, y });
        return;
      }

      if (sam3Mode === "point") {
        scheduleHover(e.clientX, e.clientY);
      }
    },
    [sam3Mode, isBoxDragging, boxStart, mediaInfo, scheduleHover]
  );

  const handleCanvasMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (sam3Mode !== "box" || !isBoxDragging || !boxStart || !boxCurrent || !mediaInfo) return;
      e.preventDefault();
      e.stopPropagation();

      const x1 = Math.min(boxStart.x, boxCurrent.x);
      const y1 = Math.min(boxStart.y, boxCurrent.y);
      const x2 = Math.max(boxStart.x, boxCurrent.x);
      const y2 = Math.max(boxStart.y, boxCurrent.y);

      setIsBoxDragging(false);
      setBoxStart(null);
      setBoxCurrent(null);

      if (x2 - x1 < 2 || y2 - y1 < 2) return; // ignore tiny accidental clicks
      runBox(x1, y1, x2, y2);
    },
    [sam3Mode, isBoxDragging, boxStart, boxCurrent, mediaInfo, runBox]
  );

  const handleCanvasMouseLeave = useCallback(() => {
    cancelHover();
    if (isBoxDragging) {
      setIsBoxDragging(false);
      setBoxStart(null);
      setBoxCurrent(null);
    }
  }, [cancelHover, isBoxDragging]);

  // ── Draw SAM3 UI overlay (points + drag box) ────────────────
  useEffect(() => {
    const canvas = sam3CanvasRef.current;
    if (!canvas || !mediaInfo) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Size canvas to image native resolution
    canvas.width = mediaInfo.width;
    canvas.height = mediaInfo.height;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw committed points
    for (const p of sam3Points) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = p.label === 1 ? "#22c55e" : "#ef4444";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#fff";
      ctx.stroke();
    }

    // Draw drag box
    if (isBoxDragging && boxStart && boxCurrent) {
      const x1 = Math.min(boxStart.x, boxCurrent.x);
      const y1 = Math.min(boxStart.y, boxCurrent.y);
      const x2 = Math.max(boxStart.x, boxCurrent.x);
      const y2 = Math.max(boxStart.y, boxCurrent.y);
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(245, 158, 11, 0.15)";
      ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
    }
  }, [sam3Points, isBoxDragging, boxStart, boxCurrent, mediaInfo]);

  // ── WebGL Preview Pipeline ────────────────────────────────
  useEffect(() => {
    if (!webglCanvasRef.current) return;
    try {
      const ctx = new WebGLContext(webglCanvasRef.current);
      glCtxRef.current = ctx;
      uploaderRef.current = new MediaUploader(ctx);
      chainRef.current = new EffectChain(ctx, 1024, 1024);
    } catch (e) {
      console.warn('WebGL2 not available:', e);
    }
    return () => {
      glCtxRef.current?.destroy();
      glCtxRef.current = null;
      uploaderRef.current = null;
      chainRef.current = null;
    };
  }, []);

  // Invalidate texture when original image changes
  useEffect(() => {
    sourceTexRef.current = null;
  }, [originalDataUrl]);

  // WebGL real-time preview: re-render when image or effect stack changes
  useEffect(() => {
    // Always use the original (unprocessed) image as the WebGL source texture
    if (!originalDataUrl || !glCtxRef.current || !uploaderRef.current) return;
    const uploader = uploaderRef.current;
    const chain = chainRef.current;
    if (!chain) return;

    const render = async () => {
      try {
        // Resize chain to match media dimensions
        if (mediaInfo) {
          chain.resize(mediaInfo.width, mediaInfo.height);
          const canvas = webglCanvasRef.current;
          if (canvas) {
            canvas.width = mediaInfo.width;
            canvas.height = mediaInfo.height;
          }
        }

        // Upload source image (cached per originalDataUrl)
        let tex = sourceTexRef.current;
        if (!tex) {
          tex = await uploader.uploadImage(originalDataUrl);
          sourceTexRef.current = tex;
        }

        // Build render passes from active effect stack
        const passes = stackToRenderPasses(effectStack);

        // Inject global audio uniforms into every pass
        const audioUniforms: Record<string, number> = {
          u_bass: audioBandEnergies.bass ?? 0,
          u_band0: audioBandEnergies.subBass ?? 0,
          u_band1: audioBandEnergies.bass ?? 0,
          u_band2: audioBandEnergies.lowMid ?? 0,
          u_band3: audioBandEnergies.mid ?? 0,
          u_band4: audioBandEnergies.highMid ?? 0,
          u_band5: audioBandEnergies.presence ?? 0,
          u_band6: audioBandEnergies.brilliance ?? 0,
          u_centroid: audioMappedValues.centroid ?? 0,
          u_rms: audioMappedValues.rms ?? 0,
          u_energy: audioMappedValues.energy ?? 0,
          u_flux: audioMappedValues.flux ?? 0,
          u_beatBass: audioBeatFlags.bass ? 1 : 0,
          u_beatMid: audioBeatFlags.mid ? 1 : 0,
          u_beatTreble: audioBeatFlags.treble ? 1 : 0,
        };
        for (const pass of passes) {
          Object.assign(pass.uniforms, audioUniforms);
        }

        const shaderMap = buildShaderMap(passes);

        // Render to WebGL canvas
        chain.render(tex, passes, shaderMap);
      } catch (e) {
        console.error('WebGL render failed:', e);
      }
    };

    render();

    // Continuous render loop when audio is active so uniforms update every frame
    if (audioEnabled) {
      const loop = () => {
        render();
        rafRef.current = requestAnimationFrame(loop);
      };
      rafRef.current = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [originalDataUrl, effectStack, mediaInfo, audioEnabled, audioBandEnergies, audioBeatFlags, audioMappedValues]);

  // ── Cleanup hover on unmount ───────────────────────────────
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) window.clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  // ── Fullscreen toggle ──────────────────────────────────────
  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "F11") {
        e.preventDefault();
        toggleFullscreen();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleFullscreen]);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // ── Clear hover mask when switching modes ──────────────────
  useEffect(() => {
    cancelHover();
    clearSam3Points();
    setIsBoxDragging(false);
    setBoxStart(null);
    setBoxCurrent(null);
  }, [sam3Mode, cancelHover, clearSam3Points]);

  const showDropOverlay = isDropTarget || isHtmlDropTarget;

  return (
    <div
      className="flex-1 flex flex-col min-h-0"
      style={{ background: "var(--bg-secondary)" }}
    >
      {/* Canvas Area */}
      <div
        ref={containerRef}
        className={`flex-1 relative overflow-hidden ${!mediaLoaded ? "checkerboard" : ""} ${isFullscreen ? "bg-black" : ""}`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          cursor: isPanDragging
            ? "grabbing"
            : isSam3Interactive && sam3Mode === "point"
            ? "crosshair"
            : isSam3Interactive && sam3Mode === "box"
            ? "crosshair"
            : "default",
        }}
      >
        {!mediaLoaded && (
          <button
            onClick={handleClickOpen}
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 w-full h-full"
            style={{ background: "transparent", border: "none", cursor: "pointer" }}
          >
            <Image size={40} style={{ color: "var(--text-dim)", opacity: 0.5 }} />
            <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
              Drop an image or video here to begin
            </div>
            <div style={{ color: "var(--text-dim)", fontSize: 12 }}>
              — or click to browse —
            </div>
            <div
              className="text-[11px] px-3 py-1.5 rounded-md"
              style={{
                color: "var(--text-dim)",
                border: "1px dashed var(--border-secondary)",
              }}
            >
              PNG, JPG, GIF, WEBP, TIFF, BMP, MP4, MOV, MKV, AVI, WEBM
            </div>
          </button>
        )}

        {/* Drop target overlay */}
        {showDropOverlay && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-50"
            style={{
              background: "rgba(0,0,0,0.7)",
              backdropFilter: "blur(2px)",
              pointerEvents: "none",
            }}
          >
            <FileUp size={48} style={{ color: "var(--accent)" }} />
            <div className="text-sm font-semibold" style={{ color: "var(--accent)" }}>
              Drop file here to open
            </div>
          </div>
        )}

        {mediaLoaded && previewDataUrl && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px)`,
              cursor: isPanDragging ? "grabbing" : "grab",
            }}
          >
            <div
              className="relative"
              style={{
                transform: `scale(${zoom})`,
                transformOrigin: "center center",
                transition: isPanDragging ? "none" : "transform 0.15s ease",
              }}
            >
              {showBeforeAfter && originalDataUrl ? (
                <div className="relative">
                  {/* After (full) */}
                  <img
                    src={previewDataUrl}
                    alt="Preview"
                    draggable={false}
                    style={{
                      maxWidth: "85vw",
                      maxHeight: "80vh",
                      display: "block",
                    }}
                  />
                  {/* Before (clipped) */}
                  <div
                    className="absolute inset-0 overflow-hidden"
                    style={{ width: `${splitPosition}%` }}
                  >
                    <img
                      src={originalDataUrl}
                      alt="Original"
                      draggable={false}
                      style={{
                        maxWidth: "85vw",
                        maxHeight: "80vh",
                        display: "block",
                        position: "absolute",
                        top: 0,
                        left: 0,
                      }}
                    />
                  </div>
                  {/* Splitter */}
                  <div
                    className="absolute top-0 bottom-0 w-px"
                    style={{
                      left: `${splitPosition}%`,
                      background: "var(--accent)",
                      boxShadow: "0 0 6px var(--accent)",
                      cursor: "ew-resize",
                    }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setIsSplitDragging(true);
                    }}
                  >
                    <div
                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-8 rounded flex items-center justify-center"
                      style={{
                        background: "var(--accent)",
                        boxShadow: "0 0 8px var(--accent)",
                      }}
                    >
                      <Crosshair size={10} style={{ color: "#000" }} />
                    </div>
                  </div>
                  {/* Labels */}
                  <div
                    className="absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded"
                    style={{
                      background: "rgba(0,0,0,0.7)",
                      color: "var(--text-secondary)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    BEFORE
                  </div>
                  <div
                    className="absolute top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded"
                    style={{
                      background: "rgba(0,0,0,0.7)",
                      color: "var(--accent)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    AFTER
                  </div>
                </div>
              ) : (
                <div className="relative">
                  {/* WebGL Preview Canvas */}
                  <canvas
                    ref={webglCanvasRef}
                    style={{
                      maxWidth: "85vw",
                      maxHeight: "80vh",
                      display: "block",
                    }}
                  />
                  {/* Hidden img for SAM3 coord reference and fallback */}
                  <img
                    ref={previewImgRef}
                    src={previewDataUrl}
                    alt="Preview"
                    draggable={false}
                    style={{ display: "none" }}
                  />

                  {/* Mask overlay — hover mask takes precedence */}
                  {(activeMask || sam3HoverMask) && maskVisible && (
                    <img
                      src={sam3HoverMask || activeMask || undefined}
                      alt="Mask"
                      draggable={false}
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        maxWidth: "85vw",
                        maxHeight: "80vh",
                        opacity: sam3HoverMask ? 0.55 : sam3OverlayOpacity,
                        mixBlendMode: "screen",
                        filter: sam3HoverMask
                          ? "none"
                          : `drop-shadow(0 0 8px ${sam3OverlayColor})`,
                      }}
                    />
                  )}

                  {/* SAM3 interaction canvas overlay */}
                  {isSam3Interactive && mediaInfo && (
                    <canvas
                      ref={sam3CanvasRef}
                      className="absolute inset-0"
                      style={{
                        width: "100%",
                        height: "100%",
                        pointerEvents: "auto",
                        zIndex: 10,
                      }}
                      onClick={handleCanvasClick}
                      onContextMenu={handleCanvasContextMenu}
                      onMouseDown={handleCanvasMouseDown}
                      onMouseMove={handleCanvasMouseMove}
                      onMouseUp={handleCanvasMouseUp}
                      onMouseLeave={handleCanvasMouseLeave}
                    />
                  )}

                  {/* Scopes overlay */}
                  {mediaInfo && (
                    <ScopesOverlay
                      width={Math.min(mediaInfo.width, 256)}
                      height={Math.min(mediaInfo.height, 128)}
                    />
                  )}

                  {/* Playback overlay */}
                  {mediaInfo && <PlaybackOverlay />}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Info */}
      {mediaInfo && (
        <div
          className="flex items-center justify-between px-3 h-7 flex-shrink-0 text-[11px]"
          style={{
            borderTop: "1px solid var(--border-primary)",
            color: "var(--text-muted)",
            fontFamily: "var(--font-mono)",
          }}
        >
          <div className="flex items-center gap-3">
            <span>
              {mediaInfo.width}
              <span style={{ color: "var(--text-dim)" }}>x</span>
              {mediaInfo.height}
            </span>
            <span style={{ color: "var(--text-dim)" }}>|</span>
            <span>{Math.round(zoom * 100)}%</span>
          </div>
          <button
            onClick={toggleFullscreen}
            className="flex items-center gap-1"
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}
            title="Toggle fullscreen (F11)"
          >
            <Maximize2 size={11} />
            <span>Fullscreen</span>
          </button>
        </div>
      )}
    </div>
  );
}
