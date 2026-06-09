import { defineConfig } from "vite";

/**
 * Vitest browser-mode configuration for real WebGL / canvas tests.
 *
 * Run with:
 *   npx vitest run --config vitest.browser.config.ts
 *
 * Requires Playwright Chromium to be installed:
 *   npx playwright install chromium
 */
export default defineConfig({
  // @ts-expect-error vitest browser config
  test: {
    name: "browser",
    include: ["src/**/*.browser.test.{ts,tsx}"],
    browser: {
      enabled: true,
      provider: "playwright",
      instances: [{ browser: "chromium" }],
    },
  },
});
