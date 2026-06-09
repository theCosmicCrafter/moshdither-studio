import * as React from 'react';
import { useStudio } from '../../context/StudioContext';

export const RenderQueue: React.FC = () => {
  const { renderQueue, clearCompletedJobs } = useStudio();
  if (renderQueue.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, letterSpacing: '0.05em' }}>
          Render Queue ({renderQueue.length})
        </span>
        <button
          onClick={clearCompletedJobs}
          style={{ fontSize: '10px', color: 'var(--accent-primary)', background: 'none', border: 'none', cursor: 'pointer', opacity: 0.8 }}
        >
          Clear Completed
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '120px', overflowY: 'auto' }}>
        {renderQueue.map((job) => (
          <div
            key={job.id}
            style={{
              padding: '8px 10px',
              borderRadius: 'var(--radius-md)',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--border-color)',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)' }}>{job.name}</span>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  color:
                    job.status === 'completed'
                      ? '#4ade80'
                      : job.status === 'failed'
                        ? '#f87171'
                        : job.status === 'rendering'
                          ? 'var(--accent-primary)'
                          : 'var(--text-secondary)',
                }}
              >
                {job.status}
              </span>
            </div>
            {job.status === 'rendering' && (
              <div style={{ width: '100%', height: '3px', background: 'var(--bg-surface)', borderRadius: '2px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${job.progress}%`,
                    height: '100%',
                    background: 'var(--accent-primary)',
                    borderRadius: '2px',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            )}
            {job.error && <span style={{ fontSize: '10px', color: '#f87171' }}>{job.error}</span>}
          </div>
        ))}
      </div>
    </div>
  );
};
