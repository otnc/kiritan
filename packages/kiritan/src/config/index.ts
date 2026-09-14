export { defineConfig } from "./define-config.js";
export { resolveTargetLocales } from "./locale.js";
export {
  applyDefaults,
  loadConfigFile,
  resolveCascadePaths,
  resolveConfig,
} from "./load.js";
export type { ResolveConfigOptions } from "./load.js";
export { deepMerge, mergeArray, mergeConfigs } from "./merge.js";
export * from "./types.js";
