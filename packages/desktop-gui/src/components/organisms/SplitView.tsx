import * as React from 'react';

interface SplitViewProps {
  enabled: boolean;
  hideSplitLine?: boolean;
  children: React.ReactNode;
  originalSrc: string | null;
}

/**
 * A/B split-screen comparison overlay.
 * When enabled, shows the original source on the left half
 * and the processed preview (children) on the right half.
 */
export const SplitView: React.FC<SplitViewProps> = ({ enabled, hideSplitLine = false, children, originalSrc }) => {
  // Sources behind custom protocols need to be fetched into a blob URL.
  const needsBlob = !!originalSrc && (originalSrc.startsWith('media://') || originalSrc.startsWith('blob:'));
  const [blob, setBlob] = React.useState<{ src: string; url: string } | null>(null);

  React.useEffect(() => {
    if (!originalSrc || !(originalSrc.startsWith('media://') || originalSrc.startsWith('blob:'))) return;

    let objectUrl: string | null = null;
    let cancelled = false;

    fetch(originalSrc)
      .then(r => r.blob())
      .then(b => {
        objectUrl = URL.createObjectURL(b);
        if (!cancelled) setBlob({ src: originalSrc, url: objectUrl });
      })
      .catch(() => {
        if (!cancelled) setBlob({ src: originalSrc, url: originalSrc });
      });

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [originalSrc]);

  const originalUrl = needsBlob
    ? (blob && blob.src === originalSrc ? blob.url : null)
    : originalSrc;

  if (!enabled || !originalUrl) return <>{children}</>;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Original image/video on the left half */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: '50%',
          height: '100%',
          overflow: 'hidden',
          zIndex: 2,
          borderRight: hideSplitLine ? 'none' : '2px solid var(--accent-primary)',
        }}
      >
        {originalUrl.match(/.(mp4|webm|mov|avi|mkv)$/i) ? (
          <video
            src={originalUrl}
            style={{ width: '200%', height: '100%', objectFit: 'contain' }}
            muted
            loop
            autoPlay
          />
        ) : (
          <img
            src={originalUrl}
            alt="Original"
            style={{ width: '200%', height: '100%', objectFit: 'contain' }}
          />
        )}
      </div>

      {/* Processed preview (children) fills the full area */}
      <div style={{ position: 'relative', width: '100%', height: '100%', zIndex: 1 }}>
        {children}
      </div>

      {/* Label */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          zIndex: 3,
          background: 'rgba(0,0,0,0.6)',
          padding: '2px 8px',
          borderRadius: '4px',
          fontSize: '11px',
          color: '#fff',
        }}
      >
        Original
      </div>
      <div
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          zIndex: 3,
          background: 'rgba(0,0,0,0.6)',
          padding: '2px 8px',
          borderRadius: '4px',
          fontSize: '11px',
          color: '#fff',
        }}
      >
        Processed
      </div>
    </div>
  );
};
