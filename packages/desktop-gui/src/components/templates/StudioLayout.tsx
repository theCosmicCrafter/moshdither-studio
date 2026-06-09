import * as React from 'react';

interface StudioLayoutProps {
  header: React.ReactNode;
  leftSidebar: React.ReactNode;
  centerWorkspace: React.ReactNode;
  rightProperties: React.ReactNode;
}

export const StudioLayout: React.FC<StudioLayoutProps> = ({
  header,
  leftSidebar,
  centerWorkspace,
  rightProperties,
}) => {
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
          height: '56px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 20px',
          zIndex: 10,
        }}
      >
        {header}
      </header>

      {/* Main Workspace Grid */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
          width: '100%',
        }}
      >
        {/* Left Side (Layers, Effects, Presets) */}
        <aside
          style={{
            width: '320px',
            borderRight: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            background: 'rgba(15, 15, 17, 0.4)',
            backdropFilter: 'var(--glass-blur)',
            WebkitBackdropFilter: 'var(--glass-blur)',
            flexShrink: 0,
          }}
        >
          {leftSidebar}
        </aside>

        {/* Center Panel (WebGL Canvas and Controls) */}
        <main
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            padding: '16px',
            gap: '16px',
            backgroundColor: '#070709',
          }}
        >
          {centerWorkspace}
        </main>

        {/* Right Side (Properties, Palette) */}
        <aside
          style={{
            width: '360px',
            borderLeft: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            background: 'rgba(15, 15, 17, 0.4)',
            backdropFilter: 'var(--glass-blur)',
            WebkitBackdropFilter: 'var(--glass-blur)',
            flexShrink: 0,
          }}
        >
          {rightProperties}
        </aside>
      </div>
    </div>
  );
};
