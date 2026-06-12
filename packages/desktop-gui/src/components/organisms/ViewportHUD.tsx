import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ViewportHUDProps {
  zoom: number;
  quality: 'full' | 'live' | 'still';
  aspectRatio: string;
  mediaWidth?: number;
  mediaHeight?: number;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  isSAMMode: boolean;
  samPoints: number;
  onZoomFit: () => void;
  onZoom100: () => void;
  onToggleQuality: () => void;
  onTogglePlay: () => void;
}

function formatTimecode(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${ms.toString().padStart(2, '0')}`;
}

export const ViewportHUD: React.FC<ViewportHUDProps> = ({
  zoom,
  quality,
  aspectRatio,
  mediaWidth,
  mediaHeight,
  currentTime,
  duration,
  isPlaying,
  isSAMMode,
  samPoints,
  onZoomFit,
  onZoom100,
  onToggleQuality,
  onTogglePlay,
}) => {
  const [hovered, setHovered] = React.useState(true);
  const idleTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseMove = () => {
    setHovered(true);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setHovered(false), 2500);
  };

  React.useEffect(() => {
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, []);

  const qualityColor =
    quality === 'full' ? 'var(--accent-primary)' :
    quality === 'live' ? 'var(--accent-warning)' :
    'var(--text-muted)';

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 'var(--z-hud)',
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHovered(false)}
    >
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ width: '100%', height: '100%' }}
          >
            {/* Top-left: Zoom controls */}
            <div
              style={{
                position: 'absolute',
                top: '12px',
                left: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                pointerEvents: 'auto',
              }}
            >
              <HUDButton onClick={onZoomFit} title="Fit to window">Fit</HUDButton>
              <HUDButton onClick={onZoom100} title="100%">{Math.round(zoom * 100)}%</HUDButton>
            </div>

            {/* Top-right: Quality badge */}
            <div
              style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                pointerEvents: 'auto',
              }}
            >
              {isSAMMode && (
                <span
                  style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: 'var(--accent-info)',
                    color: '#000',
                    fontSize: '11px',
                    fontWeight: 700,
                  }}
                >
                  SAM {samPoints > 0 ? `(${samPoints})` : ''}
                </span>
              )}
              <button
                type="button"
                onClick={onToggleQuality}
                style={{
                  padding: '2px 10px',
                  borderRadius: '4px',
                  background: 'var(--bg-surface)',
                  border: `1px solid ${qualityColor}`,
                  color: qualityColor,
                  fontSize: '11px',
                  fontWeight: 600,
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
                  pointerEvents: 'auto',
                  textTransform: 'uppercase',
                }}
                title="Click to cycle quality mode"
              >
                {quality}
              </button>
            </div>

            {/* Center: Play overlay when paused */}
            {!isPlaying && duration > 0 && (
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  pointerEvents: 'auto',
                }}
              >
                <button
                  type="button"
                  onClick={onTogglePlay}
                  aria-label="Play"
                  style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    background: 'rgba(0,0,0,0.6)',
                    border: '2px solid var(--text-secondary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent-primary)';
                    (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.1)';
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--text-secondary)';
                    (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
                  }}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="var(--text-primary)">
                    <polygon points="8,5 8,19 19,12" />
                  </svg>
                </button>
              </div>
            )}

            {/* Bottom-left: Timecode */}
            {duration > 0 && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '12px',
                  left: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  pointerEvents: 'auto',
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                    background: 'rgba(0,0,0,0.5)',
                    padding: '2px 8px',
                    borderRadius: '4px',
                  }}
                >
                  {formatTimecode(currentTime)}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  / {formatTimecode(duration)}
                </span>
              </div>
            )}

            {/* Bottom-right: Resolution + Aspect */}
            <div
              style={{
                position: 'absolute',
                bottom: '12px',
                right: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                pointerEvents: 'auto',
              }}
            >
              {mediaWidth && mediaHeight && (
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                    background: 'rgba(0,0,0,0.5)',
                    padding: '2px 8px',
                    borderRadius: '4px',
                  }}
                >
                  {mediaWidth}×{mediaHeight}
                </span>
              )}
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                  background: 'rgba(0,0,0,0.5)',
                  padding: '2px 8px',
                  borderRadius: '4px',
                }}
              >
                {aspectRatio}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const HUDButton: React.FC<{ onClick: () => void; title?: string; children: React.ReactNode }> = ({
  onClick,
  title,
  children,
}) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    style={{
      padding: '2px 10px',
      borderRadius: '4px',
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
      color: 'var(--text-secondary)',
      fontSize: '11px',
      fontWeight: 600,
      fontFamily: 'var(--font-mono)',
      cursor: 'pointer',
      pointerEvents: 'auto',
      transition: 'all var(--transition-fast)',
    }}
    onMouseEnter={(e) => {
      (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-default)';
      (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
    }}
    onMouseLeave={(e) => {
      (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-subtle)';
      (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
    }}
  >
    {children}
  </button>
);
