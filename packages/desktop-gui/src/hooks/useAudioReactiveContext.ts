import * as React from "react";
import { AudioReactiveRefContext } from "../context/audioReactiveContextDef";

export function useAudioReactiveContext() {
  const ctx = React.useContext(AudioReactiveRefContext);
  if (!ctx) {
    throw new Error(
      "useAudioReactiveContext must be used within AudioReactiveProvider",
    );
  }
  return ctx;
}
