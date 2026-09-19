import { builtinModules } from "node:module";
import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  // Node >= 22 supports ES2024
  target: "node22",
  platform: "node",
  // unified/remark, p-queue and p-retry are ESM-only, so leaving them as external `require()` calls would break the CJS build. Bundle everything except Node's own modules (the same approach `kiritan` takes).
  deps: {
    alwaysBundle: (id) => !builtinModules.includes(id.replace(/^node:/, "")),
  },
});
