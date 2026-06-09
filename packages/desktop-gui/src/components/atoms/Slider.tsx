import * as React from 'react';

interface SliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (val: number) => void;
}

export const Slider: React.FC<SliderProps> = ({
  value,
  min,
  max,
  step = 1,
  onChange,
  style,
  ...props
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(Number(e.target.value));
  };

  // Compute fill percentage for premium track overlay representation
  const fillPercent = ((value - min) / (max - min)) * 100;

  return (
    <div style={{ display: 'flex', alignItems: 'center', width: '100%', position: 'relative' }}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={handleChange}
        style={{
          ...style,
          background: `linear-gradient(to right, var(--accent-primary) 0%, var(--accent-primary) ${fillPercent}%, var(--bg-surface) ${fillPercent}%, var(--bg-surface) 100%)`,
        }}
        {...props}
      />
    </div>
  );
};
