import { ipcRenderer, contextBridge } from "electron";
import type { IpcRendererEvent } from "electron";

// Whitelist of authorized IPC channels to prevent renderer exploitation
const VALID_SEND_CHANNELS: string[] = [
  "dialog:openMedia",
  "dialog:openMediaMultiple",
  "dialog:selectOutputDir",
  "dialog:selectSyncFolder",
  "sync:write-project",
  "sync:list-projects",
  "git:lfs-status",
  "git:init-lfs",
  "git:write-attributes",
  "get-default-output-dir",
  "get-rpc-token",
  "render:pipeline",
  "proxy:has",
  "proxy:generate",
  "proxy:cleanup",
  "metadata:read",
  "main:save-webgl-blob",
  "renderer:log",
  "autosave:write",
  "autosave:read",
  "autosave:clear",
  "crash:check",
  "crash:dismiss",
  "safe-storage:read",
  "safe-storage:write",
  "safe-storage:delete",
  "update:check-now",
  "update:install-now",
];

const VALID_RECEIVE_CHANNELS: string[] = [
  "main:webgl-export-request",
  "render:progress",
  "main-process-message",
  "update:checking",
  "update:available",
  "update:not-available",
  "update:progress",
  "update:downloaded",
  "update:error",
];

function validateChannel(channel: string, valid: string[]): void {
  if (!valid.includes(channel)) {
    throw new Error(`Unauthorized IPC channel: ${channel}`);
  }
}

// --------- Expose a hardened IPC API to the Renderer process ---------
contextBridge.exposeInMainWorld("ipcRenderer", {
  on(
    channel: string,
    listener: (event: unknown, ...args: unknown[]) => void,
  ): () => void {
    validateChannel(channel, VALID_RECEIVE_CHANNELS);
    const wrapped = (event: IpcRendererEvent, ...args: unknown[]) =>
      listener(event, ...args);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.off(channel, wrapped);
  },
  off(
    channel: string,
    listener: (event: unknown, ...args: unknown[]) => void,
  ): void {
    validateChannel(channel, VALID_RECEIVE_CHANNELS);
    ipcRenderer.off(
      channel,
      listener as (event: IpcRendererEvent, ...args: unknown[]) => void,
    );
  },
  send(channel: string, ...args: unknown[]): void {
    validateChannel(channel, VALID_SEND_CHANNELS);
    ipcRenderer.send(channel, ...args);
  },
  invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
    validateChannel(channel, VALID_SEND_CHANNELS);
    return ipcRenderer.invoke(channel, ...args) as Promise<T>;
  },
});
