import * as React from 'react';

interface AudioWaveformProps {
  mediaUrl: string | null;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onSeek?: (time: number) => void;
}

/**
 * Draw a static audio waveform from a video/audio source,
 * synced to the timeline scrubber with a playhead overlay.
 */
export const AudioWaveform: React.FC<AudioWaveformProps> = ({
  mediaUrl,
  currentTime,
  duration,
  onSeek,
}) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const peaksRef = React.useRef<number[] | null>(null);
  const [, setReady] = React.useState(false);

  // Decode audio and store peaks in a ref (no state during async callback)
  React.useEffect(() => {
    if (!mediaUrl) {
      peaksRef.current = null;
      return;
    }

    let cancelled = false;
    const audioCtx = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();

    fetch(mediaUrl)
      .then((res) => res.arrayBuffer())
      .then((arrayBuffer) => audioCtx.decodeAudioData(arrayBuffer))
      .then((audioBuffer) => {
        if (cancelled) return;
        const raw = audioBuffer.getChannelData(0);
        const peaks: number[] = [];
        const step = Math.floor(raw.length / 300);
        for (let i = 0; i < 300; i++) {
          let max = 0;
          for (let j = 0; j < step; j++) {
            const v = Math.abs(raw[i * step + j]);
            if (v > max) max = v;
          }
          peaks.push(max);
        }
        peaksRef.current = peaks;
        // schedule re-render so the draw effect can pick up peaks
        requestAnimationFrame(() => setReady((v) => !v));
      })
      .catch(() => {
        peaksRef.current = null;
      });

    return () => {
      cancelled = true;
      audioCtx.close().catch(() => {});
    };
  }, [mediaUrl]);

  // Draw waveform + playhead whenever currentTime or duration changes
  React.useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const peaks = peaksRef.current;
    if (!canvas || !ctx || !peaks) return;

    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, 0, w, h);

    const barWidth = w / peaks.length;
    ctx.fillStyle = 'rgba(10, 132, 255, 0.6)';
    for (let i = 0; i < peaks.length; i++) {
      const barHeight = peaks[i] * (h * 0.9);
      const x = i * barWidth;
      const y = (h - barHeight) / 2;
      ctx.fillRect(x, y, Math.max(1, barWidth - 1), barHeight);
    }

    if (duration > 0) {
      const pct = Math.min(1, Math.max(0, currentTime / duration));
      const x = pct * w;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
  }, [currentTime, duration]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!duration || !onSeek) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(pct * duration);
  };

  if (!mediaUrl) return null;

  return (
    <canvas
      ref={canvasRef}
      width={300}
      height={40}
      onClick={handleClick}
      style={{
        width: '100%',
        height: 40,
        borderRadius: 4,
        cursor: onSeek ? 'pointer' : 'default',
        background: 'rgba(0,0,0,0.3)',
      }}
    />
  );
};
