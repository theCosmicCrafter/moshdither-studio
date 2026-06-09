import React, { useEffect, useRef } from 'react';
import { useStudio } from '../../context/StudioContext';
import { Icon } from '../atoms/Icon';

export const RenderModal: React.FC = () => {
  const { isRendering, renderProgress, setRenderProgress } = useStudio();
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Reset progress when rendering starts
  useEffect(() => {
    if (isRendering) {
      setRenderProgress({ percent: 0, logs: ['[System] Starting render job...'] });
    }
  }, [isRendering, setRenderProgress]);

  // Auto-scroll log box
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [renderProgress.logs]);

  if (!isRendering) return null;

  const { percent, logs } = renderProgress;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(10, 10, 12, 0.85)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 20000,
      }}
    >
      <div
        className="glass-panel"
        style={{
          width: '540px',
          padding: '24px',
          background: 'var(--bg-panel-solid)',
          border: '1px solid var(--accent-glow)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.8), 0 0 24px var(--accent-glow)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ animation: 'spin 2s linear infinite', display: 'flex', color: 'var(--accent-primary)' }}>
            <Icon name="refresh" size={24} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>Offline Render Pipeline</span>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Compiling stack with Python & FFmpeg</span>
          </div>
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: '16px', fontWeight: 'bold', color: 'var(--accent-primary)' }}>
            {percent >= 100 ? '100%' : `${percent}%`}
          </span>
        </div>

        {/* Progress Bar */}
        <div style={{ height: '6px', background: 'var(--bg-surface)', borderRadius: '3px', overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: `${percent}%`,
              background: 'linear-gradient(to right, var(--accent-primary), #0a84ff)',
              boxShadow: '0 0 8px var(--accent-glow)',
              transition: 'width 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          />
        </div>

        {/* Log Viewer console */}
        <div
          ref={logContainerRef}
          style={{
            height: '180px',
            background: '#040405',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            padding: '12px',
            overflowY: 'auto',
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: '#30d158', // Terminal green
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          {logs.map((log, index) => (
            <div key={index} style={{ wordBreak: 'break-all', opacity: index === logs.length - 1 ? 1 : 0.7 }}>
              {log}
            </div>
          ))}
        </div>

        <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', textAlign: 'center' }}>
          Please do not close the application. Transcoding video codecs may take up to 20 seconds.
        </span>
      </div>
    </div>
  );
};
