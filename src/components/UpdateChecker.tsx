import { useEffect, useState } from "react";
import { checkForUpdate, installUpdate, type UpdateInfo } from "../lib/tauri";

interface UpdateCheckerProps {
  readonly onClose: () => void;
}

type Status = "checking" | "up-to-date" | "available" | "installing" | "error";

export default function UpdateChecker({ onClose }: UpdateCheckerProps) {
  const [status, setStatus] = useState<Status>("checking");
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const runCheck = () => {
    setStatus("checking");
    setErrorMessage("");
    checkForUpdate()
      .then((result) => {
        setUpdate(result);
        setStatus(result ? "available" : "up-to-date");
      })
      .catch((e) => {
        setErrorMessage(String(e));
        setStatus("error");
      });
  };

  useEffect(() => {
    runCheck();
  }, []);

  const handleInstall = () => {
    setStatus("installing");
    setErrorMessage("");
    installUpdate().catch((e) => {
      // A successful install restarts the app before this ever resolves, so
      // reaching a .catch here means it genuinely failed.
      setErrorMessage(String(e));
      setStatus("error");
    });
  };

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/60 backdrop-blur-md">
      <div
        className="w-full max-w-md neo-panel rounded-xl bg-surface/95 border border-outline/30 shadow-2xl p-6 space-y-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-checker-title"
      >
        <div className="flex items-center justify-between border-b border-outline/20 pb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-accent-teal">system_update</span>
            <h2 id="update-checker-title" className="font-headline-md text-headline-md text-on-surface">
              Check for Updates
            </h2>
          </div>
          <button
            onClick={onClose}
            className="material-symbols-outlined neo-btn p-1 rounded-full text-on-surface-variant hover:text-accent-pink transition-colors"
            aria-label="Close"
          >
            close
          </button>
        </div>

        <div className="space-y-4 min-h-[80px]">
          {status === "checking" && (
            <div className="flex items-center gap-2 text-on-surface-variant">
              <span className="material-symbols-outlined animate-spin">progress_activity</span>
              <span className="font-body-md text-body-md">Checking for updates...</span>
            </div>
          )}

          {status === "up-to-date" && (
            <div className="flex items-center gap-2 text-on-surface-variant">
              <span className="material-symbols-outlined text-accent-teal">check_circle</span>
              <span className="font-body-md text-body-md">You're on the latest version.</span>
            </div>
          )}

          {status === "error" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-accent-pink">
                <span className="material-symbols-outlined">error</span>
                <span className="font-body-md text-body-md">Update check failed.</span>
              </div>
              <p className="font-code-sm text-code-sm text-on-surface-variant break-words">{errorMessage}</p>
              <button
                onClick={runCheck}
                className="px-3 py-1.5 font-label-md text-label-md rounded neo-btn text-accent-teal hover:text-accent-pink transition-colors"
              >
                Retry
              </button>
            </div>
          )}

          {(status === "available" || status === "installing") && update && (
            <div className="space-y-3">
              <div>
                <p className="font-label-md text-label-md text-on-surface">
                  Version {update.version} is available
                </p>
                {update.date && (
                  <p className="font-label-sm text-label-sm text-on-surface-variant">{update.date}</p>
                )}
              </div>
              {update.body && (
                <pre className="font-code-sm text-code-sm text-on-surface-variant whitespace-pre-wrap max-h-40 overflow-y-auto bg-surface-container-low rounded p-3">
                  {update.body}
                </pre>
              )}
              {status === "installing" && (
                <div className="flex items-center gap-2 text-on-surface-variant">
                  <span className="material-symbols-outlined animate-spin">progress_activity</span>
                  <span className="font-body-sm text-body-sm">
                    Downloading and installing — the app will restart automatically...
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-outline/20">
          <button
            onClick={onClose}
            disabled={status === "installing"}
            className="px-4 py-1.5 font-label-md text-label-md text-on-surface-variant hover:text-on-surface transition-colors disabled:opacity-50"
          >
            {status === "available" ? "Later" : "Close"}
          </button>
          {status === "available" && (
            <button
              onClick={handleInstall}
              className="px-4 py-1.5 font-label-md text-label-md font-semibold rounded bg-accent-teal text-surface hover:brightness-110 transition shadow-md"
            >
              Install &amp; Restart
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
