/**
 * Hardened IPC API exposed by the preload script via contextBridge.
 * Only whitelisted channels are permitted (see electron/preload.ts).
 */
export interface IpcRendererApi {
  on(
    channel: string,
    listener: (event: unknown, ...args: unknown[]) => void,
  ): () => void;
  off(
    channel: string,
    listener: (event: unknown, ...args: unknown[]) => void,
  ): void;
  send(channel: string, ...args: unknown[]): void;
  invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T>;
}

export interface WindowControlsApi {
  minimize(): Promise<void>;
  maximize(): Promise<void>;
  close(): Promise<void>;
  isMaximized(): Promise<boolean>;
}

declare global {
  interface Window {
    ipcRenderer: IpcRendererApi;
    windowControls?: WindowControlsApi;
  }
}

export {};
