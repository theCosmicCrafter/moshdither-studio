import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: "electron/main.ts",
      },
      {
        entry: "electron/preload.ts",
        onstart(options) {
          options.reload();
        },
        vite: {
          build: {
            lib: {
              entry: "electron/preload.ts",
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
  },
});
