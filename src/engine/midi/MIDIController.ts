import { MIDIMapping, MIDIState } from "./types";

type MIDIMessageHandler = (ccNumber: number, value: number) => void;
type ConnectionHandler = (connected: boolean, deviceName: string | null) => void;

/** Default CC-to-param mappings for a generic 8-knob MIDI controller */
export const DEFAULT_MAPPINGS: MIDIMapping[] = [
  { ccNumber: 1, effectId: "effect_0", paramName: "amount", scale: 1 / 127, offset: 0 },
  { ccNumber: 2, effectId: "effect_0", paramName: "scale", scale: 16 / 127, offset: 0 },
  { ccNumber: 3, effectId: "effect_1", paramName: "amount", scale: 1 / 127, offset: 0 },
  { ccNumber: 4, effectId: "effect_2", paramName: "amount", scale: 1 / 127, offset: 0 },
  { ccNumber: 5, effectId: "effect_3", paramName: "amount", scale: 1 / 127, offset: 0 },
  { ccNumber: 6, effectId: "effect_4", paramName: "amount", scale: 1 / 127, offset: 0 },
  { ccNumber: 7, effectId: "effect_5", paramName: "amount", scale: 1 / 127, offset: 0 },
  { ccNumber: 8, effectId: "effect_6", paramName: "amount", scale: 1 / 127, offset: 0 },
];

const STORAGE_KEY = "moshdither_midi_mappings";

export class MIDIController {
  private access: WebMidi.MIDIAccess | null = null;
  private state: MIDIState;
  private onMessage: MIDIMessageHandler[] = [];
  private onConnection: ConnectionHandler[] = [];
  private listeners: Array<() => void> = [];
  private stateChangeHandler: ((event: Event) => void) | null = null;

  constructor() {
    this.state = {
      connected: false,
      deviceName: null,
      mappings: this.loadMappings(),
      lastCCValues: {},
    };
  }

  /** Request Web MIDI access. Must be called after user gesture. */
  async connect(): Promise<boolean> {
    if (!("requestMIDIAccess" in navigator)) {
      console.warn("Web MIDI API not supported in this browser");
      return false;
    }

    try {
      const access = await navigator.requestMIDIAccess({ sysex: false, software: false });
      if (this.access && this.stateChangeHandler) {
        this.access.removeEventListener("statechange", this.stateChangeHandler);
      }
      this.access = access;
      this.setupInputs();
      this.stateChangeHandler = () => this.setupInputs();
      this.access.addEventListener("statechange", this.stateChangeHandler);
      return this.state.connected;
    } catch (err) {
      console.error("MIDI access denied:", err);
      return false;
    }
  }

  disconnect() {
    this.listeners.forEach((l) => l());
    this.listeners = [];
    if (this.access && this.stateChangeHandler) {
      this.access.removeEventListener("statechange", this.stateChangeHandler);
    }
    this.stateChangeHandler = null;
    this.access = null;
    this.setConnected(false, null);
  }

  isConnected(): boolean {
    return this.state.connected;
  }

  getState(): MIDIState {
    return { ...this.state };
  }

  getMappings(): MIDIMapping[] {
    return [...this.state.mappings];
  }

  setMappings(mappings: MIDIMapping[]) {
    this.state.mappings = mappings;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mappings));
  }

  addMapping(mapping: MIDIMapping) {
    const filtered = this.state.mappings.filter((m) => m.ccNumber !== mapping.ccNumber);
    filtered.push(mapping);
    this.setMappings(filtered);
  }

  removeMapping(ccNumber: number) {
    this.setMappings(this.state.mappings.filter((m) => m.ccNumber !== ccNumber));
  }

  /** Subscribe to CC value changes. Returns unsubscribe function. */
  subscribe(handler: MIDIMessageHandler): () => void {
    this.onMessage.push(handler);
    return () => {
      this.onMessage = this.onMessage.filter((h) => h !== handler);
    };
  }

  /** Subscribe to connection changes. Returns unsubscribe function. */
  onConnectionChange(handler: ConnectionHandler): () => void {
    this.onConnection.push(handler);
    return () => {
      this.onConnection = this.onConnection.filter((h) => h !== handler);
    };
  }

  private setupInputs() {
    this.listeners.forEach((l) => l());
    this.listeners = [];

    if (!this.access) return;

    let anyConnected = false;
    let deviceName: string | null = null;

    this.access.inputs.forEach((input) => {
      if (input.state === "connected") {
        anyConnected = true;
        deviceName = input.name || `Port ${input.id}`;

        const handler = (event: WebMidi.MIDIMessageEvent) => {
          const [status, data1, data2] = event.data;
          if ((status & 0xf0) === 0xb0) {
            const ccNumber = data1;
            const value = data2;
            this.state.lastCCValues[ccNumber] = value;
            this.onMessage.forEach((cb) => cb(ccNumber, value));
          }
        };

        input.addEventListener("midimessage", handler);
        this.listeners.push(() => input.removeEventListener("midimessage", handler));
      }
    });

    this.setConnected(anyConnected, deviceName);
  }

  private setConnected(connected: boolean, deviceName: string | null) {
    if (this.state.connected !== connected || this.state.deviceName !== deviceName) {
      this.state.connected = connected;
      this.state.deviceName = deviceName;
      this.onConnection.forEach((cb) => cb(connected, deviceName));
    }
  }

  private loadMappings(): MIDIMapping[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      // ignore
    }
    return [...DEFAULT_MAPPINGS];
  }
}

export const midiController = new MIDIController();
