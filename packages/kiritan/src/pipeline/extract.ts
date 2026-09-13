import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { KiritanConfig } from "../config/types.js";
import { parseMarkdown } from "../directive/parse.js";
import { collectCatalogIds } from "../directive/render.js";
import { discoverSourceFiles } from "../discover/sources.js";
import {
  catalogPathFor,
  readCatalogFile,
  type CatalogData,
} from "../stores/catalog.js";

export interface ExtractChange {
  source: string;
  locale: string;
  detail: string;
}

export interface ExtractOptions {
  cwd?: string;
}

export interface ExtractResult {
  changes: ExtractChange[];
}

/**
 * `kiritan extract` (docs/DESIGN.md 4.3章): scaffolds each catalog-strategy source's catalog files.
 * Adds an empty `{ text: "" }` placeholder for every `:::kiritan{#<id>}` not yet in the catalog, ready for a translator to fill in — existing entries (translated or not) are never touched.
 * Also reports ids present in a catalog file but no longer in the base file, as orphans (left in place; `kiritan check` is what warns about them going forward).
 */
export async function extract(
  config: KiritanConfig,
  options: ExtractOptions = {}
): Promise<ExtractResult> {
  const cwd = options.cwd ?? process.cwd();
  const files = await discoverSourceFiles(config.sources, {
    cwd,
    baseSuffix: config.naming?.baseSuffix,
  });
  const changes: ExtractChange[] = [];

  for (const file of files) {
    if (file.source.strategy !== "catalog") continue;

    const sourceText = await readFile(join(cwd, file.path), "utf8");
    const ids = collectCatalogIds(parseMarkdown(sourceText));

    for (const locale of config.locales.list) {
      if (locale === config.locales.default) continue;

      const catalogPath = join(
        cwd,
        catalogPathFor(file.base.dir, file.base.base, locale)
      );
      const existing: CatalogData = (await readCatalogFile(catalogPath)) ?? {};
      let changed = false;

      for (const id of ids) {
        if (id in existing) continue;
        existing[id] = { text: "" };
        changed = true;
        changes.push({ source: file.path, locale, detail: `added id "${id}"` });
      }

      for (const id of Object.keys(existing)) {
        if (!ids.has(id)) {
          changes.push({
            source: file.path,
            locale,
            detail: `id "${id}" is orphaned (no longer in the base file)`,
          });
        }
      }

      if (changed) {
        await mkdir(dirname(catalogPath), { recursive: true });
        await writeFile(
          catalogPath,
          `${JSON.stringify(existing, null, 2)}\n`,
          "utf8"
        );
      }
    }
  }

  return { changes };
}
