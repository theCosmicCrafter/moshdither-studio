/**
 * MIDI / OSC / DMX Control for MoshDither Studio.
 *
 * Bridges external hardware controllers to effect parameters.
 * Uses the Web MIDI API for MIDI input.
 */

export interface MIDIMapping {
  effectId: string;
  paramName: string;
  channel: number; // MIDI channel (0-15)
  controller: number; // CC number (0-127)
  minValue: number;
  maxValue: number;
}

export interface OSCMapping {
  effectId: string;
  paramName: string;
  address: string; // e.g. "/moshdither/effect1/intensity"
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let midiAccess: any = null;
const midiMappings = new Map<string, MIDIMapping>(); // key: "ch-ctrl"
const oscMappings = new Map<string, OSCMapping>();
const paramListeners = new Set<
  (effectId: string, param: string, value: number) => void
>();

export async function initMIDI(): Promise<boolean> {
  if (!(navigator as any).requestMIDIAccess) {
    console.warn("Web MIDI API not supported in this browser");
    return false;
  }
  try {
    midiAccess = await (navigator as any).requestMIDIAccess({ sysex: false });
    for (const input of midiAccess.inputs.values()) {
      input.onmidimessage = handleMIDIMessage;
    }
    midiAccess.onstatechange = () => {
      // Re-bind inputs if devices change
      if (midiAccess) {
        for (const input of midiAccess.inputs.values()) {
          input.onmidimessage = handleMIDIMessage;
        }
      }
    };
    return true;
  } catch {
    return false;
  }
}

function handleMIDIMessage(event: any): void {
  const data = event.data as Uint8Array | undefined;
  if (!data || data.length < 3) return;

  const status = data[0];
  // CC message: status byte 0xB0-0xBF (channel 0-15)
  if ((status & 0xf0) !== 0xb0) return;

  const channel = status & 0x0f;
  const controller = data[1];
  const value = data[2];

  const key = `${channel}-${controller}`;
  const mapping = midiMappings.get(key);
  if (!mapping) return;

  const normalized = value / 127;
  const mappedValue =
    mapping.minValue + normalized * (mapping.maxValue - mapping.minValue);

  for (const cb of paramListeners) {
    cb(mapping.effectId, mapping.paramName, mappedValue);
  }
}

export function addMIDIMapping(mapping: MIDIMapping): void {
  midiMappings.set(`${mapping.channel}-${mapping.controller}`, mapping);
}

export function removeMIDIMapping(channel: number, controller: number): void {
  midiMappings.delete(`${channel}-${controller}`);
}

export function addOSCMapping(mapping: OSCMapping): void {
  oscMappings.set(mapping.address, mapping);
}

export function removeOSCMapping(address: string): void {
  oscMappings.delete(address);
}

export function subscribeParameterChanges(
  cb: (effectId: string, param: string, value: number) => void,
): () => void {
  paramListeners.add(cb);
  return () => paramListeners.delete(cb);
}

export function getMIDIDevices(): {
  id: string;
  name: string;
  manufacturer: string;
}[] {
  if (!midiAccess) return [];
  return Array.from(midiAccess.inputs.values()).map((input: any) => ({
    id: input.id as string,
    name: (input.name as string) ?? "Unknown",
    manufacturer: (input.manufacturer as string) ?? "Unknown",
  }));
}

export function getMIDIMappings(): MIDIMapping[] {
  return Array.from(midiMappings.values());
}
