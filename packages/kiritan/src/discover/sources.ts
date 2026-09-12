import { glob } from "tinyglobby";
import { DEFAULT_NAMING } from "../config/defaults.js";
import type { SourceConfig } from "../config/types.js";
import { resolveBase, type ResolvedBase } from "./naming.js";

export interface DiscoveredFile {
  source: SourceConfig;
  /** Path to the base file, relative to `cwd`. */
  path: string;
  base: ResolvedBase;
}

export interface DiscoverOptions {
  cwd: string;
  /** Default `baseSuffix` when a source doesn't set its own via `naming.baseSuffix`. */
  baseSuffix?: string;
}

/** Expands every `SourceConfig.glob` and pairs each match with its resolved `{ dir, base, ext }`. */
export async function discoverSourceFiles(
  sources: SourceConfig[],
  options: DiscoverOptions
): Promise<DiscoveredFile[]> {
  const defaultBaseSuffix = options.baseSuffix ?? DEFAULT_NAMING.baseSuffix;
  const results: DiscoveredFile[] = [];

  for (const source of sources) {
    const baseSuffix = source.naming?.baseSuffix ?? defaultBaseSuffix;
    const paths = await glob(source.glob, { cwd: options.cwd });
    for (const path of paths.sort()) {
      results.push({ source, path, base: resolveBase(path, baseSuffix) });
    }
  }

  return results;
}
