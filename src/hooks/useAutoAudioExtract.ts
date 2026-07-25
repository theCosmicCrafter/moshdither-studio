import { convertFileSrc } from "@tauri-apps/api/core";
import { useEffect, useRef } from "react";
import { AudioFeatureExtractor } from "../engine/audio/AudioFeatureExtractor";
import { extractAudioFromVideo } from "../lib/tauri";
import { useAppStore } from "../store";

/**
 * useAutoAudioExtract — Auto-extracts audio from a loaded video and bakes
 * AudioBakeData for audio-reactive effects.
 *
 * Mirrors the TouchDesigner `Audio Movie CHOP` pattern: when a video with
 * an embedded audio track is loaded, the audio is auto-extracted and
 * analyzed so audio-reactive effects work without a manual audio load.
 *
 * Triggers when:
 *   - `filePath` changes to a video file, AND
 *   - the effect stack contains at least one `audio_reactive.*` effect, AND
 *   - the user hasn't manually loaded a separate audio file (audioFilePath
 *     is null — manual load takes precedence).
 *
 * Sets `audioIsSilent` in the store when the source has no audio stream or
 * the baked features are all near-zero, so the UI can show a warning.
 */
export function useAutoAudioExtract() {
  const filePath = useAppStore((s) => s.filePath);
  const effectStack = useAppStore((s) => s.effectStack);
  const audioFilePath = useAppStore((s) => s.audioFilePath);
  const setAudioBakeData = useAppStore((s) => s.setAudioBakeData);
  const setAudioFilePath = useAppStore((s) => s.setAudioFilePath);
  const setAudioEnabled = useAppStore((s) => s.setAudioEnabled);
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);
  const setAudioManifestProgress = useAppStore((s) => s.setAudioManifestProgress);

  // Track the last path we extracted for, so we don't re-extract on every
  // effect-stack change.
  const lastExtractedRef = useRef<string | null>(null);
  // Track the in-flight extraction so we don't start a second one for the
  // same video while the first is still running.
  const inflightRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (!filePath) {
      lastExtractedRef.current = null;
      return;
    }

    // Only auto-extract for video files (not images). We use the file
    // extension because mediaInfo doesn't carry a type field.
    const isVideo = /\.(mp4|mov|mkv|webm|avi|mpeg|mpg)$/i.test(filePath);
    if (!isVideo) {
      lastExtractedRef.current = null;
      return;
    }

    // Only auto-extract if the stack has an audio-reactive effect.
    const hasAudioReactive = effectStack.some(
      (e) => e.enabled && e.effectId.startsWith("audio_reactive.")
    );
    if (!hasAudioReactive) {
      // Don't clear an existing bake — the user might add an audio-reactive
      // effect later and we want to reuse the bake. But also don't extract
      // if there's nothing to drive.
      return;
    }

    // Manual audio load takes precedence — if the user loaded a separate
    // audio file, don't overwrite their bake.
    if (audioFilePath) {
      return;
    }

    // Already extracted for this video.
    if (lastExtractedRef.current === filePath) {
      return;
    }

    // Skip if an extraction for a different video is in flight.
    if (inflightRef.current) {
      return;
    }

    const extractPromise = (async () => {
      try {
        setAudioManifestProgress(0, "Extracting audio from video...");
        const wavPath = await extractAudioFromVideo(filePath);
        lastExtractedRef.current = filePath;

        setAudioManifestProgress(0.2, "Analyzing audio features...");
        // Load the extracted WAV as a File via the Tauri asset protocol.
        const url = convertFileSrc(wavPath);
        const resp = await fetch(url);
        if (!resp.ok) {
          throw new Error(`Failed to fetch extracted audio: ${resp.status}`);
        }
        const ab = await resp.arrayBuffer();
        const file = new File([ab], "extracted.wav", { type: "audio/wav" });

        const manifest = await AudioFeatureExtractor.extractManifestFromFile(
          file,
          { fps: 30 },
          (progress, phase) => setAudioManifestProgress(0.2 + progress * 0.8, phase)
        );

        // Detect silent audio: if RMS is below 0.01 across all frames, flag it.
        const maxRms = manifest.frames.reduce((m, f) => Math.max(m, f.rms), 0);
        const isSilent = maxRms < 0.01;
        if (isSilent) {
          useAppStore.getState().setAudioIsSilent(true);
          setStatusMessage("Source audio is silent — audio-reactive effects won't respond");
        } else {
          useAppStore.getState().setAudioIsSilent(false);
        }

        const bakeData = AudioFeatureExtractor.manifestToBakeData(manifest);
        setAudioBakeData(bakeData);
        // Set audioFilePath to the extracted WAV so the manifest engine can
        // play it back. The user can still override by loading a different
        // file via AudioPanel.
        setAudioFilePath(wavPath);
        setAudioEnabled(true);
        setAudioManifestProgress(1, "Audio ready");
        if (!isSilent) {
          setStatusMessage(`Audio extracted: ${manifest.frames.length} frames baked`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("no audio stream")) {
          useAppStore.getState().setAudioIsSilent(true);
          setStatusMessage(
            "Video has no audio track — load a separate audio file for audio-reactive effects"
          );
        } else {
          // Don't spam the status bar on every load failure — log to console
          // and set a muted status. The user can still load audio manually.
          console.warn("[useAutoAudioExtract] Auto-extract failed:", msg);
          setStatusMessage("Audio auto-extract failed (see console)");
        }
        setAudioManifestProgress(0, "");
      } finally {
        inflightRef.current = null;
      }
    })();

    inflightRef.current = extractPromise;
  }, [
    filePath,
    effectStack,
    audioFilePath,
    setAudioBakeData,
    setAudioFilePath,
    setAudioEnabled,
    setStatusMessage,
    setAudioManifestProgress,
  ]);
}
