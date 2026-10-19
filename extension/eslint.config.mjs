import { config } from "@repo/eslint-config/base";

/** @type {import("eslint").Linter.Config[]} */
export default [
  { ignores: ["dist/**", "dist-*/**"] },
  ...config,
  // build scripts run on Node
  { files: ["scripts/**/*.mjs"], languageOptions: { globals: { console: "readonly", process: "readonly", structuredClone: "readonly" } } },
];
