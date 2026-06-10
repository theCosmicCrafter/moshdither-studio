import * as React from "react";
import { EventBus } from "../../utils/webgl/eventBus";

const debugBus = new EventBus();

interface FrameMetrics {
  fps: number;
  frameTime: number;
  gpuMemory?: number;
}

/**
 * Debug HUD overlay: FPS counter, frame time graph, GPU memory.
 * Toggle with Ctrl/Cmd + Shift + D.
 */
export const DebugOverlay: React.FC = () => {
  const [visible, setVisible] = React.useState(false);
  const [metrics, setMetrics] = React.useState<FrameMetrics>({ fps: 0, frameTime: 0 });
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const framesRef = React.useRef<number[]>([]);
  const lastTimeRef = React.useRef(0);
  const rafRef = React.useRef(0);

  React.useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "D") {
        e.preventDefault();
        setVisible((v) => !v);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  React.useEffect(() => {
    if (!visible) return;
    lastTimeRef.current = performance.now();

    const loop = () => {
      const now = performance.now();
      const delta = now - lastTimeRef.current;
      lastTimeRef.current = now;

      const frameTime = delta;
      const fps = Math.round(1000 / Math.max(delta, 1));

      framesRef.current.push(frameTime);
      if (framesRef.current.length > 60) framesRef.current.shift();

      // Query GPU memory if extension available
      let gpuMemory: number | undefined;
      const gl = document.querySelector("canvas")?.getContext("webgl2");
      if (gl) {
        const ext = gl.getExtension("GMAN_webgl_memory");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (ext) gpuMemory = ((ext as any).getMemoryInfo?.() ?? {}).usedJSHeapSize;
      }

      setMetrics({ fps, frameTime, gpuMemory });

      // Draw frame time graph
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          const barWidth = canvas.width / 60;
          const maxMs = 33; // 30fps line
          framesRef.current.forEach((ft, i) => {
            const h = Math.min((ft / maxMs) * canvas.height, canvas.height);
            ctx.fillStyle = ft > 16.7 ? "#f87171" : "#4ade80";
            ctx.fillRect(i * barWidth, canvas.height - h, barWidth - 1, h);
          });
          // 60fps target line
          ctx.strokeStyle = "rgba(255,255,255,0.3)";
          ctx.beginPath();
          ctx.moveTo(0, canvas.height - (16.7 / maxMs) * canvas.height);
          ctx.lineTo(canvas.width, canvas.height - (16.7 / maxMs) * canvas.height);
          ctx.stroke();
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [visible]);

  if (!visible) return null;

  const fpsClass =
    metrics.fps >= 55
      ? "debug-overlay__metric-value--good"
      : metrics.fps >= 30
        ? "debug-overlay__metric-value--warn"
        : "debug-overlay__metric-value--bad";

  return (
    <div className="debug-overlay">
      <div className="debug-overlay__metric">
        <span>FPS</span>
        <span className={fpsClass}>{metrics.fps}</span>
      </div>
      <div className="debug-overlay__metric">
        <span>Frame</span>
        <span>{metrics.frameTime.toFixed(1)} ms</span>
      </div>
      {metrics.gpuMemory !== undefined && (
        <div className="debug-overlay__metric">
          <span>GPU</span>
          <span>{(metrics.gpuMemory / 1024 / 1024).toFixed(1)} MB</span>
        </div>
      )}
      <canvas
        ref={canvasRef}
        width={120}
        height={30}
        className="debug-overlay__graph"
      />
      <button
        type="button"
        onClick={() => debugBus.emit("shader:reload")}
        className="debug-overlay__reload-btn"
      >
        Reload Shaders
      </button>
      <div className="debug-overlay__hint">
        Ctrl+Shift+D to hide
      </div>
    </div>
  );
};
