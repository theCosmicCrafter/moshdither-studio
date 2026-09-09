/**
 * mm:ss.hh -- the transport readout format, shared so the status bar, the
 * timeline and the export panel all agree on how a time looks.
 */
export function formatTimecode(t: number): string {
  const safe = Number.isFinite(t) && t > 0 ? t : 0;
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  const hundredths = Math.floor((safe % 1) * 100);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${hundredths
    .toString()
    .padStart(2, "0")}`;
}
