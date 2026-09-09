/**
 * Audio-binding channel names, and how to take them apart again.
 *
 * A channel is named `${stackId}.${paramId}` -- and a stack id is built as
 * `${effectId}-${timestamp}-${rand}` where effectId is itself dotted
 * ("dither.bayer"). So splitting on the FIRST dot is wrong; parameter ids
 * never contain one, so the last dot is the boundary.
 */
export function audioChannelName(stackId: string, paramId: string): string {
  return `${stackId}.${paramId}`;
}

export function splitAudioChannelName(
  channel: string
): { stackId: string; paramId: string } | null {
  const dot = channel.lastIndexOf(".");
  if (dot <= 0 || dot === channel.length - 1) return null;
  return { stackId: channel.slice(0, dot), paramId: channel.slice(dot + 1) };
}
