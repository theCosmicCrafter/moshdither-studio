/**
 * Context definition for audio-reactive features, kept in a non-component
 * file so React Fast Refresh works for the provider component.
 */

import * as React from "react";
import type { AudioFeatures } from "../hooks/useAudioReactive";

export interface AudioReactiveContextValue {
  features: AudioFeatures;
  featuresRef: React.RefObject<AudioFeatures>;
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

export const AudioReactiveContext =
  React.createContext<AudioReactiveContextValue | null>(null);
