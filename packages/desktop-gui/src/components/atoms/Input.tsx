import * as React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  glow?: boolean;
}

export const Input: React.FC<InputProps> = ({
  glow = false,
  style,
  className = '',
  ...props
}) => {
  return (
    <input
      style={{
        width: '100%',
        padding: '6px 10px',
        fontSize: '13px',
        backgroundColor: 'var(--bg-surface)',
        color: 'var(--text-primary)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-md)',
        outline: 'none',
        transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        ...style,
      }}
      className={`input-atom ${glow ? 'active-glow' : ''} ${className}`}
      {...props}
    />
  );
};
