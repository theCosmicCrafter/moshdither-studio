import * as React from 'react';
import { useResizablePanel } from '../../hooks/useResizablePanel';
import { motion } from 'framer-motion';

interface StudioLayoutProps {
  header: React.ReactNode;
  leftSidebar: React.ReactNode;
  centerWorkspace: React.ReactNode;
  rightProperties: React.ReactNode;
}

const PanelHeader: React.FC<{
  collapsed: boolean;
  onToggle: () => void;
  side: 'left' | 'right';
}> = ({ collapsed, onToggle, side }) => (
  <button
    type="button"
    onClick={onToggle}
    title={collapsed ? 'Expand panel' : 'Collapse panel'}
    style={{
      position: 'absolute',
      top: '50%',
      [side === 'left' ? 'right' : 'left']: '-10px',
      transform: 'translateY(-50%)',
      width: '20px',
      height: '40px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
      borderRadius: '4px',
      cursor: 'pointer',
      zIndex: 20,
      opacity: 0,
      transition: 'opacity var(--transition-fast)',
    }}
    className="panel-collapse-btn"
    onMouseEnter={(e) => {
      (e.currentTarget.parentElement as HTMLElement | null)?.querySelectorAll('.panel-collapse-btn').forEach((el) => {
        (el as HTMLElement).style.opacity = '1';
      });
    }}
  >
    <motion.svg
      width="8"
      height="8"
      viewBox="0 0 8 8"
      fill="none"
      animate={{ rotate: collapsed ? (side === 'left' ? -90 : 90) : (side === 'left' ? 90 : -90) }}
      transition={{ duration: 0.2 }}
    >
      <path d="M2 1L5 4L2 7" stroke="var(--text-secondary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </motion.svg>
  </button>
);

const ResizeHandle: React.FC<{
  side: 'left' | 'right';
  onMouseDown: (e: React.MouseEvent) => void;
}> = ({ side, onMouseDown }) => (
  <div
    onMouseDown={onMouseDown}
    style={{
      position: 'absolute',
      top: 0,
      bottom: 0,
      [side === 'left' ? 'right' : 'left']: '-4px',
      width: '8px',
      cursor: side === 'left' ? 'e-resize' : 'w-resize',
      zIndex: 30,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}
    title="Drag to resize"
  >
    <div
      style={{
        width: '2px',
        height: '32px',
        borderRadius: '1px',
        background: 'var(--border-subtle)',
        transition: 'background var(--transition-fast)',
      }}
      className="resize-handle-indicator"
    />
  </div>
);

export const StudioLayout: React.FC<StudioLayoutProps> = ({
  header,
  leftSidebar,
  centerWorkspace,
  rightProperties,
}) => {
  const leftPanel = useResizablePanel('left');
  const rightPanel = useResizablePanel('right');

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100vw',
        backgroundColor: 'var(--bg-base)',
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-sans)',
        overflow: 'hidden',
      }}
    >
      {/* Top Header */}
      <header
        style={{
          height: 'var(--toolbar-height)',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 20px',
          flexShrink: 0,
        }}
      >
        {header}
      </header>

      {/* Main Workspace */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
          width: '100%',
        }}
      >
        {/* Left Panel */}
        <aside
          style={{
            width: `${leftPanel.width}px`,
            borderRight: '1px solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            background: 'rgba(15, 15, 17, 0.4)',
            backdropFilter: 'blur(16px) saturate(180%)',
            WebkitBackdropFilter: 'blur(16px) saturate(180%)',
            flexShrink: 0,
            position: 'relative',
            transition: leftPanel.isDragging ? 'none' : 'width var(--transition-slow)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.querySelectorAll('.panel-collapse-btn').forEach((el) => {
              (el as HTMLElement).style.opacity = '1';
            });
          }}
          onMouseLeave={(e) => {
            e.currentTarget.querySelectorAll('.panel-collapse-btn').forEach((el) => {
              (el as HTMLElement).style.opacity = '0';
            });
          }}
        >
          <PanelHeader collapsed={leftPanel.collapsed} onToggle={leftPanel.toggleCollapse} side="left" />
          {!leftPanel.collapsed && (
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {leftSidebar}
            </div>
          )}
          {leftPanel.collapsed && (
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              paddingTop: '16px',
              gap: '12px',
            }}>
              {/* Icon-only sidebar content when collapsed */}
              <span title="Layers & Effects" style={{ color: 'var(--text-muted)', fontSize: '18px' }}>⚡</span>
              <span title="Presets" style={{ color: 'var(--text-muted)', fontSize: '18px' }}>🎨</span>
              <span title="Render Queue" style={{ color: 'var(--text-muted)', fontSize: '18px' }}>📤</span>
            </div>
          )}
          <ResizeHandle side="left" onMouseDown={leftPanel.onMouseDown} />
        </aside>

        {/* Center Panel */}
        <main
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            padding: 'var(--spacing-lg)',
            gap: 'var(--spacing-lg)',
            backgroundColor: '#070709',
          }}
        >
          {centerWorkspace}
        </main>

        {/* Right Panel */}
        <aside
          style={{
            width: `${rightPanel.width}px`,
            borderLeft: '1px solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            background: 'rgba(15, 15, 17, 0.4)',
            backdropFilter: 'blur(16px) saturate(180%)',
            WebkitBackdropFilter: 'blur(16px) saturate(180%)',
            flexShrink: 0,
            position: 'relative',
            transition: rightPanel.isDragging ? 'none' : 'width var(--transition-slow)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.querySelectorAll('.panel-collapse-btn').forEach((el) => {
              (el as HTMLElement).style.opacity = '1';
            });
          }}
          onMouseLeave={(e) => {
            e.currentTarget.querySelectorAll('.panel-collapse-btn').forEach((el) => {
              (el as HTMLElement).style.opacity = '0';
            });
          }}
        >
          <PanelHeader collapsed={rightPanel.collapsed} onToggle={rightPanel.toggleCollapse} side="right" />
          {!rightPanel.collapsed && (
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              {rightProperties}
            </div>
          )}
          {rightPanel.collapsed && (
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              paddingTop: '16px',
              gap: '12px',
            }}>
              <span title="Properties" style={{ color: 'var(--text-muted)', fontSize: '18px' }}>⚙️</span>
            </div>
          )}
          <ResizeHandle side="right" onMouseDown={rightPanel.onMouseDown} />
        </aside>
      </div>
    </div>
  );
};
