import * as React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'glass';
  size?: 'sm' | 'md' | 'lg';
  glow?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'secondary',
  size = 'md',
  glow = false,
  style,
  className = '',
  ...props
}) => {
  const getStyles = () => {
    const base: React.CSSProperties = {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 500,
      borderRadius: 'var(--radius-md)',
      fontFamily: 'var(--font-sans)',
      transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
      gap: '8px',
      border: '1px solid transparent',
      userSelect: 'none',
    };

    // Size mappings
    let padding = '8px 16px';
    let fontSize = '13px';
    if (size === 'sm') {
      padding = '4px 10px';
      fontSize = '12px';
    } else if (size === 'lg') {
      padding = '12px 24px';
      fontSize = '15px';
    }

    // Variant mappings
    let bg = 'var(--bg-surface)';
    let color = 'var(--text-primary)';
    let border = 'var(--border-color)';
    let shadow = 'none';
    let backdropFilter = 'none';

    if (variant === 'primary') {
      bg = 'var(--accent-primary)';
      color = '#ffffff';
      border = 'transparent';
      if (glow) {
        shadow = '0 0 12px var(--accent-glow)';
      }
    } else if (variant === 'danger') {
      bg = '#ff453a';
      color = '#ffffff';
      border = 'transparent';
    } else if (variant === 'ghost') {
      bg = 'transparent';
      color = 'var(--text-secondary)';
      border = 'transparent';
    } else if (variant === 'glass') {
      bg = 'rgba(255, 255, 255, 0.03)';
      color = 'var(--text-primary)';
      border = 'var(--border-color)';
      backdropFilter = 'var(--glass-blur)';
    }

    return {
      ...base,
      padding,
      fontSize,
      backgroundColor: bg,
      color,
      borderColor: border,
      boxShadow: shadow,
      backdropFilter,
      WebkitBackdropFilter: backdropFilter,
      ...style,
    };
  };

  return (
    <button
      style={getStyles()}
      className={`btn-atom variant-${variant} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
