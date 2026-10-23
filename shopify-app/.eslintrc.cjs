/**
 * This is intended to be a basic starting point for linting in your app.
 * It relies on recommended configs out of the box for simplicity, but you can
 * and should modify this configuration to best suit your team's needs.
 */

/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    ecmaFeatures: {
      jsx: true,
    },
  },
  env: {
    browser: true,
    commonjs: true,
    es6: true,
  },
  ignorePatterns: [
    "!**/.server",
    "!**/.client",
    // Shopify Admin GraphQL codegen (committed generated types).
    "app/types/admin*.d.ts",
    "app/types/admin-*.schema.json",
    // Shopify Function GraphQL codegen (duplicate Input schema + operation types).
    "extensions/fgpb-discount/generated/**",
    "extensions/fgpb-discount/dist/**",
    // Theme extension assets are built/copied storefront bundles — lint sources instead.
    "extensions/free-gift-progress-bar/assets/**",
    "build/**",
    "storefront-extension/dist/**",
    "coverage/**",
    // Historical, non-application presentation tooling.
    "docs/archive/**",
  ],

  // Base config
  extends: ["eslint:recommended"],

  overrides: [
    // React
    {
      files: ["**/*.{js,jsx,ts,tsx}"],
      plugins: ["react", "jsx-a11y"],
      extends: [
        "plugin:react/recommended",
        "plugin:react/jsx-runtime",
        "plugin:react-hooks/recommended",
        "plugin:jsx-a11y/recommended",
      ],
      settings: {
        react: {
          version: "detect",
        },
        formComponents: ["Form"],
        linkComponents: [
          { name: "Link", linkAttribute: "to" },
          { name: "NavLink", linkAttribute: "to" },
        ],
        "import/resolver": {
          typescript: {},
        },
      },
      rules: {
        "react/no-unknown-property": ["error", { ignore: ["variant"] }],
      },
    },

    // Typescript
    {
      files: ["**/*.{ts,tsx}"],
      plugins: ["@typescript-eslint", "import"],
      parser: "@typescript-eslint/parser",
      settings: {
        "import/internal-regex": "^~/",
        "import/resolver": {
          node: {
            extensions: [".ts", ".tsx"],
          },
          typescript: {
            alwaysTryTypes: true,
          },
        },
      },
      extends: [
        "plugin:@typescript-eslint/recommended",
        "plugin:import/recommended",
        "plugin:import/typescript",
      ],
      rules: {
        "@typescript-eslint/no-unused-vars": [
          "error",
          {
            argsIgnorePattern: "^_",
            varsIgnorePattern: "^_",
            caughtErrorsIgnorePattern: "^_",
          },
        ],
      },
    },

    // Node
    {
      files: [
        ".eslintrc.cjs",
        "vite.config.{js,ts}",
        ".graphqlrc.{js,ts}",
        "shopify.server.{js,ts}",
        "**/*.server.{js,ts}",
      ],
      env: {
        node: true,
      },
    },

    // Node test files (storefront + backend)
    {
      files: ["**/*.test.{js,ts,mjs}", "**/reliability.test.js", "**/visibility.test.js"],
      env: {
        node: true,
        es2022: true,
      },
      globals: {
        globalThis: "readonly",
      },
    },

    // Storefront sources: empty catch blocks are intentional fail-soft UI guards.
    {
      files: ["storefront-extension/src/**/*.{js,ts}"],
      rules: {
        "no-empty": ["error", { allowEmptyCatch: true }],
      },
    },
    // Existing production IIFEs moved byte-for-byte out of previously ignored assets.
    // Preserve their legacy scoping/dead helpers during this mechanical move;
    // new modular source keeps the stricter defaults above.
    {
      files: ["storefront-extension/src/runtime/*.js"],
      rules: {
        "no-unused-vars": "off",
        "no-inner-declarations": "off",
        "no-redeclare": "off",
      },
    },
  ],
  globals: {
    shopify: "readonly",
  },
};
