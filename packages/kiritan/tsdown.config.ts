import { builtinModules } from "node:module";
import { defineConfig } from "tsdown";

/**
 * Dependencies known to already publish dual CJS/ESM builds, so leaving them as external `require()`/`import` calls is safe.
 * Everything else is bundled by default (`deps.alwaysBundle` below) — the unified/remark/mdast ecosystem is ESM-only, and its many transitive packages would go stale (and break CJS) if enumerated one by one.
 * An unlisted dependency then just gets bundled (slightly bigger dist/) instead of breaking CJS callers.
 */
const EXTERNAL_DUAL_FORMAT_DEPENDENCIES = new Set([
  "@kiritan/runtime",
  "jiti",
  "tinyglobby",
]);

function isExternal(id: string): boolean {
  if (builtinModules.includes(id.replace(/^node:/, ""))) return true;
  for (const name of EXTERNAL_DUAL_FORMAT_DEPENDENCIES) {
    if (id === name || id.startsWith(`${name}/`)) return true;
  }
  return false;
}

export default defineConfig({
  // Both entries are built in every format together (rather than splitting the CLI into its
  // own ESM-only build) so the large remark/unified bundle is chunk-shared once per format
  // instead of being duplicated into a standalone cli.mjs — this outweighs the small unused
  // dist/cli.cjs stub the CLI itself never needs.
  entry: ["src/index.ts", "src/cli.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  // Node >= 22 supports ES2024
  target: "node22",
  platform: "node",
  deps: {
    alwaysBundle: (id) => !isExternal(id),
  },
});
