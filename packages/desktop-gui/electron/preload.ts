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
  "cache:get-frame",
  "cache:set-frame",
  "cache:clear",
  "cache:stats",
  "fonts:list",
  "sam3:load-model",
  "sam3:predict-batch",
  "sam3:predict-text",
  "sam3:predict-point-pro",
  "sam3:predict-text-pro",
  "sam3:predict-groundingdino",
  "sam3:hover-preview",
  "sam3:remove-background",
  "sam3:remove-background-batch",
  "sam3:list-models",
  "sam3:download-model",
  "sam3:model-status",
  "sam3:unload-model",
  "mask:post-process",
  "mask:flood-fill",
  "window:minimize",
  "window:maximize",
  "window:close",
  "window:isMaximized",
  // Environment manager
  "env:status",
  "env:install-local",
  "env:set-mode",
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
  "menu:import",
  "menu:export",
  "menu:shortcuts",
  "menu:preload-model",
  "sam3:progress",
  "sam3:download-progress",
  "sam3:hover-result",
  "env:install-progress",
];

function validateChannel(channel: string, valid: string[]): void {
  if (!valid.includes(channel)) {
    throw new Error(`Unauthorized IPC channel: ${channel}`);
  }
}

// Map original listeners -> wrapped listeners for correct .off() removal
const listenerMap = new WeakMap<
  (event: unknown, ...args: unknown[]) => void,
  (event: IpcRendererEvent, ...args: unknown[]) => void
>();

// --------- Expose a hardened IPC API to the Renderer process ---------
contextBridge.exposeInMainWorld("ipcRenderer", {
  on(
    channel: string,
    listener: (event: unknown, ...args: unknown[]) => void,
  ): () => void {
    validateChannel(channel, VALID_RECEIVE_CHANNELS);
    const wrapped = (event: IpcRendererEvent, ...args: unknown[]) =>
      listener(event, ...args);
    listenerMap.set(listener, wrapped);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.off(channel, wrapped);
  },
  off(
    channel: string,
    listener: (event: unknown, ...args: unknown[]) => void,
  ): void {
    validateChannel(channel, VALID_RECEIVE_CHANNELS);
    const wrapped = listenerMap.get(listener);
    if (wrapped) {
      ipcRenderer.off(channel, wrapped);
      listenerMap.delete(listener);
    }
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

// Expose window control API for frameless custom title bar
contextBridge.exposeInMainWorld("windowControls", {
  minimize: () => ipcRenderer.invoke("window:minimize"),
  maximize: () => ipcRenderer.invoke("window:maximize"),
  close: () => ipcRenderer.invoke("window:close"),
  isMaximized: () => ipcRenderer.invoke("window:isMaximized"),
});
