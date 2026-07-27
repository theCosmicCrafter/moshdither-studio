import { useAppStore } from "../store";
import { useState } from "react";

export default function MaskListPanel() {
  const activeMask = useAppStore((s) => s.activeMask);
  const maskVisible = useAppStore((s) => s.maskVisible);
  const setMaskVisible = useAppStore((s) => s.setMaskVisible);
  const sam3Masks = useAppStore((s) => s.sam3Masks);
  const sam3MaskScores = useAppStore((s) => s.sam3MaskScores);
  const sam3MaskIndex = useAppStore((s) => s.sam3MaskIndex);
  const setSam3MaskIndex = useAppStore((s) => s.setSam3MaskIndex);
  const setActiveMask = useAppStore((s) => s.setActiveMask);
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);

  const [customMasks, setCustomMasks] = useState<{ id: string; name: string; data: string }[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleAddCustomMask = () => {
    if (!activeMask) {
      setStatusMessage("No active mask to save");
      return;
    }
    const id = `custom-${Date.now()}`;
    const name = `Mask ${customMasks.length + 1}`;
    setCustomMasks((prev) => [...prev, { id, name, data: activeMask }]);
    setSelectedId(id);
    setStatusMessage(`Saved "${name}" to mask list`);
  };

  const handleDeleteCustomMask = (id: string) => {
    setCustomMasks((prev) => prev.filter((m) => m.id !== id));
    if (selectedId === id) {
      setSelectedId(null);
    }
  };

  const handleDuplicateMask = (id: string) => {
    const mask = allMasks.find((m) => m.id === id);
    if (!mask) return;
    const newId = `custom-${Date.now()}`;
    const newName = `${mask.name} (copy)`;
    setCustomMasks((prev) => [...prev, { id: newId, name: newName, data: mask.data }]);
    setSelectedId(newId);
    setStatusMessage(`Duplicated as "${newName}"`);
  };

  const handleSelectMask = (data: string, id: string) => {
    setActiveMask(data);
    setSelectedId(id);
  };

  const handleRenameMask = (id: string, name: string) => {
    setCustomMasks((prev) => prev.map((m) => (m.id === id ? { ...m, name } : m)));
  };

  const allMasks: { id: string; name: string; data: string; score?: number }[] = [
    ...sam3Masks.map((data, i) => ({
      id: `sam3-${i}`,
      name: `SAM3 Mask ${i + 1}`,
      data,
      score: sam3MaskScores[i],
    })),
    ...customMasks.map((m) => ({ id: m.id, name: m.name, data: m.data })),
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, color: "var(--text-muted, #aaa)", fontWeight: 600 }}>Masks</span>
        <div style={{ display: "flex", gap: 4 }}>
          <button
            onClick={() => setMaskVisible(!maskVisible)}
            title={maskVisible ? "Hide mask overlay" : "Show mask overlay"}
            style={{
              padding: "3px 6px",
              fontSize: 10,
              borderRadius: 3,
              border: "none",
              background: maskVisible ? "rgba(74, 144, 217, 0.25)" : "#2a2a2a",
              color: maskVisible ? "#6cf" : "#888",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 3,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>{maskVisible ? "visibility" : "visibility_off"}</span>
            {maskVisible ? "Visible" : "Hidden"}
          </button>
          <button
            onClick={handleAddCustomMask}
            title="Save current mask to list"
            style={{
              padding: "3px 6px",
              fontSize: 10,
              borderRadius: 3,
              border: "none",
              background: "#2a2a2a",
              color: "var(--text-muted, #aaa)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 3,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 12 }}>add</span>
            Save
          </button>
        </div>
      </div>

      {allMasks.length === 0 && (
        <div style={{ fontSize: 10, color: "#666", textAlign: "center", padding: "12px 0" }}>
          No masks saved. Use SAM3 or manual drawing, then click "Save".
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 200, overflowY: "auto" }}>
        {allMasks.map((mask) => {
          const isSelected = mask.id === selectedId || (mask.id === `sam3-${sam3MaskIndex}` && !selectedId);
          const isCustom = mask.id.startsWith("custom-");
          return (
            <div
              key={mask.id}
              onClick={() => {
                handleSelectMask(mask.data, mask.id);
                if (mask.id.startsWith("sam3-")) {
                  const idx = parseInt(mask.id.replace("sam3-", ""));
                  setSam3MaskIndex(idx);
                }
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 6px",
                borderRadius: 4,
                cursor: "pointer",
                background: isSelected ? "rgba(74, 144, 217, 0.15)" : "#1e1e1e",
                border: isSelected ? "1px solid rgba(108, 204, 255, 0.4)" : "1px solid #333",
              }}
            >
              {/* Thumbnail */}
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 3,
                  overflow: "hidden",
                  flexShrink: 0,
                  background: "#111",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {mask.data ? (
                  <img
                    src={mask.data}
                    alt={mask.name}
                    style={{ width: "100%", height: "100%", objectFit: "cover", imageRendering: "pixelated" }}
                  />
                ) : (
                  <span className="material-symbols-outlined" style={{ fontSize: 14, color: "#555" }}>image</span>
                )}
              </div>

              {/* Name + score */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {isCustom ? (
                  <input
                    type="text"
                    value={mask.name}
                    onChange={(e) => handleRenameMask(mask.id, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      width: "100%",
                      background: "transparent",
                      border: "none",
                      color: "#ddd",
                      fontSize: 10,
                      outline: "none",
                    }}
                  />
                ) : (
                  <div style={{ fontSize: 10, color: "#ddd", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {mask.name}
                  </div>
                )}
                {mask.score !== undefined && (
                  <div style={{ fontSize: 9, color: "var(--text-muted, #888)" }}>
                    Score: {mask.score.toFixed(2)}
                  </div>
                )}
              </div>

              {/* Duplicate (all masks) */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDuplicateMask(mask.id);
                }}
                title="Duplicate mask"
                style={{
                  padding: "2px",
                  background: "transparent",
                  border: "none",
                  color: "var(--text-muted, #888)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 12 }}>content_copy</span>
              </button>

              {/* Delete (custom masks only) */}
              {isCustom && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteCustomMask(mask.id);
                  }}
                  title="Delete mask"
                  style={{
                    padding: "2px",
                    background: "transparent",
                    border: "none",
                    color: "var(--text-muted, #888)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 12 }}>delete</span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Active mask indicator */}
      {activeMask && (
        <div style={{ fontSize: 9, color: "#666", textAlign: "center" }}>
          {selectedId ? `Active: ${allMasks.find((m) => m.id === selectedId)?.name ?? "Unknown"}` : "Using active mask"}
        </div>
      )}
    </div>
  );
}
