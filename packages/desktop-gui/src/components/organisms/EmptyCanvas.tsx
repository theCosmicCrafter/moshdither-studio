import * as React from 'react';
import { motion } from 'framer-motion';

interface EmptyCanvasProps {
  onImport: () => void;
  recentFiles?: string[];
  onOpenRecent?: (path: string) => void;
}

export const EmptyCanvas: React.FC<EmptyCanvasProps> = ({
  onImport,
  recentFiles = [],
  onOpenRecent,
}) => {
  const [isDragOver, setIsDragOver] = React.useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
        onImport();
      }
    }
  };

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '32px',
        position: 'relative',
        overflow: 'hidden',
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Animated background glow */}
      <motion.div
        style={{
          position: 'absolute',
          width: '400px',
          height: '400px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, var(--accent-primary-glow) 0%, transparent 70%)',
          filter: 'blur(60px)',
          opacity: 0.4,
        }}
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.3, 0.5, 0.3],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Drop zone */}
      <motion.div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '24px',
          padding: '48px 64px',
          borderRadius: 'var(--radius-md)',
          border: `2px dashed ${isDragOver ? 'var(--accent-primary)' : 'var(--border-default)'}`,
          background: isDragOver ? 'rgba(0, 255, 200, 0.05)' : 'rgba(255, 255, 255, 0.02)',
          transition: 'all var(--transition-base)',
          position: 'relative',
          zIndex: 1,
        }}
        animate={isDragOver ? { scale: 1.02 } : { scale: 1 }}
        transition={{ duration: 0.2 }}
      >
        {/* Logo icon */}
        <motion.svg
          width="64"
          height="64"
          viewBox="0 0 64 64"
          fill="none"
          style={{ color: 'var(--accent-primary)' }}
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        >
          <rect x="8" y="8" width="48" height="48" rx="8" stroke="currentColor" strokeWidth="2" />
          <path d="M20 32L28 24L36 32L44 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M20 40H44" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </motion.svg>

        <div style={{ textAlign: 'center' }}>
          <h2
            style={{
              fontSize: '20px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              marginBottom: '8px',
              fontFamily: 'var(--font-display)',
            }}
          >
            MoshDither Studio
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)', maxWidth: '280px' }}>
            Drop an image or video here, or import to start creating.
          </p>
        </div>

        <button
          type="button"
          onClick={onImport}
          style={{
            padding: '10px 24px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--accent-primary)',
            color: '#000',
            fontSize: '14px',
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
            transition: 'all var(--transition-base)',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.boxShadow = 'var(--glow-primary)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
          }}
        >
          Import Media
        </button>

        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          or press <kbd style={{ padding: '2px 6px', background: 'var(--bg-surface)', borderRadius: '4px', fontFamily: 'var(--font-mono)', fontSize: '11px' }}>Ctrl+O</kbd>
        </span>
      </motion.div>

      {/* Recent files */}
      {recentFiles.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            alignItems: 'center',
            zIndex: 1,
          }}
        >
          <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
            Recent Files
          </span>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
            {recentFiles.slice(0, 5).map((file, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onOpenRecent?.(file)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                  fontSize: '12px',
                  cursor: 'pointer',
                  maxWidth: '200px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
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
                title={file}
              >
                {file.split(/[\\/]/).pop()}
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
};
