/**
 * Binary Resolver — Thin wrapper around environmentManager
 *
 * Re-exports resolveEnvPaths and resolvePythonPath for backward compatibility.
 * All heavy lifting moved to environmentManager.ts.
 */

import {
  resolveEnvPaths,
  resolvePythonPath,
  loadEnvConfig,
  getEnvironmentStatus,
  installLocalEnvironment,
  saveEnvConfig,
  type EnvMode,
  type EnvStatus,
  type InstallProgress,
  type ResolvedEnvPaths,
} from "./environmentManager";

export {
  resolveEnvPaths,
  resolvePythonPath,
  loadEnvConfig,
  getEnvironmentStatus,
  installLocalEnvironment,
  saveEnvConfig,
  type EnvMode,
  type EnvStatus,
  type InstallProgress,
};

/** @deprecated Use resolveEnvPaths() directly. Kept for main.ts compatibility. */
export async function resolveBinaries(): Promise<ResolvedEnvPaths> {
  return resolveEnvPaths();
}
