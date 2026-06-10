import * as React from "react";
import { AudioReactiveContext } from "../context/audioReactiveContextDef";

export function useAudioReactiveContext() {
  const ctx = React.useContext(AudioReactiveContext);
  if (!ctx) {
    throw new Error(
      "useAudioReactiveContext must be used within AudioReactiveProvider",
    );
  }
  return ctx;
}
