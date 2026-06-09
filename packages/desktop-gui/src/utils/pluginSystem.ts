/**
 * Plugin / Extension System for MoshDither Studio.
 *
 * Allows loading third-party effects via JS plugins with a manifest file.
 * Plugins run in a sandboxed iframe/worker context for security.
 */

export interface PluginManifest {
  name: string;
  version: string;
  author: string;
  description: string;
  entryPoint: string; // Path to main JS file
  effectType: string; // e.g. "custom-shader"
  permissions: PluginPermission[];
}

export type PluginPermission = "webgl" | "file-read" | "file-write" | "network";

export interface LoadedPlugin {
  manifest: PluginManifest;
  id: string;
  enabled: boolean;
  module: unknown;
}

const loadedPlugins = new Map<string, LoadedPlugin>();
const listeners = new Set<(plugins: LoadedPlugin[]) => void>();

function notify() {
  const snapshot = Array.from(loadedPlugins.values());
  for (const cb of listeners) {
    try {
      cb(snapshot);
    } catch {
      // Ignore listener errors
    }
  }
}

export function subscribePlugins(
  cb: (plugins: LoadedPlugin[]) => void,
): () => void {
  listeners.add(cb);
  cb(Array.from(loadedPlugins.values()));
  return () => listeners.delete(cb);
}

/**
 * Validate a plugin manifest against the schema.
 */
export function validateManifest(manifest: unknown): PluginManifest | null {
  if (typeof manifest !== "object" || manifest === null) return null;
  const m = manifest as Record<string, unknown>;
  if (
    typeof m.name !== "string" ||
    typeof m.version !== "string" ||
    typeof m.author !== "string" ||
    typeof m.entryPoint !== "string" ||
    typeof m.effectType !== "string"
  ) {
    return null;
  }
  return {
    name: m.name,
    version: m.version,
    author: m.author,
    description: typeof m.description === "string" ? m.description : "",
    entryPoint: m.entryPoint,
    effectType: m.effectType,
    permissions: Array.isArray(m.permissions)
      ? (m.permissions as PluginPermission[])
      : [],
  };
}

/**
 * Load a plugin from a manifest object.
 * In a real implementation, this would fetch the entry point JS and execute
 * it in a sandboxed iframe or QuickJS VM.
 */
export async function loadPlugin(
  manifest: PluginManifest,
): Promise<LoadedPlugin | null> {
  const id = `plugin-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  // Security: validate permissions
  const allowedPermissions = new Set<PluginPermission>(["webgl"]);
  for (const perm of manifest.permissions) {
    if (!allowedPermissions.has(perm)) {
      console.warn(
        `Plugin "${manifest.name}" requests unsupported permission: ${perm}`,
      );
    }
  }

  // TODO: In production, fetch entryPoint JS and run in sandboxed iframe
  // const module = await loadInSandbox(manifest.entryPoint, manifest.permissions);
  const module = {
    init: () => console.log(`Plugin ${manifest.name} initialized`),
  };

  const plugin: LoadedPlugin = {
    manifest,
    id,
    enabled: true,
    module,
  };

  loadedPlugins.set(id, plugin);
  notify();
  return plugin;
}

export function unloadPlugin(pluginId: string): boolean {
  const plugin = loadedPlugins.get(pluginId);
  if (!plugin) return false;
  // TODO: Call plugin.module.dispose() if available
  loadedPlugins.delete(pluginId);
  notify();
  return true;
}

export function togglePlugin(pluginId: string, enabled: boolean): void {
  const plugin = loadedPlugins.get(pluginId);
  if (!plugin) return;
  plugin.enabled = enabled;
  notify();
}

export function getPlugins(): LoadedPlugin[] {
  return Array.from(loadedPlugins.values());
}

export function getPluginById(id: string): LoadedPlugin | undefined {
  return loadedPlugins.get(id);
}
