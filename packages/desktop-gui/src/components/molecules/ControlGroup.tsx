import * as React from 'react';
import { Slider } from '../atoms/Slider';
import { Input } from '../atoms/Input';

interface ControlGroupProps {
  label: string;
  value: number | string;
  onChange: (val: number | string) => void;
  defaultValue?: number | string;
  type?: 'slider' | 'input' | 'number';
  min?: number;
  max?: number;
  step?: number;
  style?: React.CSSProperties;
}

export const ControlGroup: React.FC<ControlGroupProps> = ({
  label,
  value,
  onChange,
  defaultValue,
  type = 'slider',
  min = 0,
  max = 100,
  step = 1,
  style,
}) => {
  const handleDoubleClick = () => {
    if (defaultValue !== undefined) {
      onChange(defaultValue);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        marginBottom: '16px',
        userSelect: 'none',
        ...style,
      }}
      onDoubleClick={handleDoubleClick}
      title={defaultValue !== undefined ? `Double-click to reset to default (${defaultValue})` : undefined}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span
          style={{
            fontSize: '12px',
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--text-secondary)',
            cursor: defaultValue !== undefined ? 'pointer' : 'default',
          }}
        >
          {label}
        </span>
        {defaultValue !== undefined && (
          <span
            onClick={handleDoubleClick}
            style={{
              fontSize: '10px',
              color: 'var(--accent-primary)',
              cursor: 'pointer',
              opacity: value === defaultValue ? 0.4 : 0.8,
              transition: 'opacity 0.2s',
            }}
          >
            Reset
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {type === 'slider' && (
          <>
            <div style={{ flex: 1 }}>
              <Slider
                value={Number(value)}
                min={min}
                max={max}
                step={step}
                onChange={onChange}
              />
            </div>
            <Input
              type="number"
              min={min}
              max={max}
              step={step}
              value={value}
              onChange={(e) => onChange(Number(e.target.value))}
              style={{ width: '64px', textAlign: 'center', padding: '4px 6px' }}
            />
          </>
        )}

        {type === 'number' && (
          <Input
            type="number"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
          />
        )}

        {type === 'input' && (
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
      </div>
    </div>
  );
};
