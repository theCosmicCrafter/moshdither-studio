/**
 * AudioReactiveContext — Provides audio features to the React tree and a ref
 * for shader uniform wiring without triggering re-renders.
 */

import * as React from "react";
import { useAudioReactive } from "../hooks/useAudioReactive";
import {
  AudioReactiveRefContext,
  AudioReactiveFeaturesContext,
} from "./audioReactiveContextDef";

interface AudioReactiveProviderProps {
  children: React.ReactNode;
  mediaUrl: string | null;
}

export const AudioReactiveProvider: React.FC<AudioReactiveProviderProps> = ({
  children,
  mediaUrl,
}) => {
  const [enabled, setEnabled] = React.useState(false);
  const [audioElement, setAudioElement] =
    React.useState<HTMLAudioElement | null>(null);

  // Create and manage audio element for analysis
  React.useEffect(() => {
    if (!mediaUrl) {
      queueMicrotask(() => setAudioElement(null));
      return;
    }

    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.src = mediaUrl;
    audio.loop = true;
    audio.play().catch(() => {
      // Autoplay blocked — user must interact first
    });
    queueMicrotask(() => setAudioElement(audio));

    return () => {
      audio.pause();
      audio.src = "";
      queueMicrotask(() =>
        setAudioElement((current) => (current === audio ? null : current)),
      );
    };
  }, [mediaUrl]);

  const { features, featuresRef } = useAudioReactive({
    mediaElement: audioElement,
    enabled: enabled && !!mediaUrl,
  });

  const refValue = React.useMemo(
    () => ({ featuresRef, enabled, setEnabled }),
    [featuresRef, enabled],
  );

  const featuresValue = React.useMemo(
    () => ({ features }),
    [features],
  );

  return (
    <AudioReactiveRefContext.Provider value={refValue}>
      <AudioReactiveFeaturesContext.Provider value={featuresValue}>
        {children}
      </AudioReactiveFeaturesContext.Provider>
    </AudioReactiveRefContext.Provider>
  );
};
