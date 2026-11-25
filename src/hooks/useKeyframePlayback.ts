import { useEffect } from "react";
import { useAppStore } from "../store";

/**
 * Watches currentTime and writes modulated effect stack parameters:
 * keyframe interpolation plus LFO modulation, resolved through
 * `resolveModulatedValue` -- the same math the export bakes per frame.
 * Audio bindings continue to ride over the top via AudioParameterMapper,
 * matching the export's "audio wins" ordering.
 */
export function useKeyframePlayback() {
  const currentTime = useAppStore((s) => s.currentTime);
  const keyframes = useAppStore((s) => s.keyframes);
  const lfos = useAppStore((s) => s.lfos);

  useEffect(() => {
    const { effectStack, resolveModulatedValue, updateStackParamsSilent } =
      useAppStore.getState();
    // For each stack entry with keyframes or LFOs, update params at current time
    for (const entry of effectStack) {
      const entryKeyframes = keyframes[entry.id];
      const entryLfos = lfos[entry.id];
      if (!entryKeyframes && !entryLfos) continue;

      const updates: Record<string, number> = {};
      const paramIds = new Set([
        ...Object.keys(entryKeyframes ?? {}),
        ...Object.keys(entryLfos ?? {}),
      ]);
      for (const paramId of paramIds) {
        const val = resolveModulatedValue(entry.id, paramId, currentTime);
        if (val !== null) {
          updates[paramId] = val;
        }
      }

      if (Object.keys(updates).length > 0) {
        updateStackParamsSilent(entry.id, updates);
      }
    }
  }, [currentTime, keyframes, lfos]);
}
