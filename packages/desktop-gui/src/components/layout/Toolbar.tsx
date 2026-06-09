import React, { useState } from 'react';
import { useStudio } from '../../context/StudioContext';
import {
  UploadSimple,
  Export,
  Record,
  Clock,
  FilmStrip,
} from '@phosphor-icons/react';

export const Toolbar: React.FC = () => {
  const { setMediaUrl, addRecentFile, addToast, setProxyUrl } = useStudio();
  const [recordDuration, setRecordDuration] = useState(5);

  const handleImport = async () => {
    if (window.ipcRenderer) {
      const filePath = await window.ipcRenderer.invoke('dialog:openMedia') as string | null;
      if (filePath) {
        setMediaUrl(filePath);
        addRecentFile(filePath);
        // Auto-generate proxy for video files in background
        const isVideo = /\.(mp4|webm|mov)$/i.test(filePath);
        if (isVideo) {
          const { generateProxy } = await import('../../utils/proxyMedia');
          const ffmpegPath = 'ffmpeg'; // expect ffmpeg in PATH or bundled
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
    } else {
      console.warn('ipcRenderer not available. Are you running in browser instead of Electron?');
    }
  };

  return (
    <header
      style={{
        height: 48,
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: 24,
        background: 'var(--bg-panel)',
        flexShrink: 0,
      }}
    >
      {/* Logo / Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <FilmStrip weight="fill" size={20} color="var(--accent-primary)" />
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 16,
            fontWeight: 700,
            color: 'var(--text-primary)',
            letterSpacing: '-0.01em',
          }}
        >
          Moshdither
        </span>
      </div>

      {/* Nav */}
      <nav style={{ display: 'flex', gap: 16 }}>
        {['File', 'Edit', 'View', 'Help'].map((label) => (
          <button
            key={label}
            style={{
              color: 'var(--text-secondary)',
              fontSize: 12,
              fontWeight: 500,
              padding: '4px 0',
              transition: 'color 150ms ease',
            }}
            onMouseEnter={(e) => { (e.target as HTMLElement).style.color = 'var(--text-primary)'; }}
            onMouseLeave={(e) => { (e.target as HTMLElement).style.color = 'var(--text-secondary)'; }}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* Right Actions */}
      <div
        style={{
          marginLeft: 'auto',
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          // @ts-expect-error React CSS types don't include WebkitAppRegion
          WebkitAppRegion: 'no-drag',
        }}
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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)',
            padding: '0 8px',
            height: 30,
          }}
        >
          <Clock size={12} color="var(--text-muted)" />
          <input
            type="number"
            min={1}
            max={25}
            value={recordDuration}
            onChange={(e) => setRecordDuration(Math.max(1, Math.min(25, Number(e.target.value))))}
            aria-label="Record duration in seconds"
            style={{
              width: 36,
              padding: 0,
              background: 'transparent',
              border: 'none',
              color: 'var(--text-primary)',
              fontSize: 12,
              textAlign: 'center',
              outline: 'none',
              fontFamily: 'var(--font-mono)',
            }}
          />
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>s</span>
        </div>

        <button className="btn-shimmer" onClick={() => {
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
          setTimeout(() => recorder.stop(), recordDuration * 1000);
        }}>
          <Record weight="fill" size={14} />
          Record
        </button>
      </div>
    </header>
  );
};
