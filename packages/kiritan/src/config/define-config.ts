import type { KiritanUserConfig } from "./types.js";

/** Identity helper so `*.kiritanconfig` files get type-checking and IDE completion. */
export function defineConfig(config: KiritanUserConfig): KiritanUserConfig {
  return config;
}
