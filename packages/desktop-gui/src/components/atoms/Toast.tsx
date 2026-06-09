import * as React from 'react';
import type { ToastItem } from '../../context/StudioContext';
import { Icon } from './Icon';

interface ToastProps {
  toast: ToastItem;
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ toast, onClose }) => {
  const getStyles = () => {
    let borderColor = 'var(--border-color)';
    let glowColor = 'rgba(255, 255, 255, 0.05)';
    let iconName: 'settings' | 'plus' | 'close' | 'trash' | 'play' | 'pause' | 'folder' | 'refresh' | 'palette' | 'up' | 'down' | 'mosh' | 'dither' | 'halftone' | 'glow' | 'crt' = 'settings';
    let iconColor = 'var(--text-secondary)';

    if (toast.type === 'success') {
      borderColor = '#30d158'; // iOS Green
      glowColor = 'rgba(48, 209, 88, 0.2)';
      iconName = 'refresh'; // Or other success indicator
      iconColor = '#30d158';
    } else if (toast.type === 'error') {
      borderColor = '#ff453a'; // iOS Red
      glowColor = 'rgba(255, 69, 58, 0.2)';
      iconName = 'close';
      iconColor = '#ff453a';
    } else if (toast.type === 'info') {
      borderColor = 'var(--accent-primary)';
      glowColor = 'var(--accent-glow)';
      iconName = 'settings';
      iconColor = 'var(--accent-primary)';
    }

    return { borderColor, glowColor, iconName, iconColor };
  };

  const { borderColor, glowColor, iconName, iconColor } = getStyles();

  return (
    <div
      role={toast.type === 'error' ? 'alert' : 'status'}
      aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 16px',
        background: 'rgba(28, 28, 30, 0.9)',
        border: '1px solid',
        borderColor,
        borderRadius: 'var(--radius-lg)',
        boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 16px ${glowColor}`,
        backdropFilter: 'var(--glass-blur)',
        WebkitBackdropFilter: 'var(--glass-blur)',
        color: 'var(--text-primary)',
        width: '320px',
        animation: 'slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        pointerEvents: 'auto',
      }}
      className="toast-notification-item"
    >
      <div style={{ color: iconColor, display: 'flex', alignItems: 'center' }}>
        <Icon name={iconName} size={18} />
      </div>
      <div style={{ flex: 1, fontSize: '13px', fontWeight: 500, lineHeight: 1.4 }}>
        {toast.message}
      </div>
      <button
        onClick={onClose}
        style={{
          color: 'var(--text-tertiary)',
          cursor: 'pointer',
          padding: '2px',
          display: 'flex',
          alignItems: 'center',
          transition: 'color 0.2s',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-tertiary)')}
      >
        <Icon name="close" size={14} />
      </button>
    </div>
  );
};
