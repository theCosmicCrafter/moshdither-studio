import { Play, Pause, SkipBack, SkipForward } from '@phosphor-icons/react';

interface BottomBarProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  status: string;
  onPlayPause: () => void;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  if (h > 0) {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${ms.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${ms.toString().padStart(2, '0')}`;
}

export default function BottomBar({
  isPlaying,
  currentTime,
  duration,
  status,
  onPlayPause,
}: BottomBarProps) {
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className="flex items-center justify-between px-4 shrink-0"
      style={{
        height: 32,
        background: 'var(--bg-panel)',
        borderTop: '1px solid var(--border-subtle)',
      }}
    >
      {/* Transport controls */}
      <div className="flex items-center gap-1">
        <button
          className="p-1 rounded transition-all duration-150"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
          aria-label="Skip back"
        >
          <SkipBack size={14} weight="fill" />
        </button>
        <button
          onClick={onPlayPause}
          className="p-1 rounded transition-all duration-150"
          style={{ color: 'var(--accent-primary)' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--accent-primary)'; }}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause size={16} weight="fill" /> : <Play size={16} weight="fill" />}
        </button>
        <button
          className="p-1 rounded transition-all duration-150"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
          aria-label="Skip forward"
        >
          <SkipForward size={14} weight="fill" />
        </button>
      </div>

      {/* Scrubber */}
      <div className="flex-1 mx-4 flex items-center gap-2">
        <span className="font-mono-data" style={{ fontSize: 10, color: 'var(--text-muted)', minWidth: 60, textAlign: 'right' }}>
          {formatTime(currentTime)}
        </span>
        <div
          className="flex-1 h-1 rounded-full relative cursor-pointer"
          style={{ background: 'var(--bg-hover)' }}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${progress}%`,
              background: 'linear-gradient(90deg, var(--accent-primary), oklch(55% 0.15 280))',
            }}
          />
        </div>
        <span className="font-mono-data" style={{ fontSize: 10, color: 'var(--text-muted)', minWidth: 60 }}>
          {formatTime(duration)}
        </span>
      </div>

      {/* Status */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background: status === 'Ready' ? 'var(--accent-primary)' : status === 'Rendering...' ? 'var(--accent-warning)' : 'var(--accent-secondary)',
            }}
          />
          <span
            className="font-mono-data"
            style={{ fontSize: 11, color: 'var(--text-secondary)' }}
          >
            {status}
          </span>
        </div>
      </div>
    </div>
  );
}
