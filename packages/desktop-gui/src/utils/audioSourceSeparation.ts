/**
 * Audio source separation stub with IPC architecture for future Demucs integration.
 *
 * Currently provides a simple stereo channel energy split using Web Audio API.
 * Full stem separation (drums, bass, vocals, other) requires a backend model
 * like Demucs or Spleeter, accessible via IPC.
 */

export interface StemTracks {
  drums: Float32Array;
  bass: Float32Array;
  vocals: Float32Array;
  other: Float32Array;
}

export interface SeparationResult {
  stems: StemTracks;
  sampleRate: number;
  duration: number;
}

/**
 * Stub for source separation via Python backend (Demucs/Spleeter).
 *
 * In a full implementation, this would:
 * 1. Send the audio file path to the main process via IPC
 * 2. The main process runs Demucs to generate 4 stem files
 * 3. Stem files are returned and decoded into Float32Arrays
 *
 * For now, this returns a rejected promise with instructions.
 */
export async function separateSources(
  audioFilePath: string,
): Promise<SeparationResult> {
  console.warn(
    `[audioSourceSeparation] Full source separation requires a Python backend model (Demucs/Spleeter) for "${audioFilePath}". ` +
      "Configure the Python backend and implement the IPC handler to enable this feature.",
  );

  // In the future, this will be:
  // return window.ipcRenderer.invoke<SeparationResult>('audio:separate-sources', audioFilePath);

  throw new Error(
    "Source separation not yet implemented. Install Demucs backend and configure IPC handler.",
  );
}

/**
 * Simple stereo channel energy split using Web Audio API.
 * This does NOT perform source separation — it just measures left vs right channel energy.
 */
export function splitStereoChannels(audioBuffer: AudioBuffer): {
  left: Float32Array;
  right: Float32Array;
} {
  const left = audioBuffer.getChannelData(0);
  const right =
    audioBuffer.numberOfChannels > 1
      ? audioBuffer.getChannelData(1)
      : left;
  return { left: new Float32Array(left), right: new Float32Array(right) };
}

/**
 * Calculate energy (RMS) of an audio channel.
 */
export function channelEnergy(channelData: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < channelData.length; i++) {
    sum += channelData[i] * channelData[i];
  }
  return Math.sqrt(sum / channelData.length);
}
