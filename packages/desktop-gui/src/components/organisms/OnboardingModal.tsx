import * as React from 'react';
import { Button } from '../atoms/Button';

export const OnboardingModal: React.FC = () => {
  const [dismissed, setDismissed] = React.useState(() => {
    return localStorage.getItem('onboardingDismissed') === 'true';
  });

  if (dismissed) return null;

  const dismiss = () => {
    localStorage.setItem('onboardingDismissed', 'true');
    setDismissed(true);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div
        style={{
          maxWidth: '480px',
          width: '90%',
          background: 'var(--bg-panel)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg)',
          padding: '32px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <h2 style={{ margin: 0, fontSize: '22px', color: 'var(--text-primary)' }}>Welcome to MoshDither Studio</h2>
        <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          A professional datamoshing and dithering studio built for artists and creators.
        </p>
        <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          <li>Import images or videos to start</li>
          <li>Add and stack effects in the Layers panel</li>
          <li>Use blend modes and opacity for fine control</li>
          <li>Paint masks with the professional brush engine</li>
          <li>Export to PNG, JPG, GIF, or MP4</li>
        </ul>
        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
          <Button variant="primary" onClick={dismiss} style={{ flex: 1 }}>
            Get Started
          </Button>
          <Button variant="glass" onClick={dismiss} style={{ flex: 1 }}>
            Skip
          </Button>
        </div>
      </div>
    </div>
  );
};
