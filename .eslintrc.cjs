module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react-hooks/recommended",
  ],
  ignorePatterns: ["dist", ".eslintrc.cjs"],
  parser: "@typescript-eslint/parser",
  plugins: ["react-refresh"],
  rules: {
    // Release builds detach the console: warn/error must go through
    // utils/logger so they are forwarded to the app log file.
    "no-console": "error",
    "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
  },
  overrides: [
    {
      // logger.ts is the console wrapper itself. Test code (vitest spies,
      // Playwright specs and their mocks) runs in a terminal, where writing
      // to the console is the point.
      // (No brace expansion in these globs: the hoisted brace-expansion@5
      // breaks minimatch@3's expand call.)
      files: [
        "src/utils/logger.ts",
        "src/**/__tests__/**",
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
        "src/**/*.spec.ts",
        "src/**/*.spec.tsx",
        "tests/**",
      ],
      rules: { "no-console": "off" },
    },
  ],
};
