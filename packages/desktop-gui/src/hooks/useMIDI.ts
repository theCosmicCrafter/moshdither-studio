import { useEffect, useState, useCallback } from "react";
import {
  initMIDI,
  getMIDIDevices,
  getMIDIMappings,
  addMIDIMapping,
  removeMIDIMapping,
  subscribeParameterChanges,
  type MIDIMapping,
} from "../utils/midiControl";

export function useMIDI(
  onParameterChange?: (effectId: string, param: string, value: number) => void,
) {
  const [ready, setReady] = useState(false);
  const [devices, setDevices] = useState<
    { id: string; name: string; manufacturer: string }[]
  >([]);
  const [mappings, setMappings] = useState<MIDIMapping[]>([]);

  useEffect(() => {
    initMIDI().then((success) => {
      setReady(success);
      if (success) {
        setDevices(getMIDIDevices());
        setMappings(getMIDIMappings());
      }
    });
  }, []);

  useEffect(() => {
    return subscribeParameterChanges((effectId, param, value) => {
      onParameterChange?.(effectId, param, value);
    });
  }, [onParameterChange]);

  const addMapping = useCallback((mapping: MIDIMapping) => {
    addMIDIMapping(mapping);
    setMappings(getMIDIMappings());
  }, []);

  const removeMapping = useCallback((channel: number, controller: number) => {
    removeMIDIMapping(channel, controller);
    setMappings(getMIDIMappings());
  }, []);

  return { ready, devices, mappings, addMapping, removeMapping };
}
