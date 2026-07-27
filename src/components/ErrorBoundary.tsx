import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
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
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[ErrorBoundary] Caught error:", error, info.componentStack);
    this.props.onError?.(error, info);
  }

  private reset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.fallback) {
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
          reload the app if the problem persists.
        </p>
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
