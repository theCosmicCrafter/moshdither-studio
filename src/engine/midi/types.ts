export interface MIDIMapping {
  /** CC number (0-127) */
  ccNumber: number;
  /** Target effect ID in the active effects list */
  effectId: string;
  /** Parameter name within the shader */
  paramName: string;
  /** Scale factor: value = rawCC * scale + offset */
  scale?: number;
  /** Offset added after scaling */
  offset?: number;
}

export interface MIDIState {
  connected: boolean;
  deviceName: string | null;
  mappings: MIDIMapping[];
  lastCCValues: Record<number, number>;
}
