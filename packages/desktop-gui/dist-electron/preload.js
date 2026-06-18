let electron = require("electron");
//#region electron/preload.ts
var VALID_SEND_CHANNELS = [
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
	"sam3:preload-model",
	"sam3:predict-batch",
	"sam3:predict-box",
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
	"env:status",
	"env:install-local",
	"env:set-mode"
];
var VALID_RECEIVE_CHANNELS = [
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
	"env:install-progress"
];
function validateChannel(channel, valid) {
	if (!valid.includes(channel)) throw new Error(`Unauthorized IPC channel: ${channel}`);
}
var listenerMap = /* @__PURE__ */ new WeakMap();
electron.contextBridge.exposeInMainWorld("ipcRenderer", {
	on(channel, listener) {
		validateChannel(channel, VALID_RECEIVE_CHANNELS);
		const wrapped = (event, ...args) => listener(event, ...args);
		listenerMap.set(listener, wrapped);
		electron.ipcRenderer.on(channel, wrapped);
		return () => electron.ipcRenderer.off(channel, wrapped);
	},
	off(channel, listener) {
		validateChannel(channel, VALID_RECEIVE_CHANNELS);
		const wrapped = listenerMap.get(listener);
		if (wrapped) {
			electron.ipcRenderer.off(channel, wrapped);
			listenerMap.delete(listener);
		}
	},
	send(channel, ...args) {
		validateChannel(channel, VALID_SEND_CHANNELS);
		electron.ipcRenderer.send(channel, ...args);
	},
	invoke(channel, ...args) {
		validateChannel(channel, VALID_SEND_CHANNELS);
		return electron.ipcRenderer.invoke(channel, ...args);
	}
});
electron.contextBridge.exposeInMainWorld("windowControls", {
	minimize: () => electron.ipcRenderer.invoke("window:minimize"),
	maximize: () => electron.ipcRenderer.invoke("window:maximize"),
	close: () => electron.ipcRenderer.invoke("window:close"),
	isMaximized: () => electron.ipcRenderer.invoke("window:isMaximized")
});
//#endregion
