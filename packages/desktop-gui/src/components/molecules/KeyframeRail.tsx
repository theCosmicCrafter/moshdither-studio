import React from "react";
import type { Keyframe } from "../../types/keyframeTypes";

interface KeyframeRailProps {
  keyframes: Keyframe[];
  currentTime: number;
  duration: number;
  onAdd: () => void;
  onRemove: (index: number) => void;
}

/**
 * A small timeline rail below a slider showing keyframe positions.
 * Click the + button to add a keyframe at the current time.
 * Click a keyframe dot to remove it.
 */
export const KeyframeRail: React.FC<KeyframeRailProps> = ({
  keyframes,
  currentTime,
  duration,
  onAdd,
  onRemove,
}) => {
  const dur = Math.max(duration, 0.1);
  const playheadPct = Math.min(100, Math.max(0, (currentTime / dur) * 100));

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "2px", marginBottom: "8px", height: "16px" }}>
      {/* Add keyframe button */}
      <button
        type="button"
        onClick={onAdd}
        title="Add keyframe at current time"
        style={{
          width: "16px",
          height: "16px",
          borderRadius: "3px",
          border: "1px solid var(--border-default)",
          background: "var(--bg-surface)",
          color: "var(--accent-primary)",
          fontSize: "11px",
          lineHeight: "14px",
          cursor: "pointer",
          padding: 0,
          flexShrink: 0,
        }}
      >
        +
      </button>

      {/* Rail */}
      <div
        style={{
          position: "relative",
          flex: 1,
          height: "4px",
          background: "var(--bg-hover)",
          borderRadius: "2px",
          overflow: "visible",
        }}
      >
        {/* Playhead indicator */}
        <div
          style={{
            position: "absolute",
            left: `${playheadPct}%`,
            top: "-3px",
            width: "2px",
            height: "10px",
            background: "var(--accent-primary)",
            borderRadius: "1px",
            transform: "translateX(-50%)",
            pointerEvents: "none",
          }}
        />

        {/* Keyframe dots */}
        {keyframes.map((k, i) => {
          const pct = Math.min(100, Math.max(0, (k.time / dur) * 100));
          return (
            <button
              key={i}
              type="button"
              onClick={() => onRemove(i)}
              title={`Keyframe at ${k.time.toFixed(2)}s — click to remove`}
              style={{
                position: "absolute",
                left: `${pct}%`,
                top: "50%",
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: "var(--accent-warning)",
                border: "1px solid var(--bg-base)",
                transform: "translate(-50%, -50%)",
                cursor: "pointer",
                padding: 0,
              }}
            />
          );
        })}
      </div>
    </div>
  );
};
