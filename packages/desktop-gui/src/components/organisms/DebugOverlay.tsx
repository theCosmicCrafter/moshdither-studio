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

  return (
    <div
      style={{
        position: "fixed",
        top: "12px",
        right: "12px",
        zIndex: 99999,
        background: "rgba(0,0,0,0.8)",
        border: "1px solid var(--border-color)",
        borderRadius: "var(--radius-md)",
        padding: "12px",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        minWidth: "160px",
        fontFamily: "monospace",
        fontSize: "12px",
        color: "#fff",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span>FPS</span>
        <span style={{ color: metrics.fps >= 55 ? "#4ade80" : metrics.fps >= 30 ? "#facc15" : "#f87171" }}>
          {metrics.fps}
        </span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span>Frame</span>
        <span>{metrics.frameTime.toFixed(1)} ms</span>
      </div>
      {metrics.gpuMemory !== undefined && (
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>GPU</span>
          <span>{(metrics.gpuMemory / 1024 / 1024).toFixed(1)} MB</span>
        </div>
      )}
      <canvas
        ref={canvasRef}
        width={120}
        height={30}
        style={{ borderRadius: "4px", background: "rgba(255,255,255,0.05)" }}
      />
      <button
        type="button"
        onClick={() => debugBus.emit("shader:reload")}
        style={{
          padding: "4px 8px",
          background: "rgba(255,255,255,0.1)",
          border: "1px solid rgba(255,255,255,0.2)",
          borderRadius: "4px",
          color: "#fff",
          cursor: "pointer",
          fontSize: "11px",
          fontFamily: "monospace",
        }}
      >
        Reload Shaders
      </button>
      <div style={{ fontSize: "10px", color: "var(--text-secondary)", textAlign: "center" }}>
        Ctrl+Shift+D to hide
      </div>
    </div>
  );
};
