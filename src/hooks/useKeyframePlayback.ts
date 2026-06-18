import { useEffect } from "react";
import { useAppStore } from "../store";

/** Watches currentTime and updates effect stack parameters based on keyframe interpolation */
export function useKeyframePlayback() {
  const currentTime = useAppStore((s) => s.currentTime);
  const effectStack = useAppStore((s) => s.effectStack);
  const keyframes = useAppStore((s) => s.keyframes);
  const getKeyframeValue = useAppStore((s) => s.getKeyframeValue);
  const updateStackParams = useAppStore((s) => s.updateStackParams);

  useEffect(() => {
    // For each stack entry with keyframes, update params at current time
    for (const entry of effectStack) {
      const entryKeyframes = keyframes[entry.id];
      if (!entryKeyframes) continue;

      const updates: Record<string, number> = {};
      for (const paramId of Object.keys(entryKeyframes)) {
        const val = getKeyframeValue(entry.id, paramId, currentTime);
        if (val !== null) {
          updates[paramId] = val;
        }
      }

      if (Object.keys(updates).length > 0) {
        updateStackParams(entry.id, updates);
      }
    }
  }, [currentTime, effectStack, keyframes, getKeyframeValue, updateStackParams]);
}
