import * as React from 'react';
import { useResizablePanel } from '../../hooks/useResizablePanel';
import { PanelContext } from '../../context/PanelContext';
import type { PanelContextType } from '../../context/PanelContext';
import { motion } from 'framer-motion';
import { Stack, PaintBrush, UploadSimple, SlidersHorizontal } from '@phosphor-icons/react';

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
    className={`panel-collapse-btn panel-collapse-btn--${side}`}
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
    className={`panel-resize-handle panel-resize-handle--${side}`}
    title="Drag to resize"
  >
    <div className="panel-resize-handle__indicator" />
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

  const panelValue: PanelContextType = {
    left: {
      width: leftPanel.width,
      collapsed: leftPanel.collapsed,
      setWidth: leftPanel.setWidth,
      toggleCollapse: leftPanel.toggleCollapse,
    },
    right: {
      width: rightPanel.width,
      collapsed: rightPanel.collapsed,
      setWidth: rightPanel.setWidth,
      toggleCollapse: rightPanel.toggleCollapse,
    },
  };

  return (
    <PanelContext.Provider value={panelValue}>
      <div className="studio-layout">
        {/* Top Header */}
        {header}

        {/* Main Workspace Grid */}
        <div
          className="studio-main"
          style={{
            gridTemplateColumns: `${leftPanel.collapsed ? 60 : leftPanel.width}px minmax(0, 1fr) ${rightPanel.collapsed ? 60 : rightPanel.width}px`,
            transition: (leftPanel.isDragging || rightPanel.isDragging) ? 'none' : 'grid-template-columns var(--transition-slow)',
          }}
        >
          {/* Left Panel */}
          <aside className="studio-sidebar">
            <PanelHeader collapsed={leftPanel.collapsed} onToggle={leftPanel.toggleCollapse} side="left" />
            {!leftPanel.collapsed && (
              <div className="studio-sidebar__content">
                {leftSidebar}
              </div>
            )}
            {leftPanel.collapsed && (
              <div className="sidebar-icon-nav">
                <button className="sidebar-icon-btn" type="button" title="Layers & Effects" onClick={leftPanel.toggleCollapse}>
                  <Stack size={18} />
                </button>
                <button className="sidebar-icon-btn" type="button" title="Presets" onClick={leftPanel.toggleCollapse}>
                  <PaintBrush size={18} />
                </button>
                <button className="sidebar-icon-btn" type="button" title="Render Queue" onClick={leftPanel.toggleCollapse}>
                  <UploadSimple size={18} />
                </button>
              </div>
            )}
            <ResizeHandle side="left" onMouseDown={leftPanel.onMouseDown} />
          </aside>

          {/* Center Panel */}
          <main className="studio-center">
            {centerWorkspace}
          </main>

          {/* Right Panel */}
          <aside className="studio-properties">
            <PanelHeader collapsed={rightPanel.collapsed} onToggle={rightPanel.toggleCollapse} side="right" />
            {!rightPanel.collapsed && (
              <div className="studio-properties__content">
                {rightProperties}
              </div>
            )}
            {rightPanel.collapsed && (
              <div className="sidebar-icon-nav">
                <button className="sidebar-icon-btn" type="button" title="Properties" onClick={rightPanel.toggleCollapse}>
                  <SlidersHorizontal size={18} />
                </button>
              </div>
            )}
            <ResizeHandle side="right" onMouseDown={rightPanel.onMouseDown} />
          </aside>
        </div>
      </div>
    </PanelContext.Provider>
  );
};
