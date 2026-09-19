import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "extensions/*/src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      // Same idea for @kiritan/middleware, which the translate-middleware packages depend on.
      "@kiritan/middleware": fileURLToPath(
        new URL("./packages/middleware/src/index.ts", import.meta.url)
      ),
      // Resolve to @kiritan/runtime's source, not its package.json "exports"
      // (which point into dist/) — mirrors packages/kiritan/tsconfig.json's
      // "paths" so tests don't depend on packages/runtime having been built.
      "@kiritan/runtime": fileURLToPath(
        new URL("./packages/runtime/src/index.ts", import.meta.url)
      ),
    },
  },
});
