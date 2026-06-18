import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import type { EffectConfig, EffectParameter } from '@/types';

interface PropertiesPanelProps {
  effect: EffectConfig | null;
  onUpdateParameter: (effectId: string, paramKey: string, value: number | boolean | string) => void;
}

function ParameterControl({
  param,
  onChange,
}: {
  param: EffectParameter;
  onChange: (value: number | boolean | string) => void;
}) {
  if (param.type === 'toggle') {
    return (
      <div className="flex items-center justify-between py-2">
        <span className="param-label">{param.name}</span>
        <Switch
          checked={!!param.value}
          onCheckedChange={onChange}
        />
      </div>
    );
  }

  if (param.type === 'slider') {
    const val = typeof param.value === 'number' ? param.value : 0;
    const min = param.min ?? 0;
    const max = param.max ?? 1;
    const step = param.step ?? 0.01;

    return (
      <div className="py-2">
        <div className="flex items-center justify-between mb-1.5">
          <span className="param-label">{param.name}</span>
          <span className="param-value">{typeof val === 'number' ? val.toFixed(3) : val}</span>
        </div>
        <Slider
          value={[val]}
          min={min}
          max={max}
          step={step}
          onValueChange={(vals) => onChange(vals[0])}
          className="w-full"
        />
      </div>
    );
  }

  if (param.type === 'int') {
    const val = typeof param.value === 'number' ? param.value : 0;
    const min = param.min ?? 0;
    const max = param.max ?? 100;

    return (
      <div className="py-2">
        <div className="flex items-center justify-between mb-1.5">
          <span className="param-label">{param.name}</span>
          <input
            type="number"
            value={val}
            min={min}
            max={max}
            onChange={(e) => onChange(Number(e.target.value))}
            className="param-value w-16 text-right rounded px-1 py-0.5"
            style={{
              background: 'var(--bg-base)',
              border: '1px solid var(--border-subtle)',
              fontSize: 11,
            }}
          />
        </div>
        <Slider
          value={[val]}
          min={min}
          max={max}
          step={1}
          onValueChange={(vals) => onChange(vals[0])}
          className="w-full"
        />
      </div>
    );
  }

  return null;
}

const categoryLabels: Record<string, string> = {
  glitch: 'WebGL Effect',
  dither: 'Python Effect',
  crt: 'WebGL Effect',
  datamosh: 'Python Effect',
};

export default function PropertiesPanel({ effect, onUpdateParameter }: PropertiesPanelProps) {
  return (
    <div
      className="flex flex-col h-full"
      style={{
        width: 280,
        minWidth: 220,
        maxWidth: 400,
        background: 'var(--bg-panel)',
        borderLeft: '1px solid var(--border-subtle)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 shrink-0"
        style={{
          height: 36,
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <span
          className="font-mono-data uppercase tracking-wider"
          style={{ fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.05em' }}
        >
          Properties
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {effect ? (
          <div className="p-3">
            {/* Effect header */}
            <div
              className="mb-4 pb-3"
              style={{ borderBottom: '1px solid var(--border-subtle)' }}
            >
              <div
                className="text-sm font-medium mb-0.5"
                style={{ color: 'var(--text-primary)' }}
              >
                {effect.name}
              </div>
              <div
                className="font-mono-data"
                style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}
              >
                {categoryLabels[effect.category] || 'Effect'}
              </div>
            </div>

            {/* Parameters */}
            <div className="space-y-1">
              {effect.parameters.map((param) => (
                <ParameterControl
                  key={param.key}
                  param={param}
                  onChange={(value) => onUpdateParameter(effect.id, param.key, value)}
                />
              ))}
            </div>

            {/* Enable toggle */}
            <div
              className="mt-4 pt-3 flex items-center justify-between"
              style={{ borderTop: '1px solid var(--border-subtle)' }}
            >
              <span className="param-label">Enabled</span>
              <Switch
                checked={effect.enabled}
                onCheckedChange={() => {}}
              />
            </div>
          </div>
        ) : (
          <div
            className="flex flex-col items-center justify-center h-full px-6 text-center"
            style={{ minHeight: 200 }}
          >
            <div
              className="mb-3"
              style={{ color: 'var(--text-muted)' }}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="1" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </svg>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Select an effect to edit its parameters
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
