import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import jsxA11y from "eslint-plugin-jsx-a11y";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "jsx-a11y": jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // jsx-a11y recommended rules as errors (batch 6 phase B).
      ...jsxA11y.flatConfigs.recommended.rules,
      // A scrollable region (role="region" with a name) must be reachable by keyboard
      // (axe scrollable-region-focusable, WCAG 2.1.1), so tabIndex is allowed on it.
      "jsx-a11y/no-noninteractive-tabindex": ["error", { tags: [], roles: ["tabpanel", "region"], allowExpressionValues: true }],
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      // argsIgnorePattern/varsIgnorePattern: the codebase already uses a leading `_` as
      // its convention for a deliberately-unused destructured/discarded binding (e.g.
      // `const { [key]: _, ...rest } = obj`) — this just makes the rule respect that
      // existing convention instead of flagging it.
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  }
);
