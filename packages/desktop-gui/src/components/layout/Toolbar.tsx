import React, { useState, useEffect } from 'react';
import { useStudio } from '../../context/StudioContext';
import { WorkspacePresetBar } from '../molecules/WorkspacePresetBar';
import {
  UploadSimple,
  Export,
  Record,
  Clock,
  FilmStrip,
  Minus,
  Square,
  X,
  CornersIn,
} from '@phosphor-icons/react';

export const Toolbar: React.FC = () => {
  const { setMediaUrl, addRecentFile, addToast, setProxyUrl } = useStudio();
  const [recordDuration, setRecordDuration] = useState(5);
  const [isMaximized, setIsMaximized] = useState(false);
  const isBrowser = !window.ipcRenderer;
  const isMac = navigator.platform.toLowerCase().includes('mac');
  const recordTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (recordTimeoutRef.current) {
        clearTimeout(recordTimeoutRef.current);
        recordTimeoutRef.current = null;
      }
    };
  }, []);

  // Track maximized state for frameless window controls
  useEffect(() => {
    if (isBrowser || !window.windowControls) return;
    const check = () => {
      window.windowControls?.isMaximized().then(setIsMaximized);
    };
    const interval = setInterval(check, 500);
    return () => clearInterval(interval);
  }, [isBrowser]);

  const handleImport = async () => {
    if (!window.ipcRenderer) {
      console.warn('ipcRenderer not available. Are you running in browser instead of Electron?');
      return;
    }
    try {
      const filePath = await window.ipcRenderer.invoke('dialog:openMedia') as string | null;
      if (filePath) {
        setMediaUrl(filePath);
        addRecentFile(filePath);
        const isVideo = /\.(mp4|webm|mov)$/i.test(filePath);
        if (isVideo) {
          const { generateProxy } = await import('../../utils/proxyMedia');
          const ffmpegPath = 'ffmpeg';
          generateProxy(ffmpegPath, filePath.replace(/^media:\/\//, ''), (pct) => {
            if (pct >= 100) {
              addToast('Proxy generated for smooth playback', 'success');
            }
          }).then((proxyPath) => {
            setProxyUrl(`media://${proxyPath.replace(/\\/g, '/')}`);
          }).catch(() => {
            // Proxy generation failed; fallback to original
          });
        }
      }
    } catch {
      // User cancelled or IPC error — ignore
    }
  };

  const onMinimize = () => window.windowControls?.minimize();
  const onMaximize = () => window.windowControls?.maximize();
  const onClose = () => window.windowControls?.close();

  return (
    <header
      className="toolbar"
      style={{
        WebkitAppRegion: 'drag',
        appRegion: 'drag',
      } as React.CSSProperties}
    >
      {/* Logo / Brand — left side */}
      <div className="toolbar__brand">
        <FilmStrip weight="fill" size={20} color="var(--accent-primary)" />
        <span className="toolbar__brand-name">Moshdither</span>
      </div>

      <WorkspacePresetBar />

      {/* App-specific Actions — right side (non-draggable) */}
      <div
        className="toolbar__actions"
        style={{ WebkitAppRegion: 'no-drag', appRegion: 'no-drag' } as React.CSSProperties}
      >
        <button className="btn-secondary" onClick={handleImport}>
          <UploadSimple size={14} />
          Import
        </button>

        <button
          className="btn-secondary"
          onClick={() => {
            const webglCanvas = document.querySelector('canvas');
            if (!webglCanvas) {
              alert('No preview canvas found.');
              return;
            }
            const offscreen = document.createElement('canvas');
            offscreen.width = webglCanvas.width;
            offscreen.height = webglCanvas.height;
            const ctx = offscreen.getContext('2d');
            if (!ctx) {
              alert('Could not create 2D context.');
              return;
            }
            ctx.drawImage(webglCanvas, 0, 0);

            import('../../math/VectorExporter').then(({ generateSvgFromCanvas }) => {
              const svgString = generateSvgFromCanvas(ctx, offscreen.width, offscreen.height, {
                shape: 'circle',
                style: 'scaled',
                cellSize: 8,
                palette: ['#000000', '#555555', '#aaaaaa', '#ffffff'],
              });

              const blob = new Blob([svgString], { type: 'image/svg+xml' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'dithered_vector.svg';
              a.click();
              URL.revokeObjectURL(url);
              addToast('Exported vector SVG successfully!', 'success');
            }).catch((err) => {
              console.error(err);
              addToast('Failed to generate SVG.', 'error');
            });
          }}
        >
          <Export size={14} />
          SVG
        </button>

        {/* Duration Input */}
        <div className="toolbar__duration">
          <Clock size={12} color="var(--text-muted)" />
          <input
            type="number"
            min={1}
            max={25}
            value={recordDuration}
            onChange={(e) => setRecordDuration(Math.max(1, Math.min(25, Number(e.target.value))))}
            aria-label="Record duration in seconds"
            className="toolbar__duration-input"
          />
          <span className="toolbar__duration-suffix">s</span>
        </div>

        <button
          className="btn-shimmer"
          onClick={() => {
            const canvas = document.querySelector('canvas');
            if (!canvas) {
              addToast('No canvas found to record.', 'error');
              return;
            }
            const stream = canvas.captureStream(30);
            const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
            const chunks: Blob[] = [];
            recorder.ondataavailable = (e) => chunks.push(e.data);
            recorder.onstop = () => {
              const blob = new Blob(chunks, { type: 'video/webm' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'dithered_export.webm';
              a.click();
              URL.revokeObjectURL(url);
              addToast('Export completed!', 'success');
            };
            recorder.start();
            addToast(`Recording for ${recordDuration}s...`, 'info');
            recordTimeoutRef.current = setTimeout(() => recorder.stop(), recordDuration * 1000);
          }}
        >
          <Record weight="fill" size={14} />
          Record
        </button>
      </div>

      {/* Window controls — hidden on macOS (traffic lights); shown everywhere else */}
      {!isBrowser && !isMac && (
        <div
          className="window-controls"
          style={{ WebkitAppRegion: 'no-drag', appRegion: 'no-drag' } as React.CSSProperties}
        >
          <button className="window-btn minimize" onClick={onMinimize} title="Minimize">
            <Minus size={14} />
          </button>
          <button className="window-btn maximize" onClick={onMaximize} title={isMaximized ? 'Restore' : 'Maximize'}>
            {isMaximized ? <CornersIn size={14} /> : <Square size={14} />}
          </button>
          <button className="window-btn close" onClick={onClose} title="Close">
            <X size={14} />
          </button>
        </div>
      )}

      {/* macOS traffic-light spacer */}
      {isMac && <div style={{ width: 80 }} />}
    </header>
  );
};
