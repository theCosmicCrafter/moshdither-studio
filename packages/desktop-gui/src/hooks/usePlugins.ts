import { useEffect, useState, useCallback } from "react";
import {
  subscribePlugins,
  loadPlugin,
  unloadPlugin,
  togglePlugin,
  getPlugins,
  type LoadedPlugin,
  type PluginManifest,
} from "../utils/pluginSystem";

export function usePlugins() {
  const [plugins, setPlugins] = useState<LoadedPlugin[]>(getPlugins);

  useEffect(() => {
    return subscribePlugins((updated) => setPlugins(updated));
  }, []);

  const load = useCallback(async (manifest: PluginManifest) => {
    return loadPlugin(manifest);
  }, []);

  const unload = useCallback((pluginId: string) => {
    unloadPlugin(pluginId);
  }, []);

  const toggle = useCallback((pluginId: string, enabled: boolean) => {
    togglePlugin(pluginId, enabled);
  }, []);

  return {
    plugins,
    loadPlugin: load,
    unloadPlugin: unload,
    togglePlugin: toggle,
  };
}
