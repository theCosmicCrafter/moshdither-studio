/**
 * OSC / DMX integration for MoshDither Studio.
 *
 * Provides a lightweight UDP OSC listener for receiving control messages
 * from external software (TouchDesigner, Ableton Live, Resolume, etc.)
 * and a DMX serial output stub for lighting control.
 */

export interface OSCMessage {
  address: string;
  args: (number | string | boolean | Uint8Array)[];
  sender: { ip: string; port: number };
}

export type OSCListener = (msg: OSCMessage) => void;

interface OSCMapping {
  address: string;
  effectId: string;
  paramName: string;
  minValue: number;
  maxValue: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let oscSocket: any = null;
let oscListeners: OSCListener[] = [];
let oscMappings: OSCMapping[] = [];

/**
 * Parse a raw OSC buffer into an OSCMessage.
 * Supports basic OSC types: i (int32), f (float32), s (string), T/F (bool).
 */
export function parseOSC(buffer: ArrayBuffer): OSCMessage | null {
  const data = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let offset = 0;

  // Read address (null-terminated string, padded to 4-byte boundary)
  let address = "";
  while (offset < bytes.length && bytes[offset] !== 0) {
    address += String.fromCharCode(bytes[offset]);
    offset++;
  }
  if (address.length === 0 || address[0] !== "/") return null;
  // Skip null padding
  offset = Math.ceil((offset + 1) / 4) * 4;

  if (offset >= bytes.length)
    return { address, args: [], sender: { ip: "", port: 0 } };

  // Read type tag string
  let typeTag = "";
  if (bytes[offset] === ",".charCodeAt(0)) {
    offset++;
    while (offset < bytes.length && bytes[offset] !== 0) {
      typeTag += String.fromCharCode(bytes[offset]);
      offset++;
    }
    offset = Math.ceil((offset + 1) / 4) * 4;
  }

  const args: OSCMessage["args"] = [];
  for (let i = 0; i < typeTag.length; i++) {
    const tag = typeTag[i];
    if (tag === "i") {
      args.push(data.getInt32(offset, false));
      offset += 4;
    } else if (tag === "f") {
      args.push(data.getFloat32(offset, false));
      offset += 4;
    } else if (tag === "s") {
      let str = "";
      while (offset < bytes.length && bytes[offset] !== 0) {
        str += String.fromCharCode(bytes[offset]);
        offset++;
      }
      args.push(str);
      offset = Math.ceil((offset + 1) / 4) * 4;
    } else if (tag === "T") {
      args.push(true);
    } else if (tag === "F") {
      args.push(false);
    } else if (tag === "b") {
      const len = data.getInt32(offset, false);
      offset += 4;
      args.push(new Uint8Array(bytes.slice(offset, offset + len)));
      offset = Math.ceil((offset + len) / 4) * 4;
    }
  }

  return { address, args, sender: { ip: "", port: 0 } };
}

/**
 * Start listening for OSC messages on a UDP port.
 * Returns the bound port number, or null if not available.
 *
 * NOTE: In a real Electron app with Node.js, use `dgram.createSocket('udp4')`.
 * This stub uses Chrome sockets API for renderer compatibility.
 */
export async function startOSCListener(port = 9000): Promise<number | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chromeAny = (globalThis as any).chrome;
  if (!chromeAny?.sockets?.udp) {
    console.warn(
      "OSC listener: Chrome UDP sockets not available. Use Node.js dgram in main process.",
    );
    return null;
  }

  return new Promise((resolve) => {
    chromeAny.sockets.udp.create({}, (socketInfo: { socketId?: number }) => {
      if (!socketInfo?.socketId) {
        resolve(null);
        return;
      }
      oscSocket = socketInfo;
      chromeAny.sockets.udp.bind(
        socketInfo.socketId,
        "0.0.0.0",
        port,
        (result: number) => {
          if (result < 0) {
            resolve(null);
            return;
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          chromeAny.sockets.udp.onReceive.addListener((info: any) => {
            const msg = parseOSC(info.data);
            if (msg) {
              msg.sender = { ip: info.remoteAddress, port: info.remotePort };
              oscListeners.forEach((cb) => {
                try {
                  cb(msg);
                } catch {
                  /* ignore listener errors */
                }
              });
            }
          });
          resolve(port);
        },
      );
    });
  });
}

export function stopOSCListener(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chromeAny = (globalThis as any).chrome;
  if (oscSocket && chromeAny?.sockets?.udp) {
    chromeAny.sockets.udp.close(oscSocket.socketId);
    oscSocket = null;
  }
}

export function addOSCListener(listener: OSCListener): () => void {
  oscListeners.push(listener);
  return () => {
    oscListeners = oscListeners.filter((l) => l !== listener);
  };
}

export function addOSCMapping(mapping: OSCMapping): void {
  oscMappings.push(mapping);
}

export function removeOSCMapping(address: string): void {
  oscMappings = oscMappings.filter((m) => m.address !== address);
}

export function getOSCMappings(): OSCMapping[] {
  return [...oscMappings];
}

// ---------------------------------------------------------------------------
// DMX Stub
// ---------------------------------------------------------------------------

export interface DMXSettings {
  enabled: boolean;
  universe: number;
  devicePath?: string;
  channelMap: Record<
    number,
    { effectId: string; paramName: string; min: number; max: number }
  >;
}

export function updateDMXChannel(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _universe: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _channel: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _value: number,
): boolean {
  console.warn(
    "DMX output is a stub. Install node-dmx or similar for real hardware control.",
  );
  return false;
}

export function listDMXDevices(): string[] {
  console.warn("DMX device listing is a stub.");
  return [];
}
