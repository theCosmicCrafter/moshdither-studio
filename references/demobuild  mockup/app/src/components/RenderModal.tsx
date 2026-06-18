import { useEffect, useState } from 'react';
import { X } from '@phosphor-icons/react';

interface RenderModalProps {
  isOpen: boolean;
  progress: number;
  onClose: () => void;
}

const logMessages = [
  '[00:00:00] Initializing render pipeline...',
  '[00:00:01] Loading media asset... Done',
  '[00:00:02] Building effect chain: RGB Glitch, Bayer Dither, CRT Monitor',
  '[00:00:03] Compiling shaders... Done',
  '[00:00:04] Allocating frame buffers... Done',
  '[00:00:05] Applying RGB Glitch... Done',
  '[00:00:07] Applying Bayer Dither matrix... Done',
  '[00:00:09] Applying CRT barrel distortion... Done',
  '[00:00:11] Applying scanlines + vignette... Done',
  '[00:00:13] Encoding output stream...',
  '[00:00:15] Writing frame data...',
  '[00:00:18] Finalizing render...',
  '[00:00:20] Render complete. Output saved.',
];

export default function RenderModal({ isOpen, progress, onClose }: RenderModalProps) {
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) {
      setLogs([]);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const logIndex = Math.floor((progress / 100) * logMessages.length);
    setLogs(logMessages.slice(0, Math.min(logIndex + 1, logMessages.length)));
  }, [progress, isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.8)', zIndex: 1000 }}
      onClick={onClose}
    >
      <div
        className="rounded overflow-hidden"
        style={{
          width: 640,
          maxWidth: '90vw',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}
        >
          <h2
            className="font-brand text-lg"
            style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}
          >
            RENDERING PIPELINE
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded transition-all duration-150"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Terminal */}
        <div
          className="mx-4 mt-4 rounded overflow-hidden font-mono-data"
          style={{
            height: 240,
            background: 'var(--bg-base)',
            border: '1px solid var(--border-subtle)',
            fontSize: 11,
            lineHeight: '18px',
          }}
        >
          <div className="p-3 overflow-y-auto h-full">
            {logs.map((log, i) => (
              <div
                key={i}
                style={{
                  color: log.includes('Error') || log.includes('Failed')
                    ? 'var(--accent-secondary)'
                    : log.includes('Done') || log.includes('complete')
                      ? 'var(--accent-primary)'
                      : 'var(--text-secondary)',
                }}
              >
                {log}
              </div>
            ))}
            {progress < 100 && (
              <div
                className="inline-block w-2 h-3.5 ml-0.5"
                style={{
                  background: 'var(--accent-primary)',
                  animation: 'caret-blink 1.25s ease-out infinite',
                }}
              />
            )}
          </div>
        </div>

        {/* Progress */}
        <div className="px-4 py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono-data" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Progress
            </span>
            <span className="font-mono-data" style={{ fontSize: 11, color: 'var(--text-primary)' }}>
              {Math.round(progress)}%
            </span>
          </div>
          <div
            className="h-1 rounded-full overflow-hidden"
            style={{ background: 'var(--bg-hover)' }}
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${progress}%`,
                background: 'linear-gradient(90deg, var(--accent-primary), oklch(55% 0.15 280))',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
