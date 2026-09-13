import { join } from "node:path";
import type { ResourceModule } from "@kiritan/runtime";
import type { ResourceSourceConfig } from "../config/types.js";
import { discoverResourceFiles } from "./discover.js";
import {
  loadCentralizedResource,
  loadColocatedResource,
  loadEmbeddedResource,
  loadSplitResource,
  type FlatLocaleResource,
} from "./load.js";
import { splitLocaleFromPath } from "./locale-path.js";

export interface AggregatedResource {
  /** Identifies one runtime resource: the file path for `colocated`/`embedded`, or the locale-stripped shared path (`groupKey`) for `split`/`centralized`. */
  key: string;
  resource: ResourceModule;
  /** Files this resource was assembled from, relative to `cwd`. */
  files: string[];
}

function mergeFlatIntoModule(
  resource: ResourceModule,
  flat: FlatLocaleResource,
  locale: string
): void {
  for (const [key, value] of Object.entries(flat)) {
    resource[key] ??= {};
    resource[key][locale] = value;
  }
}

/**
 * Loads and groups every `runtime.sources` file into per-resource `ResourceModule`s (docs/DESIGN.md 9.1-9.5章).
 * `colocated`/`embedded` files already contain every locale, so each file becomes its own resource.
 * `split`/`centralized` files hold one locale each, so sibling files (matched via `splitLocaleFromPath`) are merged into one resource.
 * Files that fail to load, or whose path has no recognizable locale segment (for `split`/`centralized`), are silently skipped.
 */
export async function aggregateResources(
  sources: ResourceSourceConfig[],
  locales: string[],
  cwd: string
): Promise<AggregatedResource[]> {
  const perLocaleGroups = new Map<
    string,
    { resource: ResourceModule; files: string[] }
  >();
  const wholeResources: AggregatedResource[] = [];

  for (const { source, path } of await discoverResourceFiles(sources, {
    cwd,
  })) {
    const absolutePath = join(cwd, path);

    if (source.strategy === "colocated") {
      try {
        wholeResources.push({
          key: path,
          resource: await loadColocatedResource(absolutePath),
          files: [path],
        });
      } catch {
        // Skip files that fail to load (e.g. syntax errors) rather than failing the whole check.
      }
      continue;
    }

    if (source.strategy === "embedded") {
      try {
        wholeResources.push({
          key: path,
          resource: await loadEmbeddedResource(absolutePath, source.exportName),
          files: [path],
        });
      } catch {
        // Skip files that fail to load (e.g. syntax errors) rather than failing the whole check.
      }
      continue;
    }

    if (source.strategy === "split" || source.strategy === "centralized") {
      const split = splitLocaleFromPath(path, locales);
      if (!split) continue;

      try {
        const flat =
          source.strategy === "split"
            ? await loadSplitResource(absolutePath)
            : await loadCentralizedResource(absolutePath);

        const group = perLocaleGroups.get(split.groupKey) ?? {
          resource: {},
          files: [],
        };
        mergeFlatIntoModule(group.resource, flat, split.locale);
        group.files.push(path);
        perLocaleGroups.set(split.groupKey, group);
      } catch {
        // Skip files that fail to load (e.g. syntax errors) rather than failing the whole check.
      }
    }
  }

  const groupedResources: AggregatedResource[] = Array.from(
    perLocaleGroups.entries()
  ).map(([key, { resource, files }]) => ({
    key,
    resource,
    files: files.sort(),
  }));

  return [...wholeResources, ...groupedResources];
}
