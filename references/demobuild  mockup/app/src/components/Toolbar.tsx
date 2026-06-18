import { Upload, Export, ArrowsOut, ArrowsIn, Gear, Play, Pause } from '@phosphor-icons/react';
import type { WorkspacePreset } from '@/types';

interface ToolbarProps {
  workspace: WorkspacePreset;
  onWorkspaceChange: (w: WorkspacePreset) => void;
  isPlaying: boolean;
  onPlayPause: () => void;
  onImport: () => void;
  onExport: () => void;
}

export default function Toolbar({
  workspace,
  onWorkspaceChange,
  isPlaying,
  onPlayPause,
  onImport,
  onExport,
}: ToolbarProps) {
  return (
    <div
      className="flex items-center justify-between px-4 shrink-0"
      style={{
        height: 48,
        background: 'var(--bg-panel)',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      {/* Left: Logo + Menu */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <div
            className="w-5 h-5 rounded-sm"
            style={{ background: 'var(--accent-primary)' }}
          />
          <span
            className="font-brand text-base tracking-tight"
            style={{ color: 'var(--text-primary)' }}
          >
            Moshdither
          </span>
        </div>

        <div className="flex items-center gap-1">
          {['File', 'Edit', 'View'].map((item) => (
            <button
              key={item}
              className="px-3 py-1 rounded text-sm transition-all duration-150"
              style={{
                color: 'var(--text-secondary)',
                fontSize: 13,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--bg-hover)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {/* Center: Workspace presets */}
      <div
        className="flex items-center rounded"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        {(['standard', 'focus', 'export'] as WorkspacePreset[]).map((preset) => (
          <button
            key={preset}
            onClick={() => onWorkspaceChange(preset)}
            className="px-3 py-1 text-xs capitalize transition-all duration-150"
            style={{
              background: workspace === preset ? 'var(--bg-hover)' : 'transparent',
              color: workspace === preset ? 'var(--text-primary)' : 'var(--text-muted)',
              borderRadius: workspace === preset ? 4 : 0,
              fontSize: 12,
              letterSpacing: '0.02em',
            }}
          >
            {preset}
          </button>
        ))}
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={onPlayPause}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded transition-all duration-150"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--accent-primary)';
            e.currentTarget.style.color = 'var(--text-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border-subtle)';
            e.currentTarget.style.color = 'var(--text-secondary)';
          }}
        >
          {isPlaying ? <Pause size={14} weight="fill" /> : <Play size={14} weight="fill" />}
          <span className="text-xs">{isPlaying ? 'Pause' : 'Play'}</span>
        </button>

        <button
          onClick={onImport}
          className="shimmer-btn flex items-center gap-1.5 px-3 py-1.5 rounded transition-all duration-150"
          style={{
            background: 'var(--accent-primary)',
            color: 'var(--text-inverse)',
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          <Upload size={14} />
          <span>Import</span>
        </button>

        <button
          onClick={onExport}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded transition-all duration-150"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--accent-primary)';
            e.currentTarget.style.color = 'var(--text-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border-subtle)';
            e.currentTarget.style.color = 'var(--text-secondary)';
          }}
        >
          <Export size={14} />
          <span className="text-xs">Export</span>
        </button>

        <button
          onClick={() => onWorkspaceChange(workspace === 'focus' ? 'standard' : 'focus')}
          className="p-1.5 rounded transition-all duration-150"
          style={{
            color: 'var(--text-muted)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg-hover)';
            e.currentTarget.style.color = 'var(--text-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--text-muted)';
          }}
          aria-label="Toggle fullscreen"
        >
          {workspace === 'focus' ? <ArrowsIn size={16} /> : <ArrowsOut size={16} />}
        </button>

        <button
          className="p-1.5 rounded transition-all duration-150"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg-hover)';
            e.currentTarget.style.color = 'var(--text-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--text-muted)';
          }}
          aria-label="Settings"
        >
          <Gear size={16} />
        </button>
      </div>
    </div>
  );
}
