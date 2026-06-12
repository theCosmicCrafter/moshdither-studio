/**
 * Context definitions for audio-reactive features, kept in a non-component
 * file so React Fast Refresh works for the provider component.
 *
 * Split into two contexts to prevent 16fps re-renders in components
 * that only need the stable ref (e.g., WebGLCanvas shader uniforms).
 */

import * as React from "react";
import type { AudioFeatures } from "../hooks/useAudioReactive";

/** Stable context — value only changes when enabled/toggle changes. */
export interface AudioReactiveRefValue {
  featuresRef: React.RefObject<AudioFeatures>;
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

/** Reactive context — value changes at ~16fps with new audio features. */
export interface AudioReactiveFeaturesValue {
  features: AudioFeatures;
}

export const AudioReactiveRefContext =
  React.createContext<AudioReactiveRefValue | null>(null);

export const AudioReactiveFeaturesContext =
  React.createContext<AudioReactiveFeaturesValue | null>(null);
