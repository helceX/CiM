// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/test-results/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "off",
    },
  },
  {
    // Panel areas whose text is already in the message catalog (docs/product/PANEL_I18N.md): they may not
    // slide back to hard-coded English. Add an area's files here when its translation lands.
    files: [
      "apps/web/src/components/{app-sidebar,app-topbar,mobile-nav,command-palette,notification-bell,theme-toggle,filter-bar,range-select,change-badge,kpi-row,auth-card}.tsx",
      "apps/web/src/app/(public)/{login,register,forgot-password,reset-password,verify-email}/*.tsx",
      "apps/web/src/app/(public)/invitations/accept/*.tsx",
      "apps/web/src/app/onboarding/*.tsx",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXText[value=/[A-Za-z]{2}/]",
          message: "Visible text belongs in the message catalog — use t() (docs/product/PANEL_I18N.md).",
        },
        {
          selector: "JSXAttribute[name.name=/^(placeholder|title|aria-label|alt|label|hint)$/] > Literal[value=/[A-Za-z]{2}/]",
          message: "Visible or spoken text belongs in the message catalog — use t() (docs/product/PANEL_I18N.md).",
        },
      ],
    },
  },
);
