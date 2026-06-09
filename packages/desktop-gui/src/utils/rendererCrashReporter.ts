/**
 * Renderer-process crash reporter for MoshDither Studio.
 *
 * Catches window.onerror and unhandled promise rejections,
 * logs them to the main process via IPC, and shows a user-facing
 * message when DEBUG mode is enabled.
 */

const isDebug =
  new URLSearchParams(window.location.search).has("debug") ||
  (window as unknown as { DEBUG?: boolean }).DEBUG === true;

function logToMain(level: "error" | "warn", message: string, details?: unknown) {
  if (window.ipcRenderer) {
    window.ipcRenderer.send("renderer:log", { level, message, details });
  }
}

export function installRendererCrashReporter() {
  window.onerror = (message, source, lineno, colno, error) => {
    const msg = `[Renderer] ${message} at ${source}:${lineno}:${colno}`;
    console.error(msg, error);
    logToMain("error", msg, error?.stack);
    if (isDebug) {
      // In debug mode, show a small overlay so developers notice immediately
      showDebugOverlay("Error", msg, error?.stack);
    }
    return false; // Let default handler run too
  };

  window.onunhandledrejection = (event) => {
    const reason = event.reason;
    const msg = `[Renderer] Unhandled rejection: ${reason}`;
    console.error(msg);
    logToMain("error", msg, reason instanceof Error ? reason.stack : String(reason));
    if (isDebug) {
      showDebugOverlay("Unhandled Rejection", msg, reason instanceof Error ? reason.stack : String(reason));
    }
  };

  console.log("[CrashReporter] Renderer process installed.");
}

function showDebugOverlay(title: string, message: string, stack?: string) {
  const existing = document.getElementById("debug-crash-overlay");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "debug-crash-overlay";
  overlay.style.cssText = `
    position:fixed;top:8px;right:8px;z-index:99999;
    background:rgba(180,40,40,0.95);color:#fff;
    padding:12px 16px;border-radius:8px;
    font-family:monospace;font-size:12px;
    max-width:480px;word-break:break-word;
    box-shadow:0 4px 16px rgba(0,0,0,0.4);
  `;
  overlay.innerHTML = `
    <strong>${title}</strong><br/>
    <code style="opacity:0.9">${message}</code>
    ${stack ? `<pre style="margin-top:8px;max-height:200px;overflow:auto;opacity:0.8;font-size:11px">${stack}</pre>` : ""}
    <button style="margin-top:8px;padding:4px 8px;background:rgba(255,255,255,0.2);border:none;color:#fff;border-radius:4px;cursor:pointer">Dismiss</button>
  `;
  overlay.querySelector("button")?.addEventListener("click", () => overlay.remove());
  document.body.appendChild(overlay);
}
