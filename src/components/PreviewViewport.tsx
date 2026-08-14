import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  convertFileSrc,
  generateProxy,
  getFrameData,
  getMediaInfo,
  loadMediaFile,
  loadMediaFromBase64,
  sam3BoxPrompt,
  sam3PointPrompt,
  applyEffectStack,
} from "../lib/tauri";
import { useAppStore } from "../store";
import { logger } from "../utils/logger";
import { WebGLContext, MediaUploader, EffectChain } from "../engine/webgl2";
import { stackToRenderPasses, buildShaderMap, stackToRustPayload, stackHasApproximatePreview } from "../utils/effectConverter";
import ManualMaskOverlay from "./ManualMaskOverlay";
import ScopesOverlay from "./ScopesOverlay";
import PlaybackOverlay from "./PlaybackOverlay";
import ViewportGuides from "./ViewportGuides";
import AudioVisualizer from "./common/AudioVisualizer";

interface Props {
  readonly isDropTarget?: boolean;
}

/** Isolated audio waveform overlay so it re-renders on audio data without
 *  forcing the entire preview viewport to re-render. */
function AudioWaveform() {
  const audioBandEnergies = useAppStore((s) => s.audioBandEnergies);
  if (Object.keys(audioBandEnergies).length === 0) return null;
  return (
    <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-1/2 h-20 neo-panel rounded-lg bg-surface/80 backdrop-blur-md p-3 flex flex-col justify-end z-50 border border-accent-teal/20 pointer-events-none">
      <div className="text-data-micro font-data-micro text-accent-teal/70 absolute top-2 left-2 uppercase">Audio/Pixel Intensity</div>
      <AudioVisualizer className="h-full pt-4" />
    </div>
  );
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

async function prepareSourceTexture(
  uploader: MediaUploader,
  isVideo: boolean,
  proxyUrl: string | null,
  video: HTMLVideoElement | null,
  originalDataUrl: string,
  currentTex: WebGLTexture | null
): Promise<WebGLTexture | null> {
  if (isVideo && proxyUrl && video && video.readyState >= 2) {
    if (!currentTex) {
      return uploader.createTextureFromImage(video);
    }
    uploader.updateVideoTexture(currentTex, video);
    return currentTex;
  }
  if (!currentTex) {
    return await uploader.uploadImage(originalDataUrl);
  }
  return currentTex;
}

function PreviewViewport({ isDropTarget = false }: Props) {
  // Group read-only state into shallow-equal slices so reference-stable objects
  // (arrays/objects) don't force re-renders when their contents are unchanged.
  const {
    mediaLoaded,
    previewDataUrl,
    originalDataUrl,
    mediaInfo,
    showBeforeAfter,
    zoom,
    isPlaying,
    useCpuPreview,
    audioEnabled,
    proxyUrl,
    isVideo,
    filePath: fileName,
    viewportGuides,
  } = useAppStore(
    useShallow((s) => ({
      mediaLoaded: s.mediaLoaded,
      previewDataUrl: s.previewDataUrl,
      originalDataUrl: s.originalDataUrl,
      mediaInfo: s.mediaInfo,
      showBeforeAfter: s.showBeforeAfter,
      zoom: s.zoom,
      isPlaying: s.isPlaying,
      useCpuPreview: s.useCpuPreview,
      audioEnabled: s.audioEnabled,
      proxyUrl: s.proxyUrl,
      isVideo: s.isVideo,
      filePath: s.filePath,
      viewportGuides: s.viewportGuides,
    }))
  );

  const {
    activeMask,
    maskVisible,
    sam3Ready,
    sam3ImageLoaded,
    sam3Mode,
    sam3Points,
    maskTab,
    sam3HoverMask,
    sam3FrameMasks,
    sam3OverlayOpacity,
    sam3OverlayColor,
  } = useAppStore(
    useShallow((s) => ({
      activeMask: s.activeMask,
      maskVisible: s.maskVisible,
      sam3Ready: s.sam3Ready,
      sam3ImageLoaded: s.sam3ImageLoaded,
      sam3Mode: s.sam3Mode,
      sam3Points: s.sam3Points,
      maskTab: s.maskTab,
      sam3HoverMask: s.sam3HoverMask,
      sam3FrameMasks: s.sam3FrameMasks,
      sam3OverlayOpacity: s.sam3OverlayOpacity,
      sam3OverlayColor: s.sam3OverlayColor,
    }))
  );

  const { effectStack, maskRevision } = useAppStore(
    useShallow((s) => ({ effectStack: s.effectStack, maskRevision: s.maskRevision }))
  );

  // Heavy signature computation is memoised against the (immutable) effect stack.
  const cpuRenderSignature = useMemo(
    () =>
      effectStack
        .map((e) => `${e.id}:${e.enabled}:${JSON.stringify(e.params)}:${e.maskId}:${e.maskMode}`)
        .join("|") + `|${maskRevision}`,
    [effectStack, maskRevision]
  );
  const stackCount = effectStack.length;
  const isApproximatePreview = useMemo(
    () => stackHasApproximatePreview(effectStack),
    [effectStack]
  );

  // Actions are stable references in the Zustand store, but selecting them as a
  // single object with shallow equality reduces subscription hook overhead.
  const {
    setMediaLoaded,
    setMediaInfo,
    setPreviewDataUrl,
    setOriginalDataUrl,
    setStatusMessage,
    setUseCpuPreview,
    setSam3Masks,
    addSam3Point,
    clearSam3Points,
    setSam3HoverMask,
    setSam3Clicking,
    setFilePath,
    setProxyUrl,
    setIsVideo,
  } = useAppStore(
    useShallow((s) => ({
      setMediaLoaded: s.setMediaLoaded,
      setMediaInfo: s.setMediaInfo,
      setPreviewDataUrl: s.setPreviewDataUrl,
      setOriginalDataUrl: s.setOriginalDataUrl,
      setStatusMessage: s.setStatusMessage,
      setUseCpuPreview: s.setUseCpuPreview,
      setSam3Masks: s.setSam3Masks,
      addSam3Point: s.addSam3Point,
      clearSam3Points: s.clearSam3Points,
      setSam3HoverMask: s.setSam3HoverMask,
      setSam3Clicking: s.setSam3Clicking,
      setFilePath: s.setFilePath,
      setProxyUrl: s.setProxyUrl,
      setIsVideo: s.setIsVideo,
    }))
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const previewImgRef = useRef<HTMLImageElement>(null);
  const webglCanvasRef = useRef<HTMLCanvasElement>(null);
  const glCtxRef = useRef<WebGLContext | null>(null);
  const uploaderRef = useRef<MediaUploader | null>(null);
  const chainRef = useRef<EffectChain | null>(null);
  const sourceTexRef = useRef<WebGLTexture | null>(null);
  const retiredSourceTexturesRef = useRef<WebGLTexture[]>([]);
  const activeWebglRendersRef = useRef(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const maskImgRef = useRef<HTMLImageElement | null>(null);
  const panWrapperRef = useRef<HTMLDivElement>(null);
  const zoomWrapperRef = useRef<HTMLDivElement>(null);
  const beforeClipRef = useRef<HTMLDivElement>(null);
  const splitterRef = useRef<HTMLButtonElement>(null);
  const rafRef = useRef<number>(0);
  const cpuAnimRafRef = useRef<number>(0);
  const cpuRenderRevisionRef = useRef(0);
  const lastFrameTimeRef = useRef<number>(0);
  const sam3CanvasRef = useRef<HTMLCanvasElement>(null);
  const hoverTimeoutRef = useRef<number | null>(null);
  const hoverRequestRevisionRef = useRef(0);
  const isProcessingRef = useRef(false);
  const deleteRetiredSourceTextures = useCallback(() => {
    if (activeWebglRendersRef.current !== 0) return;
    const uploader = uploaderRef.current;
    if (!uploader) return;
    for (const texture of retiredSourceTexturesRef.current) {
      uploader.deleteTexture(texture);
    }
    retiredSourceTexturesRef.current = [];
  }, []);
  const retireSourceTexture = useCallback(() => {
    const sourceTexture = sourceTexRef.current;
    if (sourceTexture) {
      retiredSourceTexturesRef.current.push(sourceTexture);
      sourceTexRef.current = null;
    }
    deleteRetiredSourceTextures();
  }, [deleteRetiredSourceTextures]);

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

  // Imperative style updates (avoids inline style={{}} lint warnings)
  useEffect(() => {
    if (panWrapperRef.current) {
      panWrapperRef.current.style.transform = `translate(${pan.x}px, ${pan.y}px)`;
    }
  }, [pan]);

  useEffect(() => {
    if (zoomWrapperRef.current) {
      zoomWrapperRef.current.style.transform = `scale(${zoom})`;
      zoomWrapperRef.current.style.transition = isPanDragging ? "none" : "transform 0.15s ease";
    }
  }, [zoom, isPanDragging]);

  useEffect(() => {
    if (beforeClipRef.current) {
      beforeClipRef.current.style.clipPath = showBeforeAfter
        ? `inset(0 0 0 ${splitPosition}%)`
        : "none";
    }
    if (splitterRef.current) {
      splitterRef.current.style.left = `${splitPosition}%`;
    }
  }, [splitPosition, showBeforeAfter]);

  useEffect(() => {
    if (maskImgRef.current) {
      maskImgRef.current.style.opacity = sam3HoverMask ? "0.55" : String(sam3OverlayOpacity);
      maskImgRef.current.style.filter = sam3HoverMask ? "none" : `drop-shadow(0 0 8px ${sam3OverlayColor})`;
    }
  }, [sam3HoverMask, sam3OverlayOpacity, sam3OverlayColor]);

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
    const path = useAppStore.getState().filePath;
    const isVideoFile =
      path && /\.(mp4|avi|mov|mkv|webm|m4v|flv|wmv|mpeg|mpg)$/i.test(path);
    setMediaLoaded(true);
    setMediaInfo({ width: info.width, height: info.height });
    setIsVideo(!!isVideoFile);
    const frame = await getFrameData();
    setPreviewDataUrl(frame);
    setOriginalDataUrl(frame);
    if (isVideoFile && path) {
      try {
        const proxy = await generateProxy(path, 1280, 28);
        setProxyUrl(convertFileSrc(proxy));
      } catch (err) {
        console.warn("[Preview] Proxy generation failed:", err);
        setProxyUrl(null);
      }
    } else {
      setProxyUrl(null);
    }
    return true;
  }, [
    setMediaLoaded,
    setMediaInfo,
    setPreviewDataUrl,
    setOriginalDataUrl,
    setIsVideo,
    setProxyUrl,
  ]);

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
            reader.onerror = () => reject(reader.error ?? new Error("Failed to read dropped file"));
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

  /** True when the SAM3 canvas overlay should capture pointer events.
   *  Also requires sam3ImageLoaded so a failed (or not-yet-completed) image
   *  load can't leave the UI dispatching point/box prompts against a
   *  session that never actually has the current frame loaded. */
  const isSam3Interactive =
    sam3Ready && sam3ImageLoaded && !showBeforeAfter && maskTab === "sam3" && (sam3Mode === "point" || sam3Mode === "box");
  /** True when the manual mask overlay should capture pointer events. */
  const isManualMaskActive = maskTab === "manual" && mediaLoaded && !showBeforeAfter;

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
      const requestRevision = ++hoverRequestRevisionRef.current;
      hoverTimeoutRef.current = window.setTimeout(async () => {
        const { x, y } = screenToImageCoords(clientX, clientY, canvas, mediaInfo.width, mediaInfo.height);
        const allPoints = [...sam3Points, { x, y, label: 1 as const }];
        try {
          const coords = allPoints.map((p) => [p.x, p.y] as [number, number]);
          const labels = allPoints.map((p) => p.label);
          const result = await sam3PointPrompt(coords, labels);
          if (requestRevision === hoverRequestRevisionRef.current && result.count > 0) {
            setSam3HoverMask(result.masks[0]);
          }
        } catch {
          if (requestRevision === hoverRequestRevisionRef.current) {
            setSam3HoverMask(null);
          }
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
    hoverRequestRevisionRef.current += 1;
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
      // Marks a box-drag interaction as in-progress so useSam3IdleShutdown's
      // idle timer resets — without this, a long box-drag (or the request it
      // fires) could be killed mid-flight by the 5-minute idle shutdown.
      setSam3Clicking(true);
    },
    [sam3Mode, mediaInfo, setSam3Clicking]
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
      setSam3Clicking(false);

      if (x2 - x1 < 2 || y2 - y1 < 2) return; // ignore tiny accidental clicks
      runBox(x1, y1, x2, y2);
    },
    [sam3Mode, isBoxDragging, boxStart, boxCurrent, mediaInfo, runBox, setSam3Clicking]
  );

  const handleCanvasMouseLeave = useCallback(() => {
    cancelHover();
    if (isBoxDragging) {
      setIsBoxDragging(false);
      setBoxStart(null);
      setBoxCurrent(null);
      // Abandoning a drag by leaving the canvas fires mouseleave, not mouseup,
      // so without this sam3Clicking would stay true forever -- it's only
      // ever cleared by handleCanvasMouseUp. A stuck-true value keeps
      // resetting the SAM3 idle-shutdown timer indefinitely (it's in that
      // effect's dependency array), so the Python subprocess and model never
      // get torn down even when genuinely idle.
      setSam3Clicking(false);
    }
  }, [cancelHover, isBoxDragging, setSam3Clicking]);

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
      const ctx = new WebGLContext(webglCanvasRef.current, {
        onContextLost: () => {
          console.error("[Preview] WebGL context lost");
          setStatusMessage(
            "WebGL context lost — switched to CPU preview fallback"
          );
          setUseCpuPreview(true);
        },
        onContextRestored: () => {
          logger.log("Preview", "WebGL context restored");
          setStatusMessage("WebGL context restored — reinitializing preview");
          retireSourceTexture();
          chainRef.current?.reset();
          setUseCpuPreview(false);
        },
      });
      glCtxRef.current = ctx;
      uploaderRef.current = new MediaUploader(ctx);
      chainRef.current = new EffectChain(ctx, 1024, 1024);
      logger.log("Preview", "WebGL2 context initialized OK");
    } catch (e) {
      logger.error("Preview", "WebGL2 not available", { err: e });
      setStatusMessage(
        `WebGL2 unavailable: ${e instanceof Error ? e.message : String(e)}`
      );
      setUseCpuPreview(true);
    }
    return () => {
      retireSourceTexture();
      chainRef.current?.destroy();
      deleteRetiredSourceTextures();
      glCtxRef.current?.destroy();
      glCtxRef.current = null;
      uploaderRef.current = null;
      chainRef.current = null;
    };
  }, [
    deleteRetiredSourceTextures,
    retireSourceTexture,
    setStatusMessage,
    setUseCpuPreview,
  ]);

  // Invalidate texture when original image changes
  useEffect(() => {
    retireSourceTexture();
  }, [originalDataUrl, retireSourceTexture]);

  // Load proxy video when a video source is detected
  useEffect(() => {
    if (!isVideo || !proxyUrl) return;
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.src = proxyUrl;
    video.oncanplay = () => {
      video.play().catch(() => {});
    };
    videoRef.current = video;
    retireSourceTexture();
    return () => {
      video.pause();
      video.src = "";
      video.oncanplay = null;
      videoRef.current = null;
      retireSourceTexture();
    };
  }, [isVideo, proxyUrl, retireSourceTexture]);

  // Sync video play/pause
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isVideo) return;
    if (isPlaying) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [isPlaying, isVideo]);

  // Sync video time when timeline is scrubbed (without re-rendering the whole viewport)
  useEffect(() => {
    return useAppStore.subscribe((state, prevState) => {
      if (state.currentTime === prevState.currentTime) return;

      // Sync video element
      if (isVideo && !isPlaying) {
        const video = videoRef.current;
        if (video) {
          const start = state.inPoint ?? 0;
          const target = Math.max(0, state.currentTime - start);
          if (Number.isFinite(target) && Math.abs(video.currentTime - target) > 0.05) {
            video.currentTime = target;
          }
        }
      }

      // Sync mask image
      const maskImg = maskImgRef.current;
      if (maskImg && !state.sam3HoverMask) {
        const currentFrameIndex = Math.floor(state.currentTime * 10);
        const frameMask = state.sam3FrameMasks[currentFrameIndex];
        const src = frameMask || state.activeMask || "";
        if (maskImg.getAttribute("src") !== src) {
          maskImg.src = src;
        }
      }
    });
  }, [isVideo, isPlaying]);

  // WebGL real-time preview: re-render when image or effect stack changes.
  // Skipped when useCpuPreview is true (effects without accurate WebGL shaders
  // are rendered via the Rust CPU backend instead).
  useEffect(() => {
    if (useCpuPreview) return;
    // Always use the original (unprocessed) image as the WebGL source texture
    if (!originalDataUrl || !glCtxRef.current || !uploaderRef.current) return;
    const uploader = uploaderRef.current;
    const chain = chainRef.current;
    if (!chain) return;

    let isRendering = false;
    const render = async () => {
      if (isRendering) return;
      isRendering = true;
      activeWebglRendersRef.current += 1;
      try {
        // Resize chain to match media dimensions
        if (mediaInfo) {
          chain.resize(mediaInfo.width, mediaInfo.height);
          const canvas = webglCanvasRef.current;
          const gl = glCtxRef.current?.getGL();
          if (canvas && (canvas.width !== mediaInfo.width || canvas.height !== mediaInfo.height)) {
            canvas.width = mediaInfo.width;
            canvas.height = mediaInfo.height;
            gl?.viewport(0, 0, canvas.width, canvas.height);
          }
        }

        // Upload source texture: video frame for video sources, image for stills
        const tex = await prepareSourceTexture(
          uploader,
          isVideo,
          proxyUrl,
          videoRef.current,
          originalDataUrl,
          sourceTexRef.current
        );
        sourceTexRef.current = tex;
        if (!tex) return;

        // Build render passes from active effect stack (read from store for live params)
        const s = useAppStore.getState();
        const passes = stackToRenderPasses(s.effectStack, s.currentTime, s.activeMask, s.sam3Masks);

        // Inject global audio uniforms into every pass (read from store for live values)
        const audioUniforms: Record<string, number> = {
          u_bass: s.audioBandEnergies.bass ?? 0,
          u_band0: s.audioBandEnergies.subBass ?? 0,
          u_band1: s.audioBandEnergies.bass ?? 0,
          u_band2: s.audioBandEnergies.lowMid ?? 0,
          u_band3: s.audioBandEnergies.mid ?? 0,
          u_band4: s.audioBandEnergies.highMid ?? 0,
          u_band5: s.audioBandEnergies.presence ?? 0,
          u_band6: s.audioBandEnergies.brilliance ?? 0,
          u_centroid: s.audioMappedValues.centroid ?? 0,
          u_rms: s.audioMappedValues.rms ?? 0,
          u_energy: s.audioMappedValues.energy ?? 0,
          u_flux: s.audioMappedValues.flux ?? 0,
          u_beatBass: s.audioBeatFlags.bass ? 1 : 0,
          u_beatMid: s.audioBeatFlags.mid ? 1 : 0,
          u_beatTreble: s.audioBeatFlags.treble ? 1 : 0,
        };
        // Inject time uniforms so shaders can animate over time
        // When playing, use the timeline currentTime for keyframe sync.
        // When not playing, use performance.now() so time-based effects still animate.
        const animTime = s.isPlaying
          ? s.currentTime
          : performance.now() / 1000;
        const timeUniforms: Record<string, number> = {
          u_time: animTime,
          u_frame: Math.floor(animTime * 30),
        };
        for (const pass of passes) {
          Object.assign(pass.uniforms, audioUniforms, timeUniforms);
        }

        const shaderMap = buildShaderMap(passes);

        // Render to WebGL canvas
        await chain.render(tex, passes, shaderMap);

        // Check for WebGL errors
        const gl = glCtxRef.current?.getGL();
        if (gl) {
          // Unbind all textures to prevent feedback loops on next render
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, null);
          gl.activeTexture(gl.TEXTURE2);
          gl.bindTexture(gl.TEXTURE_2D, null);
          gl.activeTexture(gl.TEXTURE3);
          gl.bindTexture(gl.TEXTURE_2D, null);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindFramebuffer(gl.FRAMEBUFFER, null);
          const err = gl.getError();
          if (err !== gl.NO_ERROR) {
            console.error('[Preview] WebGL error after render:', err);
          }
        }
      } catch (e) {
        console.error('WebGL render failed:', e);
      } finally {
        isRendering = false;
        activeWebglRendersRef.current -= 1;
        deleteRetiredSourceTextures();
      }
    };

    render();

    // Continuous render loop — only needed when something in the active stack
    // actually reads u_time/u_frame (motion, flicker, scrolling noise) and so
    // produces different output frame to frame on its own. Most effects
    // (dithering, color, pixel geometry) are static: identical output every
    // frame for an unchanging image, so looping forever bought nothing but a
    // perpetual 60fps GPU render call -- real, measurable cost for zero
    // visual benefit. The shader set only changes when cpuRenderSignature
    // changes (this effect's own dependency), so it's safe to snapshot once
    // here rather than recompute per frame inside the loop below.
    const snapshotState = useAppStore.getState();
    const snapshotPasses = stackToRenderPasses(
      snapshotState.effectStack,
      snapshotState.currentTime,
      snapshotState.activeMask,
      snapshotState.sam3Masks
    );
    const hasAnimatedEffect = [...buildShaderMap(snapshotPasses).values()].some(
      (shader) => shader.animated
    );
    if (hasAnimatedEffect || audioEnabled || isPlaying) {
      const loop = () => {
        // Advance currentTime for image sources when playing so the time slider
        // moves and keyframe-driven effects sync with export. Videos drive time
        // via the <video> element instead.
        const s = useAppStore.getState();
        if (s.isPlaying && !isVideo) {
          const now = performance.now();
          const last = lastFrameTimeRef.current || now;
          const deltaT = (now - last) / 1000 * s.playbackSpeed;
          lastFrameTimeRef.current = now;
          let next = s.currentTime + deltaT;
          const dur = s.duration || 10;
          if (next > dur) next = 0; // loop
          s.setCurrentTime(next);
        } else {
          lastFrameTimeRef.current = performance.now();
        }
        render();
        rafRef.current = requestAnimationFrame(loop);
      };
      lastFrameTimeRef.current = performance.now();
      rafRef.current = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [
    originalDataUrl,
    cpuRenderSignature,
    mediaInfo,
    audioEnabled,
    isPlaying,
    isVideo,
    proxyUrl,
    useCpuPreview,
    deleteRetiredSourceTextures,
  ]);

  // CPU preview playback loop — advances currentTime when playing and useCpuPreview
  // is true, so the CPU preview re-renders each frame during playback.
  useEffect(() => {
    if (!useCpuPreview || !mediaLoaded || !isPlaying) return;
    let raf: number;
    const loop = () => {
      const s = useAppStore.getState();
      if (s.isPlaying && !isVideo) {
        const now = performance.now();
        const last = lastFrameTimeRef.current || now;
        const deltaT = ((now - last) / 1000) * s.playbackSpeed;
        lastFrameTimeRef.current = now;
        let next = s.currentTime + deltaT;
        const dur = s.duration || 10;
        if (next > dur) next = 0;
        s.setCurrentTime(next);
      } else {
        lastFrameTimeRef.current = performance.now();
      }
      raf = requestAnimationFrame(loop);
    };
    lastFrameTimeRef.current = performance.now();
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [useCpuPreview, mediaLoaded, isPlaying, isVideo]);

  // CPU preview render: when useCpuPreview is true, render via Rust backend for
  // accurate algorithm output (error diffusion, blue noise, etc.).
  // Only re-renders when the effect stack signature changes (params, mask, order).
  // When playing, a throttled animation loop runs for time-based effects.
  useEffect(() => {
    if (!useCpuPreview || !mediaLoaded) return;
    const state = useAppStore.getState();
    if (state.effectStack.length === 0) {
      if (state.originalDataUrl && state.previewDataUrl !== state.originalDataUrl) {
        state.setPreviewDataUrl(state.originalDataUrl);
      }
      return;
    }

    let cancelled = false;
    let inFlight = false;
    let pendingRenderScale: number | null = null;
    let debounceTimer: number | null = null;

    const doRender = async (scale: number) => {
      if (inFlight) {
        pendingRenderScale = scale;
        return;
      }
      inFlight = true;
      const renderRevision = ++cpuRenderRevisionRef.current;
      try {
        const s = useAppStore.getState();
        const animTime = s.isPlaying ? s.currentTime : 0;
        const currentFrameIndex = Math.floor(animTime * 10);
        const activeMaskForFrame = s.sam3FrameMasks[currentFrameIndex] || s.activeMask;
        const activeStack = stackToRustPayload(s.effectStack, activeMaskForFrame, s.sam3Masks, animTime);
        const result = await applyEffectStack(activeStack, null, scale);
        if (!cancelled && renderRevision === cpuRenderRevisionRef.current) state.setPreviewDataUrl(result);
      } catch (e) {
        console.error('CPU preview render failed:', e);
        if (!cancelled) {
          state.setStatusMessage(`Preview render failed: ${e}`);
        }
      } finally {
        inFlight = false;
        if (pendingRenderScale !== null && !cancelled) {
          const nextScale = pendingRenderScale;
          pendingRenderScale = null;
          doRender(nextScale);
        }
      }
    };

    // Immediately render at low-medium resolution on any parameter change (slider drag)
    doRender(0.35);

    // Debounce to high resolution after 400ms of inactivity
    debounceTimer = window.setTimeout(() => {
      if (!cancelled && !useAppStore.getState().isPlaying) {
        doRender(1.0);
      }
    }, 400);

    // Animation loop only when playing (for time-based effects)
    if (isPlaying) {
      let lastRenderTime = 0;
      const MIN_RENDER_INTERVAL = 33; // ~30fps when playing

      const renderCpu = async () => {
        if (cancelled) return;
        const now = performance.now();
        if (now - lastRenderTime < MIN_RENDER_INTERVAL) {
          cpuAnimRafRef.current = requestAnimationFrame(renderCpu);
          return;
        }
        lastRenderTime = now;
        const renderRevision = ++cpuRenderRevisionRef.current;
        try {
          const s = useAppStore.getState();
          const animTime = s.currentTime;
          const currentFrameIndex = Math.floor(animTime * 10);
          const activeMaskForFrame = s.sam3FrameMasks[currentFrameIndex] || s.activeMask;
          const activeStack = stackToRustPayload(s.effectStack, activeMaskForFrame, s.sam3Masks, animTime);
          const result = await applyEffectStack(activeStack, null, 0.5); // Playing uses 0.5 for performance
          if (!cancelled && renderRevision === cpuRenderRevisionRef.current) s.setPreviewDataUrl(result);
        } catch (e) {
          console.error('CPU preview render failed:', e);
          if (!cancelled) {
            useAppStore.getState().setStatusMessage(`Preview render failed: ${e}`);
          }
        }
        if (!cancelled) cpuAnimRafRef.current = requestAnimationFrame(renderCpu);
      };
      lastRenderTime = 0;
      cpuAnimRafRef.current = requestAnimationFrame(renderCpu);
    }

    return () => {
      cancelled = true;
      if (debounceTimer) window.clearTimeout(debounceTimer);
      cancelAnimationFrame(cpuAnimRafRef.current);
    };
  }, [useCpuPreview, mediaLoaded, cpuRenderSignature, isPlaying]);

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

  let statusDotBg = "solar-bg animate-pulse-glow";
  let statusText = "LIVE PREVIEW";
  if (useCpuPreview) {
    statusDotBg = "bg-accent-teal";
    statusText = "EXACT OUTPUT (CPU)";
  } else if (isApproximatePreview) {
    statusDotBg = "bg-amber-400";
    statusText = "APPROXIMATE (CLICK FOR EXACT)";
  } else if (stackCount > 0) {
    statusDotBg = "bg-accent-pink animate-pulse-glow";
    statusText = "ANIMATING";
  }

  let canvasCursor = "cursor-default";
  if (isPanDragging) {
    canvasCursor = "cursor-grabbing";
  } else if ((isSam3Interactive && (sam3Mode === "point" || sam3Mode === "box")) || isManualMaskActive) {
    canvasCursor = "cursor-crosshair";
  }

  return (
    <div
      data-testid="preview-viewport"
      className="flex-1 h-full flex flex-col min-h-0 pixel-grid bg-transparent"
    >
      {/* Viewport Header Bar */}
      {mediaLoaded && (
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b border-outline-variant/30 bg-surface-main/80 backdrop-blur-md filigree-header">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                const s = useAppStore.getState();
                s.setUseCpuPreview(!s.useCpuPreview);
              }}
              className="text-label-sm font-label-sm text-on-surface-variant flex items-center gap-2 neo-flat px-3 py-1 rounded-full cursor-pointer hover:border-accent-teal/40 transition-colors"
              title={useCpuPreview ? "Click to switch to fast WebGL GPU preview" : "Click to switch to 100% exact Rust CPU preview (exact saved output)"}
            >
              <span className={`w-2 h-2 rounded-full ${statusDotBg}`} />
              {statusText}
            </button>
            {fileName && (
              <span className="text-label-sm font-label-sm text-accent-teal/90 cursor-default hover:text-accent-teal transition-colors bg-surface/60 px-2 rounded">
                {fileName.split(/[\\/]/).pop()?.toUpperCase() || "CLIP"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {/* Composition guides. Preview-only: these never enter the export
                stack, which is the whole reason they are not effects. */}
            <div className="flex items-center gap-1" role="group" aria-label="Composition guides">
              {(
                [
                  { key: "safeArea", icon: "crop_free", label: "Safe area guides" },
                  { key: "ruleOfThirds", icon: "grid_3x3", label: "Rule of thirds" },
                  { key: "crosshairs", icon: "add", label: "Centre crosshairs" },
                  { key: "pixelGrid", icon: "grid_4x4", label: "Pixel grid" },
                ] as const
              ).map(({ key, icon, label }) => (
                <button
                  key={key}
                  type="button"
                  aria-label={label}
                  aria-pressed={viewportGuides[key]}
                  title={`${label} (preview only — not exported)`}
                  onClick={() => useAppStore.getState().toggleViewportGuide(key)}
                  className={`material-symbols-outlined text-sm neo-btn p-1.5 rounded-full transition-colors ${
                    viewportGuides[key]
                      ? "text-accent-teal"
                      : "text-on-surface-variant hover:text-primary"
                  }`}
                >
                  {icon}
                </button>
              ))}
            </div>
            {mediaInfo && (
              <span className="text-code-sm font-code-sm text-accent-teal neo-flat px-3 py-1 rounded-full cursor-default hover:border-accent-teal/30 transition-colors">
                {mediaInfo.width} x {mediaInfo.height}
              </span>
            )}
            <button
              className="material-symbols-outlined text-sm text-on-surface-variant neo-btn p-1.5 rounded-full hover:text-primary transition-colors"
              title="Aspect ratio"
              onClick={() => useAppStore.getState().setZoom(1)}
            >
              aspect_ratio
            </button>
            <button
              className="material-symbols-outlined text-sm text-on-surface-variant neo-btn p-1.5 rounded-full hover:text-primary transition-colors"
              title="More options"
              onClick={toggleFullscreen}
            >
              more_vert
            </button>
          </div>
        </div>
      )}

      {/* Canvas Area */}
      <section
        ref={containerRef}
        aria-label="Media preview viewport"
        className={`flex-1 relative overflow-hidden ${!mediaLoaded ? "checkerboard" : "bg-black/95"} ${isFullscreen ? "bg-black" : ""} group/main ${canvasCursor}`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDoubleClick={() => useAppStore.getState().setZoom(1)}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Live Audio Waveform */}
        {mediaLoaded && audioEnabled && <AudioWaveform />}

        {!mediaLoaded && (
          <button
            onClick={handleClickOpen}
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 w-full h-full z-10 dropzone-btn"
          >
            <span className="material-symbols-outlined dropzone-icon">image</span>
            <div className="dropzone-text">
              Drop an image or video here to begin
            </div>
            <div className="dropzone-subtext">
              — or click to browse —
            </div>
            <div
              className="text-[11px] px-3 py-1.5 rounded-md dropzone-formats"
            >
              PNG, JPG, GIF, WEBP, TIFF, BMP, MP4, MOV, MKV, AVI, WEBM
            </div>
          </button>
        )}

        {/* WebGL canvas — always rendered so the ref is available on mount */}
        <div
          ref={panWrapperRef}
          className={`absolute inset-0 flex items-center justify-center ${isPanDragging ? "cursor-grabbing" : "cursor-grab"} ${mediaLoaded && previewDataUrl ? "visible" : "invisible"}`}
        >
          <div
            ref={zoomWrapperRef}
            className="relative zoom-wrapper"
          >
            <div className="relative">
              {/* Original image acts as the BEFORE background layer when split mode is active */}
              {showBeforeAfter && originalDataUrl && (
                <img
                  src={originalDataUrl}
                  alt="Original"
                  draggable={false}
                  className="preview-img"
                />
              )}
              {/* The preview surface (CPU image or WebGL canvas) — stays mounted across split mode toggles */}
              <div
                ref={beforeClipRef}
                className={showBeforeAfter && originalDataUrl ? "absolute top-0 left-0 w-full h-full" : "relative"}
              >
                {useCpuPreview ? (
                  /* CPU-processed preview image (accurate algorithms via Rust backend) */
                  <img
                    ref={previewImgRef}
                    src={previewDataUrl || ""}
                    alt="Preview"
                    draggable={false}
                    className="preview-img"
                  />
                ) : (
                  /* WebGL Preview Canvas */
                  <canvas
                    ref={webglCanvasRef}
                    className="preview-canvas"
                  />
                )}
              </div>
              {/* Hidden img for SAM3 coord reference and fallback */}
              {!useCpuPreview && (
                <img
                  ref={previewImgRef}
                  src={previewDataUrl || ""}
                  alt="Preview"
                  draggable={false}
                  className="preview-hidden"
                />
              )}
              {/* Splitter handle and labels */}
              {showBeforeAfter && originalDataUrl && (
                <>
                  <button
                    ref={splitterRef}
                    type="button"
                    aria-label="Before and after view splitter"
                    className="absolute top-0 bottom-0 w-px splitter-handle cursor-col-resize"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setIsSplitDragging(true);
                    }}
                  >
                    <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-8 rounded flex items-center justify-center splitter-knob">
                      <span className="material-symbols-outlined mi-sm text-black">center_focus_strong</span>
                    </div>
                  </button>
                  <div className="absolute top-2 left-2 font-label-sm text-label-sm px-2 py-0.5 rounded split-label">
                    BEFORE
                  </div>
                  <div className="absolute top-2 right-2 font-label-sm text-label-sm px-2 py-0.5 rounded split-label-after">
                    AFTER
                  </div>
                </>
              )}

                  {/* Mask overlay — hover mask takes precedence; hide when manual mask canvas is active.
                      Also hidden during Before/After split: it used to live in the branch that only
                      rendered when split mode was off, and merging that branch into this always-mounted
                      tree dropped the guard, so the colored mask painted over both halves of the
                      comparison it exists to let the user check. */}
                  {(Object.keys(sam3FrameMasks).length > 0 || activeMask || sam3HoverMask) && maskVisible && !isManualMaskActive && !showBeforeAfter && (
                    <img
                      ref={maskImgRef}
                      src={sam3HoverMask || sam3FrameMasks[Math.floor((useAppStore.getState().currentTime || 0) * 10)] || activeMask || undefined}
                      alt="Mask"
                      draggable={false}
                      className="absolute inset-0 pointer-events-none preview-img mask-overlay-img"
                    />
                  )}

                  {/* Composition guides — preview only, never reach the export pipeline.
                      Hidden during split view for the same reason as the mask overlay above. */}
                  {mediaInfo && !showBeforeAfter && (
                    <ViewportGuides width={mediaInfo.width} height={mediaInfo.height} />
                  )}

                  {/* SAM3 interaction canvas overlay */}
                  {isSam3Interactive && mediaInfo && (
                    <canvas
                      ref={sam3CanvasRef}
                      className="absolute inset-0 sam3-overlay-canvas"
                      onClick={handleCanvasClick}
                      onContextMenu={handleCanvasContextMenu}
                      onMouseDown={handleCanvasMouseDown}
                      onMouseMove={handleCanvasMouseMove}
                      onMouseUp={handleCanvasMouseUp}
                      onMouseLeave={handleCanvasMouseLeave}
                    />
                  )}

                  {/* Manual mask overlay — draws directly on the preview canvas */}
                  {isManualMaskActive && <ManualMaskOverlay />}

                  {/* Scopes overlay — hidden during split view; see the mask-overlay comment above. */}
                  {mediaInfo && !showBeforeAfter && (
                    <ScopesOverlay
                      width={Math.min(mediaInfo.width, 256)}
                      height={Math.min(mediaInfo.height, 128)}
                    />
                  )}

                  {/* Playback overlay — hidden during split view; see the mask-overlay comment above. */}
                  {mediaInfo && !showBeforeAfter && <PlaybackOverlay />}
                </div>
            </div>
          </div>

        {/* Drop target overlay */}
        {showDropOverlay && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-50 drop-overlay"
          >
            <span className="material-symbols-outlined drop-overlay-icon">file_upload</span>
            <div className="text-sm font-semibold drop-overlay-text">
              Drop file here to open
            </div>
          </div>
        )}
      </section>

      {/* Bottom Info */}
      {mediaInfo && (
        <div
          className="flex items-center justify-between px-3 h-7 flex-shrink-0 font-code-sm text-code-sm info-bar"
        >
          <div className="flex items-center gap-3">
            <span>
              {mediaInfo?.width ?? 0}
              <span className="info-bar-dim">x</span>
              {mediaInfo?.height ?? 0}
            </span>
            <span className="info-bar-dim">|</span>
            <span>{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => useAppStore.getState().setZoom(1)}
              className={`px-1 rounded ${zoom === 1 ? "info-bar-btn-active" : "info-bar-btn"}`}
              title="Pixel peep 1:1 (100%)"
            >
              1:1
            </button>
          </div>
          <button
            onClick={toggleFullscreen}
            className="flex items-center gap-1 info-bar-fullscreen"
            title="Toggle fullscreen (F11)"
          >
            <span className="material-symbols-outlined mi-md">fullscreen</span>
            <span>Fullscreen</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default memo(PreviewViewport);
