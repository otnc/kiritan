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

/**
 * `yargs`'s own `.locale("ja")` support (used for the CLI's own `--help`/error-message translation) reads its bundled locale JSON files at runtime from a path resolved relative to yargs's own installed package directory, not via a static `import` a bundler could follow — bundling it into dist/ would silently break that lookup, since the JSON files wouldn't be sitting next to the bundled code anymore. Unlike the dual-format packages above, `yargs` (18+) is ESM-only, so an externalized `require("yargs")` in the unused `dist/cli.cjs` stub would throw if anyone actually ran it — harmless, since nothing does (see the `entry`/`format` comment below); the real `bin` entry, `dist/cli.mjs`, only ever loads it via `import`.
 */
const EXTERNAL_RUNTIME_ASSET_DEPENDENCIES = new Set(["yargs"]);

function isExternal(id: string): boolean {
  if (builtinModules.includes(id.replace(/^node:/, ""))) return true;
  for (const name of [
    ...EXTERNAL_DUAL_FORMAT_DEPENDENCIES,
    ...EXTERNAL_RUNTIME_ASSET_DEPENDENCIES,
  ]) {
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
