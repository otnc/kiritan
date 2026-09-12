import type { KiritanUserConfig } from "./types.js";

/** Identity helper so `.kiritan.*` files get type-checking and IDE completion. */
export function defineConfig(config: KiritanUserConfig): KiritanUserConfig {
  return config;
}
