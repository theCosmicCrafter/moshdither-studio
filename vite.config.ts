import { availableParallelism } from "node:os";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const isDevBuild = !!process.env.TAURI_DEBUG;

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "es2022",
    minify: isDevBuild ? false : "esbuild",
    sourcemap: isDevBuild ? "inline" : false,
    // Preload dependencies of dynamically-imported modules in parallel so
    // panel chunks fetched via React.lazy() also fetch their shared deps
    // (vendor, engine-webgl2) at the same time, reducing waterfall latency
    // when a user opens a panel for the first time.
    modulePreload: { polyfill: true },
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, "/");
          // Vendor chunk: framework + state management libraries.
          const vendor = ["react", "react-dom", "zustand"];
          if (vendor.some((module) => normalizedId.includes(`node_modules/${module}/`))) {
            return "vendor";
          }
          // Panel-level code splitting: each heavy panel gets its own chunk.
          // Handles both directory-style panels (e.g. components/AudioPanel/...)
          // and flat file panels (e.g. components/MaskPanel.tsx).
          const panelMatch = normalizedId.match(
            /\/components\/(EffectBrowser|EffectStack|AudioPanel|ExportPanel|PresetPanel|MaskPanel|LUTPanel|ProxyPanel|VerificationPanel)(\/|\.(?:tsx?|jsx?)|$)/
          );
          if (panelMatch) {
            return `panel-${panelMatch[1].toLowerCase()}`;
          }
          // Engine chunk: WebGL2 renderer, shaders, LUT loader
          if (normalizedId.includes("/engine/webgl2/")) {
            return "engine-webgl2";
          }
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}", "tests/**/*.{test,spec}.{ts,tsx}"],
    exclude: ["tests/e2e/**", "node_modules/**"],
    // Pin NODE_ENV for the test run. React's entrypoint dispatches on
    // process.env.NODE_ENV at import time; if the ambient environment has
    // NODE_ENV=production (common on CI runners and build agents) React
    // resolves to react.production.min.js, where act() throws and every
    // @testing-library render fails. Pinning it here makes the suite
    // hermetic instead of dependent on the shell it was launched from.
    env: { NODE_ENV: "test" },
    // Cap the worker pool.
    //
    // Unbounded, vitest forks one worker per core. Each runs a jsdom instance,
    // and on a busy workstation that reliably produced
    //   [vitest-pool]: Worker forks emitted error. Worker exited unexpectedly
    // -- 8 of 60 test FILES never ran, while every test that did run passed.
    // The gate reported FAIL with zero failing assertions, which is the worst
    // possible signal: it looks like a code regression and is not one, and a
    // gate you learn to re-run is a gate you have stopped trusting.
    //
    // The same run with the pool capped is 65/65 files and 1248/1248 tests.
    // Half the cores keeps most of the parallelism and leaves headroom.
    maxWorkers: Math.max(2, Math.floor((availableParallelism()) / 2)),
  },
  define: {
    // Belt-and-braces: ensure any bare `process.env.NODE_ENV` reference that
    // survives into a test bundle also sees a non-production value.
    ...(process.env.VITEST ? { "process.env.NODE_ENV": JSON.stringify("test") } : {}),
  },
});
