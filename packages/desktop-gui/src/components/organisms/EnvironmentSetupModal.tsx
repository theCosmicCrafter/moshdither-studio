/**
 * Environment Setup Modal
 *
 * Shown on first launch (or when env mode is "unconfigured").
 * Offers two paths:
 *   1. "Install Local Environment" — auto-downloads / installs Python venv,
 *      pip packages, FFmpeg, and FFglitch (Windows).
 *   2. "Use System PATH" — assumes the user already has Python, FFmpeg,
 *      and FFglitch installed and on their PATH.
 *
 * macOS / Linux caveat:
 *   FFglitch is Windows-only from the official builds. On macOS/Linux the
 *   installer skips FFglitch and shows a note directing the user to
 *   docs/FFGLITCH_MAC_LINUX.md for build-from-source instructions.
 */

import React, { useEffect, useState, useCallback } from "react";
import { Button } from "../atoms/Button";

export interface EnvStatusPayload {
  mode: "local" | "system" | "unconfigured";
  pythonOk: boolean;
  venvOk: boolean;
  pipOk: boolean;
  ffmpegOk: boolean;
  ffprobeOk: boolean;
  ffglitchOk: boolean;
  pythonPath?: string;
  ffmpegPath?: string;
  ffprobePath?: string;
  ffgacPath?: string;
  ffeditPath?: string;
  installInProgress?: boolean;
  installCheckpoint?: {
    startedAt: string;
    completedSteps: string[];
    lastStep: string;
    percent: number;
  };
}

export interface InstallProgressPayload {
  step: string;
  percent: number;
  detail?: string;
}

interface EnvironmentSetupModalProps {
  onComplete: () => void;
  onDismiss?: () => void;
}

export const EnvironmentSetupModal: React.FC<EnvironmentSetupModalProps> = ({
  onComplete,
  onDismiss,
}) => {
  const [status, setStatus] = useState<EnvStatusPayload | null>(null);
  const [phase, setPhase] = useState<
    "choose" | "resume" | "installing" | "done" | "error"
  >("choose");
  const [progress, setProgress] = useState<InstallProgressPayload | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isWindows] = useState(() => navigator.userAgent.includes("Windows"));

  const fetchStatus = useCallback(async () => {
    try {
      const result = (await window.ipcRenderer.invoke(
        "env:status",
      )) as EnvStatusPayload;
      setStatus(result);
      if (result.mode === "local" && result.installInProgress) {
        // Installation was interrupted — show resume screen
        setPhase("resume");
        return;
      }
      if (result.mode !== "unconfigured") {
        // Already configured; skip the modal
        onComplete();
      }
    } catch {
      // If IPC fails, assume system mode so the app at least starts
      onComplete();
    }
  }, [onComplete]);

  useEffect(() => {
    // Fetch environment status on mount — legitimate initialization pattern
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    // Listen for installation progress from main process
    const handler = (
      _event: unknown,
      payload: unknown,
    ) => {
      setProgress(payload as InstallProgressPayload);
    };
    const unsub = window.ipcRenderer.on("env:install-progress", handler);
    return () => unsub();
  }, []);

  async function handleInstallLocal() {
    setPhase("installing");
    setProgress({ step: "Starting…", percent: 0 });
    try {
      const result = (await window.ipcRenderer.invoke(
        "env:install-local",
      )) as { ok: boolean; error?: string; status?: EnvStatusPayload };
      if (result.ok && result.status) {
        setStatus(result.status);
        setPhase("done");
      } else {
        setErrorMsg(result.error || "Installation failed.");
        setPhase("error");
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }

  async function handleUseSystem() {
    try {
      await window.ipcRenderer.invoke("env:set-mode", "system");
      onComplete();
    } catch {
      onComplete();
    }
  }

  if (!status && phase === "choose") {
    return (
      <div
        style={overlayStyle}
      >
        <div style={modalStyle}>
          <h2 style={titleStyle}>Welcome to MoshDither Studio</h2>
          <p style={textStyle}>Checking environment…</p>
        </div>
      </div>
    );
  }

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        {phase === "choose" && (
          <>
            <h2 style={titleStyle}>Backend Environment</h2>
            <p style={textStyle}>
              MoshDither Studio needs a Python backend and FFmpeg to process
              video. Choose how you want to set this up:
            </p>

            <div style={optionsStyle}>
              <button
                style={optionButtonStyle}
                onClick={handleInstallLocal}
              >
                <span style={optionTitleStyle}>
                  Install Local Environment
                </span>
                <span style={optionDescStyle}>
                  Automatically downloads and installs Python, FFmpeg, and
                  dependencies into an isolated folder. Recommended for most
                  users.
                </span>
                {!isWindows && (
                  <span style={cautionStyle}>
                    Note: FFglitch is not available for your platform.
                    Datamoshing effects will be limited until you manually build
                    FFglitch from source.
                  </span>
                )}
              </button>

              <button
                style={optionButtonStyle}
                onClick={handleUseSystem}
              >
                <span style={optionTitleStyle}>Use System PATH</span>
                <span style={optionDescStyle}>
                  Use your existing Python, FFmpeg, and FFglitch installations.
                  Make sure they are available on your system PATH.
                </span>
              </button>
            </div>

            {onDismiss && (
              <Button variant="ghost" size="sm" onClick={onDismiss}>
                Skip for now
              </Button>
            )}
          </>
        )}

        {phase === "resume" && status?.installCheckpoint && (
          <>
            <h2 style={titleStyle}>Resume Installation</h2>
            <p style={textStyle}>
              A previous installation was interrupted at{" "}
              <strong>{status.installCheckpoint.lastStep}</strong>{" "}
              ({Math.round(status.installCheckpoint.percent)}%).
              You can resume where it left off, or switch to system PATH.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "8px" }}>
              <Button variant="glass" onClick={handleInstallLocal}>
                Resume Installation
              </Button>
              <Button variant="ghost" onClick={handleUseSystem}>
                Use System PATH Instead
              </Button>
              {onDismiss && (
                <Button variant="ghost" size="sm" onClick={onDismiss}>
                  Skip for now
                </Button>
              )}
            </div>
          </>
        )}

        {phase === "installing" && progress && (
          <>
            <h2 style={titleStyle}>Installing…</h2>
            <p style={textStyle}>{progress.step}</p>
            {progress.detail && (
              <p style={detailStyle}>{progress.detail}</p>
            )}
            <div style={progressBarContainerStyle}>
              <div
                style={{
                  ...progressBarFillStyle,
                  width: `${progress.percent}%`,
                }}
              />
            </div>
            <p style={percentStyle}>{Math.round(progress.percent)}%</p>
          </>
        )}

        {phase === "done" && (
          <>
            <h2 style={titleStyle}>Ready!</h2>
            <p style={textStyle}>
              Your local environment is set up and ready to use.
            </p>
            <Button variant="glass" onClick={onComplete}>
              Get Started
            </Button>
          </>
        )}

        {phase === "error" && (
          <>
            <h2 style={{ ...titleStyle, color: "#ff5050" }}>
              Installation Error
            </h2>
            <p style={textStyle}>{errorMsg}</p>
            <div style={{ display: "flex", gap: "12px", marginTop: "16px" }}>
              <Button variant="glass" onClick={() => setPhase("choose")}>
                Try Again
              </Button>
              <Button variant="ghost" onClick={handleUseSystem}>
                Use System PATH Instead
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.85)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 9999,
};

const modalStyle: React.CSSProperties = {
  background: "#141419",
  border: "1px solid #2E2E38",
  borderRadius: "12px",
  padding: "32px",
  maxWidth: "520px",
  width: "90%",
  display: "flex",
  flexDirection: "column",
  gap: "16px",
};

const titleStyle: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: 600,
  color: "#E8E8EC",
  margin: 0,
};

const textStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "#9CA3AF",
  lineHeight: 1.5,
  margin: 0,
};

const detailStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#6B7280",
  margin: 0,
};

const optionsStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "12px",
  marginTop: "8px",
};

const optionButtonStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "6px",
  padding: "16px",
  background: "rgba(255,255,255,0.03)",
  border: "1px solid #2E2E38",
  borderRadius: "8px",
  cursor: "pointer",
  textAlign: "left",
  transition: "background 0.15s",
};

const optionTitleStyle: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: 600,
  color: "#E8E8EC",
};

const optionDescStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#9CA3AF",
  lineHeight: 1.4,
};

const cautionStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "#F59E0B",
  lineHeight: 1.4,
  marginTop: "4px",
};

const progressBarContainerStyle: React.CSSProperties = {
  width: "100%",
  height: "8px",
  background: "#1c1c1e",
  borderRadius: "4px",
  overflow: "hidden",
};

const progressBarFillStyle: React.CSSProperties = {
  height: "100%",
  background: "#00D4AA",
  borderRadius: "4px",
  transition: "width 0.3s ease",
};

const percentStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "#9CA3AF",
  textAlign: "center",
  margin: 0,
};
