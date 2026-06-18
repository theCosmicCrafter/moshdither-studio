import { useState } from 'react';

export function SpoutPanel() {
  const [enabled, setEnabled] = useState(false);
  const [senderName] = useState('MoshDither-Studio');

  return (
    <div style={{ padding: 12 }}>
      <h3 style={{ margin: '0 0 12px 0', fontSize: 14, fontWeight: 600 }}>
        Spout GPU Output
      </h3>
      <p style={{ margin: '0 0 12px 0', fontSize: 12, opacity: 0.7 }}>
        Share the preview texture to external apps (Resolume, OBS, TouchDesigner).
      </p>

      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 13,
          cursor: 'pointer',
          marginBottom: 12,
        }}
      >
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        Enable Spout Sender
      </label>

      <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 8 }}>
        Sender Name: <strong>{senderName}</strong>
      </div>

      {enabled && (
        <div
          style={{
            padding: 8,
            borderRadius: 4,
            background: '#1a1a1a',
            fontSize: 11,
            fontFamily: 'monospace',
            color: '#ffcc00',
          }}
        >
          ⚠ Spout integration requires Spout2 SDK FFI binding.
          <br />
          See src-tauri/src/spout/mod.rs for architecture.
        </div>
      )}
    </div>
  );
}
