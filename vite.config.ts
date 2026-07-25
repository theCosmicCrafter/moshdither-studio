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
          // Vendor chunk: framework + state management libraries.
          const vendor = ["react", "react-dom", "zustand", "lucide-react"];
          if (vendor.some((module) => id.includes(`node_modules/${module}`))) {
            return "vendor";
          }
          // Panel-level code splitting: each heavy panel gets its own chunk
          // so the initial bundle only loads the panels the user actually
          // opens. The panelRegistry uses React.lazy() for these imports,
          // so they are already dynamic — naming the chunks here keeps the
          // network tab readable and lets the browser cache them
          // independently across releases.
          const panelMatch = id.match(
            /[\\/]components[\\/](EffectBrowser|EffectStack|AudioPanel|ExportPanel|PresetPanel|MaskPanel|LUTPanel|ProxyPanel|TrackPanel|VerificationPanel)[\\/]/
          );
          if (panelMatch) {
            return `panel-${panelMatch[1].toLowerCase()}`;
          }
          // Engine chunk: WebGL2 renderer, shaders, LUT loader — heavy and
          // only needed once media is loaded.
          if (id.includes("/engine/webgl2/") || id.includes("\\engine\\webgl2\\")) {
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
  },
});
