import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  // Node >= 22 supports ES2024
  target: "node22",
  platform: "node",
  deps: {
    // The unified/remark/mdast ecosystem publishes ESM-only. Everything
    // outside src/cli.ts must stay dual CJS/ESM, so these are bundled into
    // dist/index.{cjs,mjs} instead of left as external `require()`/`import`
    // calls a CJS consumer can't resolve.
    alwaysBundle: [
      "unified",
      "remark-parse",
      "remark-stringify",
      "remark-directive",
      "mdast-util-directive",
      /^(micromark|mdast|unist|vfile|bail|trough|is-plain-obj|devlop|extend|comma-separated-tokens|space-separated-tokens|property-information|hast|web-namespaces|zwitch|longest-streak|ccount|escape-string-regexp|markdown-table|stringify-entities|character-entities)/,
    ],
  },
});
