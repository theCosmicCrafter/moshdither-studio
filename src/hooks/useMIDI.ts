import { useEffect, useState, useCallback } from 'react';
import { midiController, DEFAULT_MAPPINGS } from '../engine/midi/MIDIController';
import { MIDIMapping, MIDIState } from '../engine/midi/types';

export function useMIDI() {
  const [state, setState] = useState<MIDIState>(midiController.getState());

  useEffect(() => {
    const unsub = midiController.onConnectionChange(() => {
      setState(midiController.getState());
    });
    return unsub;
  }, []);

  const connect = useCallback(async () => {
    const ok = await midiController.connect();
    setState(midiController.getState());
    return ok;
  }, []);

  const disconnect = useCallback(() => {
    midiController.disconnect();
    setState(midiController.getState());
  }, []);

  const setMappings = useCallback((mappings: MIDIMapping[]) => {
    midiController.setMappings(mappings);
    setState(midiController.getState());
  }, []);

  return {
    ...state,
    connect,
    disconnect,
    setMappings,
    defaultMappings: DEFAULT_MAPPINGS,
  };
}
