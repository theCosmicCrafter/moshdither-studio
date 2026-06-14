import * as React from 'react';
import { motion } from 'framer-motion';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  disabled = false,
}) => {
  const handleToggle = () => {
    if (!disabled) {
      onChange(!checked);
    }
  };

  return (
    <div
      onClick={handleToggle}
      style={{
        width: '38px',
        height: '20px',
        borderRadius: '10px',
        backgroundColor: checked ? 'var(--accent-primary)' : 'var(--bg-surface)',
        border: '1px solid var(--border-color)',
        position: 'relative',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background-color 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        opacity: disabled ? 0.5 : 1,
        boxShadow: checked ? '0 0 8px var(--accent-glow)' : 'none',
      }}
    >
      <motion.div
        style={{
          width: '14px',
          height: '14px',
          borderRadius: '50%',
          backgroundColor: '#ffffff',
          position: 'absolute',
          top: '2px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
        }}
        animate={{ left: checked ? '20px' : '2px' }}
        transition={{ type: 'spring', stiffness: 600, damping: 25 }}
      />
    </div>
  );
};
