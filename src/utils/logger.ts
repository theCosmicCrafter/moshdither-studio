/**
 * Structured logging utility.
 *
 * - `log` and `debug` are stripped from production builds (no-op when
 *   `import.meta.env.PROD` is true). This keeps the release console clean
 *   without requiring manual removal of every diagnostic print.
 * - `warn` and `error` are always emitted so genuine problems surface in
 *   production.
 *
 * All calls accept a category tag for grep-ability and optional structured
 * context, mirroring the `[CATEGORY] message` convention already used across
 * the codebase.
 */

type Context = Record<string, unknown>;

/**
 * Mirror warnings and errors into the app's log file.
 *
 * Release builds detach the console and ship no devtools, so `console.error`
 * goes nowhere a user or a later investigation can reach: a failure in the
 * frontend left the log file showing nothing but a clean startup. Forwarding is
 * fire-and-forget -- a logger that throws while reporting a problem replaces
 * the original failure with its own.
 */
function forward(level: "warn" | "error", line: string): void {
  try {
    const g = globalThis as Record<string, unknown>;
    if (!("__TAURI_INTERNALS__" in g)) return;
    void (g.__TAURI_INTERNALS__ as { invoke: (c: string, a: unknown) => Promise<unknown> })
      .invoke("log_frontend", { level, message: line })
      .catch(() => {});
  } catch {
    /* never let logging break the thing it is reporting on */
  }
}

function format(category: string, message: string, ctx?: Context): string {
  return ctx ? `[${category}] ${message} ${JSON.stringify(ctx)}` : `[${category}] ${message}`;
}

export const logger = {
  /** Diagnostic log — dev only. No-op in production builds. */
  log(category: string, message: string, ctx?: Context): void {
    if (import.meta.env.PROD) return;
    console.log(format(category, message, ctx));
  },

  /** Verbose debug — dev only. No-op in production builds. */
  debug(category: string, message: string, ctx?: Context): void {
    if (import.meta.env.PROD) return;
    console.debug(format(category, message, ctx));
  },

  /** Warning — always emitted. */
  warn(category: string, message: string, ctx?: Context): void {
    const line = format(category, message, ctx);
    console.warn(line);
    forward("warn", line);
  },

  /** Error — always emitted. */
  error(category: string, message: string, ctx?: Context): void {
    const line = format(category, message, ctx);
    console.error(line);
    forward("error", line);
  },
};
