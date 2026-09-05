import { Component, type ErrorInfo, type ReactNode } from "react";
import { logger } from "../utils/logger";

interface Props {
  children: ReactNode;
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  /** Where this run's log file is, shown on the crash screen. */
  logPath: string | null;
}

/**
 * Production React error boundary.
 *
 * Catches render errors anywhere in the child tree and displays a fallback UI
 * instead of unmounting the entire application. Use at the root and around
 * major panels so a failure in one widget does not take down the whole app.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, logPath: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // logger, not console.error: a release build has no console, so a UI crash
    // -- the single most important thing to have a record of -- was the one
    // failure guaranteed to leave none.
    logger.error("ErrorBoundary", error.message, {
      stack: error.stack?.slice(0, 2000),
      componentStack: info.componentStack?.slice(0, 2000),
    });
    this.props.onError?.(error, info);

    // Surface where the log is. A crash screen that says "try resetting the
    // view" and nothing else leaves the user with no way to report what
    // happened, and the log they would need is in a directory nothing names.
    const internals = (globalThis as Record<string, unknown>).__TAURI_INTERNALS__ as
      | { invoke?: (cmd: string, args?: unknown) => Promise<unknown> }
      | undefined;
    internals?.invoke?.("get_log_path")
      .then((p) => {
        if (typeof p === "string") this.setState({ logPath: p });
      })
      .catch(() => {
        /* no log path available: the crash screen simply omits it */
      });
  }

  private reset = (): void => {
    this.setState({ hasError: false, error: null, logPath: null });
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.fallback) {
      if (typeof this.props.fallback === "function") {
        return this.props.fallback(this.state.error!, this.reset);
      }
      return this.props.fallback;
    }

    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          height: "100vh",
          padding: "2rem",
          background: "var(--bg, #0a0a0b)",
          color: "var(--text, #f0f0f0)",
          fontFamily: "var(--font-body, system-ui, sans-serif)",
          textAlign: "center",
        }}
      >
        <h2 style={{ margin: 0, color: "var(--danger, #ff4d4d)" }}>
          Something went wrong
        </h2>
        <p style={{ maxWidth: "600px", margin: 0, color: "var(--muted, #a0a0a0)" }}>
          The UI hit an unexpected error. You can try resetting the view, or
          reload the app if the problem persists. Details have been written to
          the log file.
        </p>
        {this.state.logPath && (
          <p
            style={{
              maxWidth: "800px",
              margin: 0,
              fontSize: "0.8rem",
              color: "var(--muted, #a0a0a0)",
              wordBreak: "break-all",
              // Selectable: the whole point is that this can be copied into a
              // bug report. The app sets user-select: none globally.
              userSelect: "text",
            }}
          >
            Log: <code>{this.state.logPath}</code>
          </p>
        )}
        {this.state.error && (
          <pre
            style={{
              maxWidth: "800px",
              maxHeight: "200px",
              overflow: "auto",
              padding: "1rem",
              borderRadius: "0.5rem",
              background: "var(--panel, #131314)",
              color: "var(--text, #f0f0f0)",
              fontSize: "0.85rem",
              textAlign: "left",
              width: "100%",
            }}
          >
            {this.state.error.message}
          </pre>
        )}
        <button
          type="button"
          onClick={this.reset}
          style={{
            padding: "0.5rem 1rem",
            borderRadius: "0.375rem",
            border: "none",
            background: "var(--accent, #00f4fe)",
            color: "#0a0a0b",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </div>
    );
  }
}
