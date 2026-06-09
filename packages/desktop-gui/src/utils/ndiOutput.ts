/**
 * NDI / Syphon / Spout Output — Real-time video streaming.
 *
 * Sends the WebGL canvas output to VJ software (Resolume, OBS, TouchDesigner).
 *
 * STATUS: STUB — Requires platform-specific native modules:
 * - NDI: ndi-sdk + node-ndi (Windows/Mac/Linux)
 * - Syphon: node-syphon (macOS only)
 * - Spout: node-spout (Windows only)
 *
 * Reference: crt-wall-controller audit has NDI module documentation.
 */

export type StreamProtocol = "ndi" | "syphon" | "spout" | "whip";

export interface StreamConfig {
  protocol: StreamProtocol;
  name: string; // Stream name visible in receiving software
  width: number;
  height: number;
  fps: number;
}

export interface StreamStatus {
  active: boolean;
  bytesSent: number;
  clients: number;
  errors: string[];
}

let activeStream: StreamConfig | null = null;
let status: StreamStatus = { active: false, bytesSent: 0, clients: 0, errors: [] };

export async function startStream(config: StreamConfig): Promise<boolean> {
  console.warn(`[NDI/Spout] ${config.protocol} streaming requires native modules not yet integrated.`);
  console.warn("Install the appropriate native module for your platform:");
  if (config.protocol === "ndi") console.warn("  - npm install node-ndi (or ndi-node-wrapper)");
  if (config.protocol === "syphon") console.warn("  - npm install node-syphon (macOS only)");
  if (config.protocol === "spout") console.warn("  - npm install node-spout (Windows only)");
  if (config.protocol === "whip") console.warn("  - npm install @eyevinn/whip-endpoint");

  activeStream = config;
  status = { active: true, bytesSent: 0, clients: 0, errors: [] };
  return true;
}

export function stopStream(): void {
  activeStream = null;
  status = { active: false, bytesSent: 0, clients: 0, errors: [] };
}

export function getStreamStatus(): StreamStatus {
  return { ...status };
}

export function getActiveStream(): StreamConfig | null {
  return activeStream;
}
