import React, { useState } from 'react';

interface TooltipProps {
  content: string;
  children?: React.ReactNode;
}

export const Tooltip: React.FC<TooltipProps> = ({ content, children }) => {
  const [visible, setVisible] = useState(false);

  return (
    <div
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
      }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children ? (
        children
      ) : (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '14px',
            height: '14px',
            borderRadius: '50%',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-color)',
            color: 'var(--text-secondary)',
            fontSize: '10px',
            fontWeight: 'bold',
            cursor: 'help',
            marginLeft: '6px',
            transition: 'all 0.2s',
          }}
          className="tooltip-badge"
        >
          ?
        </span>
      )}

      {visible && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            marginBottom: '8px',
            padding: '6px 10px',
            background: 'rgba(15, 15, 17, 0.95)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: 'var(--shadow-sm)',
            color: 'var(--text-primary)',
            fontSize: '11px',
            fontWeight: 400,
            lineHeight: 1.3,
            width: '180px',
            zIndex: 1000,
            pointerEvents: 'none',
            textAlign: 'center',
            backdropFilter: 'blur(4px)',
          }}
        >
          {content}
          {/* Arrow */}
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: '50%',
              transform: 'translateX(-50%)',
              borderWidth: '5px',
              borderStyle: 'solid',
              borderColor: 'rgba(15, 15, 17, 0.95) transparent transparent transparent',
            }}
          />
        </div>
      )}
    </div>
  );
};
