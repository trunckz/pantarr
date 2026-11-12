// ESLint (flat config) for the whole monorepo: TypeScript everywhere, React hooks and accessibility in the web app.
// Errors are what is likely a bug ; style questions stay warnings so that the CI fails only on real problems.
import js from "@eslint/js";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/node_modules/**", "**/coverage/**", "apps/keep-companion/**", "apps/api/prisma/**", "**/*.user.js", "**/tsconfig.tsbuildinfo"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node, ...globals.es2022 } },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
      "@typescript-eslint/no-require-imports": "warn",
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { "react-hooks": reactHooks, "jsx-a11y": jsxA11y },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      "jsx-a11y/no-autofocus": "off",   // Mantine's data-autofocus in dialogs, on purpose
    },
  },
  {
    // scripts injected into store pages and the extension: browser globals, plain JavaScript
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    languageOptions: { globals: { ...globals.browser, ...globals.node, chrome: "readonly", GM_xmlhttpRequest: "readonly", unsafeWindow: "readonly" } },
  },
  { files: ["**/*.spec.ts", "**/*.test.ts", "**/test/**"], languageOptions: { globals: { ...globals.jest } } },
);
