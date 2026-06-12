import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  root: __dirname,
  plugins: [
    react(),
    electron([
      {
        entry: path.join(__dirname, "electron/main.ts"),
        onstart(options) {
          options.startup();
        },
        vite: {
          build: {
            lib: {
              entry: path.join(__dirname, "electron/main.ts"),
              formats: ["cjs"],
            },
            rollupOptions: {
              external: ["electron", "@huggingface/transformers"],
              output: {
                entryFileNames: "[name].cjs",
              },
            },
          },
        },
      },
      {
        entry: path.join(__dirname, "electron/preload.ts"),
        onstart(options) {
          options.reload();
        },
        vite: {
          build: {
            lib: {
              entry: path.join(__dirname, "electron/preload.ts"),
              formats: ["cjs"],
            },
            rollupOptions: {
              output: {
                entryFileNames: "[name].js",
              },
            },
          },
        },
      },
    ]),
  ],
  // @ts-expect-error vitest config will type-check once deps are installed
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.unit.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/**/*"],
      exclude: [
        "src/**/*.test.*",
        "src/test/**",
        "src/**/*.d.ts",
        "src/**/*.stories.*",
        "src/**/__tests__/**",
      ],
      reporter: ["text", "html", "json"],
      reportsDirectory: "./coverage",
    },
  },
});
