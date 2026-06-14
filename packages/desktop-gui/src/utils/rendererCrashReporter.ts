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

function logToMain(
  level: "error" | "warn",
  message: string,
  details?: unknown,
) {
  if (window.ipcRenderer) {
    window.ipcRenderer.send("renderer:log", { level, message, details });
  }
}

export function installRendererCrashReporter() {
  window.addEventListener("error", (event) => {
    const { message, filename, lineno, colno, error } = event;
    const msg = `[Renderer] ${message} at ${filename}:${lineno}:${colno}`;
    console.error(msg, error);
    logToMain("error", msg, error instanceof Error ? error.stack : undefined);
    if (isDebug) {
      // In debug mode, show a small overlay so developers notice immediately
      showDebugOverlay(
        "Error",
        msg,
        error instanceof Error ? error.stack : undefined,
      );
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const msg = `[Renderer] Unhandled rejection: ${reason}`;
    console.error(msg);
    logToMain(
      "error",
      msg,
      reason instanceof Error ? reason.stack : String(reason),
    );
    if (isDebug) {
      showDebugOverlay(
        "Unhandled Rejection",
        msg,
        reason instanceof Error ? reason.stack : String(reason),
      );
    }
  });

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

  const strong = document.createElement("strong");
  strong.textContent = title;
  overlay.appendChild(strong);
  overlay.appendChild(document.createElement("br"));

  const code = document.createElement("code");
  code.style.opacity = "0.9";
  code.textContent = message;
  overlay.appendChild(code);

  if (stack) {
    const pre = document.createElement("pre");
    pre.style.marginTop = "8px";
    pre.style.maxHeight = "200px";
    pre.style.overflow = "auto";
    pre.style.opacity = "0.8";
    pre.style.fontSize = "11px";
    pre.textContent = stack;
    overlay.appendChild(pre);
  }

  const btn = document.createElement("button");
  btn.style.cssText =
    "margin-top:8px;padding:4px 8px;background:rgba(255,255,255,0.2);border:none;color:#fff;border-radius:4px;cursor:pointer";
  btn.textContent = "Dismiss";
  btn.addEventListener("click", () => overlay.remove());
  overlay.appendChild(btn);

  document.body.appendChild(overlay);
}
