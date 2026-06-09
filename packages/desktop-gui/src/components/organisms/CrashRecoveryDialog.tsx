import * as React from "react";
import { useStudio } from "../../context/StudioContext";
import type { SerializedProject } from "../../utils/autoSave";

interface Props {
  autoSaveData: SerializedProject | null;
  onDismiss: () => void;
}

export const CrashRecoveryDialog: React.FC<Props> = ({
  autoSaveData,
  onDismiss,
}) => {
  const {
    setActiveEffects,
    setMediaUrl,
    setMediaType,
    setCurrentTime,
    setDuration,
    setQualityMode,
    setZoomLevel,
    setPixelGrid,
    setAspectRatio,
    setExportFormat,
    setExportFps,
    setOutputDirectory,
    addToast,
  } = useStudio();

  const handleRestore = () => {
    if (!autoSaveData) return;

    setActiveEffects(autoSaveData.activeEffects);
    setMediaUrl(autoSaveData.mediaUrl);
    setMediaType(autoSaveData.mediaType);
    setCurrentTime(autoSaveData.currentTime);
    setDuration(autoSaveData.duration);
    setQualityMode(autoSaveData.qualityMode);
    setZoomLevel(autoSaveData.zoomLevel);
    setPixelGrid(autoSaveData.pixelGrid);
    setAspectRatio(autoSaveData.aspectRatio);
    setExportFormat(autoSaveData.exportFormat);
    setExportFps(autoSaveData.exportFps);
    setOutputDirectory(autoSaveData.outputDirectory);

    addToast("Session restored from auto-save", "success");
    onDismiss();
  };

  const handleDiscard = () => {
    onDismiss();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(8px)",
      }}
    >
      <div
        style={{
          background: "var(--surface-elevated, #14141a)",
          border: "1px solid var(--border-subtle, rgba(255,255,255,0.08))",
          borderRadius: "16px",
          padding: "32px",
          maxWidth: 480,
          width: "90%",
          boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
        }}
      >
        <h2
          style={{
            margin: 0,
            marginBottom: "12px",
            fontSize: "20px",
            fontWeight: 700,
            color: "var(--text-primary, #e8e8ed)",
          }}
        >
          Recover Session?
        </h2>
        <p
          style={{
            margin: 0,
            marginBottom: "8px",
            fontSize: "14px",
            lineHeight: 1.6,
            color: "var(--text-secondary, #a0a0b0)",
          }}
        >
          MoshDither Studio did not shut down cleanly. We found an auto-saved
          session from{" "}
          {autoSaveData
            ? new Date(autoSaveData.savedAt).toLocaleString()
            : "an unknown time"}
          .
        </p>
        {autoSaveData && (
          <div
            style={{
              marginTop: "16px",
              padding: "12px 16px",
              background: "rgba(255,255,255,0.03)",
              borderRadius: "8px",
              fontSize: "13px",
              color: "var(--text-secondary, #a0a0b0)",
            }}
          >
            <div>
              <strong>Effects:</strong> {autoSaveData.activeEffects.length}
            </div>
            <div>
              <strong>Media:</strong>{" "}
              {autoSaveData.mediaUrl
                ? autoSaveData.mediaUrl.split("/").pop()
                : "None"}
            </div>
            <div>
              <strong>Export format:</strong> {autoSaveData.exportFormat}
            </div>
          </div>
        )}
        <div
          style={{
            marginTop: "24px",
            display: "flex",
            gap: "12px",
            justifyContent: "flex-end",
          }}
        >
          <button
            onClick={handleDiscard}
            style={{
              padding: "10px 20px",
              borderRadius: "8px",
              border: "1px solid var(--border-subtle, rgba(255,255,255,0.1))",
              background: "transparent",
              color: "var(--text-secondary, #a0a0b0)",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: 500,
            }}
          >
            Discard
          </button>
          <button
            onClick={handleRestore}
            style={{
              padding: "10px 20px",
              borderRadius: "8px",
              border: "none",
              background: "var(--accent-primary, #0a84ff)",
              color: "#fff",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            Restore Session
          </button>
        </div>
      </div>
    </div>
  );
};
