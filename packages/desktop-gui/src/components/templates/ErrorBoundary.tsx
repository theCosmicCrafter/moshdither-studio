import React from "react";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Production Error Boundary for MoshDither Studio.
 *
 * Catches JavaScript errors anywhere in the child component tree,
 * logs them, and displays a fallback UI instead of crashing the app.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary] Caught error:", error);
    console.error("[ErrorBoundary] Component stack:", errorInfo.componentStack);
    // Future: send to telemetry (Sentry, etc.)
  }

  override render() {
    if (this.state.hasError) {
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
            height: "100vh",
            padding: "24px",
            background: "var(--bg-primary, #0a0a0f)",
            color: "var(--text-primary, #e8e8ed)",
            fontFamily: "system-ui, sans-serif",
            textAlign: "center",
          }}
        >
          <h2 style={{ marginBottom: "12px", color: "var(--accent-danger, #ff3b30)" }}>
            Something went wrong
          </h2>
          <p style={{ opacity: 0.7, maxWidth: 480, lineHeight: 1.5 }}>
            The application encountered an unexpected error. Please reload the window
            or contact support if the issue persists.
          </p>
          <pre
            style={{
              marginTop: "16px",
              padding: "12px 16px",
              background: "rgba(255,255,255,0.05)",
              borderRadius: "8px",
              fontSize: "12px",
              maxWidth: 640,
              overflow: "auto",
              textAlign: "left",
            }}
          >
            {this.state.error?.message}
          </pre>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: "24px",
              padding: "10px 20px",
              background: "var(--accent-primary, #0a84ff)",
              color: "#fff",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Reload Application
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
