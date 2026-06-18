import { useEffect, useRef, useCallback } from "react";
import { useAppStore } from "../store";
import { getGlobalAudioEngine } from "../engine/audio/AudioEngine";

interface Props {
  fps?: number;
}

export default function PlaybackOverlay({ fps = 30 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const currentTime = useAppStore((s) => s.currentTime);
  const mediaInfo = useAppStore((s) => s.mediaInfo);
  const audioEnabled = useAppStore((s) => s.audioEnabled);
  const audioPlaying = useAppStore((s) => s.audioPlaying);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Frame counter (top-left)
    const frameNumber = Math.floor(currentTime * fps);
    const timeStr = new Date(currentTime * 1000).toISOString().substr(14, 8);

    ctx.font = 'bold 11px var(--font-mono, monospace)';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`Frame ${frameNumber}`, 8, 4);
    ctx.font = '10px var(--font-mono, monospace)';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.fillText(`Time ${timeStr}`, 8, 18);

    if (mediaInfo) {
      ctx.fillText(`${mediaInfo.width}x${mediaInfo.height}`, 8, 32);
    }

    // Audio waveform (bottom edge)
    if (audioEnabled && audioPlaying) {
      const engine = getGlobalAudioEngine();
      const data = engine?.getTimeDomainData();
      if (data && data.length > 0) {
        const waveH = 40;
        const waveY = canvas.height - waveH;
        const sliceWidth = canvas.width / data.length;

        ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
        ctx.fillRect(0, waveY, canvas.width, waveH);

        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "rgba(0, 255, 200, 0.6)";
        ctx.beginPath();
        let x = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128.0;
          const y = waveY + (waveH / 2) + v * (waveH / 2 - 2);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
          x += sliceWidth;
        }
        ctx.stroke();

        // Center line
        ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, waveY + waveH / 2);
        ctx.lineTo(canvas.width, waveY + waveH / 2);
        ctx.stroke();
      }
    }
  }, [currentTime, fps, mediaInfo, audioEnabled, audioPlaying]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [draw]);

  return (
    <canvas
      ref={canvasRef}
      width={300}
      height={80}
      style={{
        position: "absolute",
        top: 8,
        left: 8,
        width: 300,
        height: 80,
        pointerEvents: "none",
        zIndex: 10,
      }}
    />
  );
}
