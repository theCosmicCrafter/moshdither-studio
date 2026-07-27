/**
 * Extract the display filename from a potentially full file path.
 * Handles both Windows (\\) and Unix (/) separators.
 */
export function getFileName(filePath: string | null | undefined): string | null {
  if (!filePath) return null;
  return filePath.split(/[\\/]/).pop() || filePath;
}
