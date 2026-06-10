/**
 * AudioReactiveContext — Provides audio features to the React tree and a ref
 * for shader uniform wiring without triggering re-renders.
 */

import * as React from "react";
import {
  useAudioReactive,
  type AudioFeatures,
} from "../hooks/useAudioReactive";

export interface AudioReactiveContextValue {
  features: AudioFeatures;
  featuresRef: React.RefObject<AudioFeatures>;
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

export const AudioReactiveContext = React.createContext<AudioReactiveContextValue | null>(
  null,
);

interface AudioReactiveProviderProps {
  children: React.ReactNode;
  mediaUrl: string | null;
}

export const AudioReactiveProvider: React.FC<AudioReactiveProviderProps> = ({
  children,
  mediaUrl,
}) => {
  const [enabled, setEnabled] = React.useState(false);
  const [audioRev, setAudioRev] = React.useState(0);
  const audioElementRef = React.useRef<HTMLAudioElement | null>(null);

  // Create and manage audio element for analysis
  React.useEffect(() => {
    if (!mediaUrl) {
      const prev = audioElementRef.current;
      if (prev) {
        prev.pause();
        prev.src = "";
        audioElementRef.current = null;
        queueMicrotask(() => setAudioRev((r) => r + 1));
      }
      return;
    }

    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.src = mediaUrl;
    audio.loop = true;
    audio.play().catch(() => {
      // Autoplay blocked — user must interact first
    });
    audioElementRef.current = audio;
    queueMicrotask(() => setAudioRev((r) => r + 1));

    return () => {
      audio.pause();
      audio.src = "";
      audioElementRef.current = null;
      queueMicrotask(() => setAudioRev((r) => r + 1));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaUrl]);

  const { features, featuresRef } = useAudioReactive({
    mediaElement: audioElementRef.current,
    enabled: enabled && !!mediaUrl,
  });

  const value = React.useMemo(
    () => ({ features, featuresRef, enabled, setEnabled }),
    // audioRev ensures the memo updates when the audio element changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [features, featuresRef, enabled, audioRev],
  );

  return (
    <AudioReactiveContext.Provider value={value}>
      {children}
    </AudioReactiveContext.Provider>
  );
};
