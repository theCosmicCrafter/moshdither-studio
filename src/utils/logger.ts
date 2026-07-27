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
    console.warn(format(category, message, ctx));
  },

  /** Error — always emitted. */
  error(category: string, message: string, ctx?: Context): void {
    console.error(format(category, message, ctx));
  },
};
