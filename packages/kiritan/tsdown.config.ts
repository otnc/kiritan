import { builtinModules } from "node:module";
import { defineConfig } from "tsdown";

/**
 * Dependencies known to already publish dual CJS/ESM builds, so leaving them as external `require()`/`import` calls is safe. Everything else is bundled by default (see `deps.alwaysBundle` below) — the unified/remark/mdast ecosystem publishes ESM-only, and enumerating its many transitive packages one by one would silently go stale (and break CJS) the moment a future version pulls in a new one we forgot to list. Naming the small, stable set of exceptions instead means an unlisted dependency merely gets bundled (slightly larger dist/, still correct), rather than breaking CJS callers.
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
