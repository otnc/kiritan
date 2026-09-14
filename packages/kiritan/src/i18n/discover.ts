import { glob } from "tinyglobby";
import type { ResourceSourceConfig } from "../config/types.js";

export interface DiscoveredResourceFile {
  source: ResourceSourceConfig;
  /** Path to the resource file, relative to `cwd`. */
  path: string;
}

/** Expands every `ResourceSourceConfig.glob` (docs/DESIGN.md chapter 9.1). */
export async function discoverResourceFiles(
  sources: ResourceSourceConfig[],
  options: { cwd: string }
): Promise<DiscoveredResourceFile[]> {
  const results: DiscoveredResourceFile[] = [];
  for (const source of sources) {
    const paths = await glob(source.glob, { cwd: options.cwd });
    for (const path of paths.sort()) {
      results.push({ source, path });
    }
  }
  return results;
}
