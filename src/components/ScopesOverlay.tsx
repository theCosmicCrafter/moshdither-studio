import { useEffect, useRef, useCallback } from "react";
import { useAppStore } from "../store";

interface Props {
  width: number;
  height: number;
}

function drawHistogram(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  imageData: ImageData
) {
  const bins = 256;
  const rHist = new Uint32Array(bins);
  const gHist = new Uint32Array(bins);
  const bHist = new Uint32Array(bins);
  const lHist = new Uint32Array(bins);

  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    rHist[data[i]]++;
    gHist[data[i + 1]]++;
    bHist[data[i + 2]]++;
    const luma = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    lHist[luma]++;
  }

  const max = Math.max(
    rHist.reduce((a, b) => Math.max(a, b), 0),
    gHist.reduce((a, b) => Math.max(a, b), 0),
    bHist.reduce((a, b) => Math.max(a, b), 0),
    lHist.reduce((a, b) => Math.max(a, b), 0)
  );

  const barW = w / bins;
  const padding = 2;

  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(0, 0, w, h);

  const drawChannel = (hist: Uint32Array, color: string) => {
    ctx.fillStyle = color;
    for (let i = 0; i < bins; i++) {
      const barH = ((hist[i] / max) * (h - padding * 2));
      ctx.fillRect(i * barW, h - barH - padding, Math.max(1, barW), barH);
    }
  };

  drawChannel(rHist, "rgba(255, 50, 50, 0.5)");
  drawChannel(gHist, "rgba(50, 255, 50, 0.5)");
  drawChannel(bHist, "rgba(50, 100, 255, 0.5)");
  drawChannel(lHist, "rgba(255, 255, 255, 0.4)");

  // Grid lines & axis labels
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.lineWidth = 1;
  ctx.font = "9px monospace";
  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  
  for (let i = 0; i <= 4; i++) {
    const x = (w / 4) * i;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  // Label 0, 128, 255
  ctx.fillText("0", 4, 10);
  ctx.fillText("128", w / 2 - 8, 10);
  ctx.fillText("255", w - 20, 10);
}

function drawWaveform(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  imageData: ImageData
) {
  const srcW = imageData.width;
  const srcH = imageData.height;
  const data = imageData.data;

  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(0, 0, w, h);

  const rowStep = Math.max(1, Math.floor(srcH / h));

  ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
  for (let x = 0; x < w; x++) {
    const srcX = Math.min(Math.floor((x / w) * srcW), srcW - 1);
    for (let y = 0; y < srcH; y += rowStep) {
      const idx = (y * srcW + srcX) * 4;
      const luma = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      const plotY = h - (luma / 255) * h;
      ctx.fillRect(x, plotY, 1, 1);
    }
  }

  // Grid lines
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = (h / 4) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

function drawRGBParade(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  imageData: ImageData
) {
  const srcW = imageData.width;
  const srcH = imageData.height;
  const data = imageData.data;
  const channelW = w / 3;

  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(0, 0, w, h);

  const channels: { offset: number; color: string }[] = [
    { offset: 0, color: "rgba(255, 50, 50, 0.2)" },
    { offset: 1, color: "rgba(50, 255, 50, 0.2)" },
    { offset: 2, color: "rgba(50, 100, 255, 0.2)" },
  ];

  const rowStep = Math.max(1, Math.floor(srcH / h));

  channels.forEach((ch, ci) => {
    ctx.fillStyle = ch.color;
    for (let x = 0; x < channelW; x++) {
      const srcX = Math.min(Math.floor((x / channelW) * srcW), srcW - 1);
      for (let y = 0; y < srcH; y += rowStep) {
        const idx = (y * srcW + srcX) * 4;
        const val = data[idx + ch.offset];
        const plotY = h - (val / 255) * h;
        ctx.fillRect(ci * channelW + x, plotY, 1, 1);
      }
    }
  });

  // Separator lines
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 3; i++) {
    const x = channelW * i;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
}

export default function ScopesOverlay({ width, height }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewDataUrl = useAppStore((s) => s.previewDataUrl);
  const scopeMode = useAppStore((s) => s.scopeMode);
  const scopesVisible = useAppStore((s) => s.scopesVisible);

  const drawScopes = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scopesVisible || !scopeMode || scopeMode === "none") return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (!previewDataUrl) {
      ctx.clearRect(0, 0, width, height);
      return;
    }

    const img = new Image();
    img.onload = () => {
      const offscreen = document.createElement("canvas");
      offscreen.width = img.naturalWidth;
      offscreen.height = img.naturalHeight;
      const offCtx = offscreen.getContext("2d");
      if (!offCtx) return;
      offCtx.drawImage(img, 0, 0);
      const imageData = offCtx.getImageData(0, 0, offscreen.width, offscreen.height);

      ctx.clearRect(0, 0, width, height);
      switch (scopeMode) {
        case "histogram":
          drawHistogram(ctx, width, height, imageData);
          break;
        case "waveform":
          drawWaveform(ctx, width, height, imageData);
          break;
        case "rgb_parade":
          drawRGBParade(ctx, width, height, imageData);
          break;
      }
    };
    img.src = previewDataUrl;
  }, [previewDataUrl, scopeMode, scopesVisible, width, height]);

  useEffect(() => {
    drawScopes();
  }, [drawScopes]);

  if (!scopesVisible || !scopeMode || scopeMode === "none") return null;

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        position: "absolute",
        bottom: 8,
        right: 8,
        width: Math.min(width, 200),
        height: Math.min(height, 100),
        borderRadius: 4,
        pointerEvents: "none",
        zIndex: 10,
      }}
    />
  );
}
