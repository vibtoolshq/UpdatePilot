import js from "@eslint/js";
import globals from "globals";

const sourceFiles = ["src/**/*.js", "examples/**/*.js", "test/**/*.js"];

export default [
  {
    ignores: [
      "node_modules/**",
      "coverage/**",
      "dist/**",
      "examples/basic-express/node_modules/**",
    ],
  },
  {
    ...js.configs.recommended,
    files: sourceFiles,
    languageOptions: {
      ...js.configs.recommended.languageOptions,
      ecmaVersion: 2022,
      sourceType: "module",
      globals: globals.node,
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "prefer-const": "error",
      "no-var": "error",
    },
  },
  {
    files: ["examples/**/*.js"],
    rules: { "no-console": "off" },
  },
];
