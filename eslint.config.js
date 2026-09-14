import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["**/dist", "coverage"] },
  js.configs.recommended,
  tseslint.configs.recommended,
  { languageOptions: { globals: globals.node } },
  {
    // The VS Code extension host loads these as plain CommonJS (real .cjs
    // files, so they work regardless of the package's "type": "module"), to
    // sidestep any version uncertainty around ESM extension entry points.
    files: ["extensions/vscode/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  eslintConfigPrettier
);
