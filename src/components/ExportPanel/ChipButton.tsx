import type { CSSProperties, ReactNode } from "react";

interface ChipButtonProps {
  active: boolean;
  onClick: () => void;
  /** Text color when active, e.g. "var(--accent-teal)". */
  activeColor: string;
  /** Background when active, e.g. "rgba(0, 244, 254, 0.25)". */
  activeBackground: string;
  title?: string;
  /** Merged over the shared base style, for the rare per-group tweak
   * (flex: 1, a wider padding, textTransform, a two-line layout, ...). */
  style?: CSSProperties;
  children: ReactNode;
}

/**
 * A small translucent-highlight toggle button, as used across ExportPanel's
 * option groups (Format, Quality, Resolution, Processing, Aspect Ratio,
 * Codec). Each group picks its own accent color; layout quirks specific to
 * one group go through `style`, not a new named prop.
 */
export default function ChipButton({
  active,
  onClick,
  activeColor,
  activeBackground,
  title,
  style,
  children,
}: ChipButtonProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        padding: "2px 6px",
        fontSize: 10,
        borderRadius: 3,
        border: "none",
        cursor: "pointer",
        background: active ? activeBackground : "var(--surface-container-low)",
        color: active ? activeColor : "var(--text-muted)",
        ...style,
      }}
    >
      {children}
    </button>
  );
}
