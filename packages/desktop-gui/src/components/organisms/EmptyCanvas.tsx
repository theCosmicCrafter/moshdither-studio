import * as React from 'react';
import { motion } from 'framer-motion';
import { useStudio } from '../../context/StudioContext';

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
  const { setMediaUrl, setMediaType } = useStudio();
  const [isDragOver, setIsDragOver] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

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
        const nativePath = (file as File & { path?: string }).path;
        const url = nativePath && window.ipcRenderer
          ? `media://${nativePath.replace(/\\/g, '/')}`
          : URL.createObjectURL(file);
        setMediaUrl(url);
        setMediaType(file.type.startsWith('video') ? 'video' : 'image');
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      const nativePath = (file as File & { path?: string }).path;
      const url = nativePath && window.ipcRenderer
        ? `media://${nativePath.replace(/\\/g, '/')}`
        : URL.createObjectURL(file);
      setMediaUrl(url);
      setMediaType(file.type.startsWith('video') ? 'video' : 'image');
    }
  };

  const handleImportClick = () => {
    if (window.ipcRenderer) {
      onImport();
    } else {
      fileInputRef.current?.click();
    }
  };

  return (
    <div
      className="empty-canvas"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Hidden file input for browser fallback */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      {/* Animated background glow */}
      <motion.div
        className="empty-canvas__bg-glow"
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
        className={`empty-canvas__drop-zone${isDragOver ? ' empty-canvas__drop-zone--drag-over' : ''}`}
        animate={isDragOver ? { scale: 1.02 } : { scale: 1 }}
        transition={{ duration: 0.2 }}
      >
        {/* Logo icon */}
        <motion.svg
          width="64"
          height="64"
          viewBox="0 0 64 64"
          fill="none"
          className="empty-canvas__icon"
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        >
          <rect x="8" y="8" width="48" height="48" rx="8" stroke="currentColor" strokeWidth="2" />
          <path d="M20 32L28 24L36 32L44 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M20 40H44" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </motion.svg>

        <div className="empty-canvas__text">
          <h2 className="empty-canvas__title">MoshDither Studio</h2>
          <p className="empty-canvas__subtitle">
            Drop an image or video here, or import to start creating.
          </p>
        </div>

        <button
          type="button"
          onClick={handleImportClick}
          className="empty-canvas__cta"
        >
          Import Media
        </button>

        <span className="empty-canvas__shortcut">
          or press{' '}
          <kbd className="empty-canvas__kbd">Ctrl+O</kbd>
        </span>
      </motion.div>

      {/* Recent files */}
      {recentFiles.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="empty-canvas__recent"
        >
          <span className="empty-canvas__recent-label">Recent Files</span>
          <div className="empty-canvas__recent-list">
            {recentFiles.slice(0, 5).map((file, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onOpenRecent?.(file)}
                className="empty-canvas__recent-item"
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
