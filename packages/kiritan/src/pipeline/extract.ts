import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { resolveTargetLocales } from "../config/locale.js";
import type {
  KiritanConfig,
  StoreContext,
  TranslationStore,
} from "../config/types.js";
import { parseMarkdown, stringifyMarkdown } from "../directive/parse.js";
import { collectCatalogSegments } from "../directive/render.js";
import {
  discoverSourceFiles,
  type DiscoveredFile,
} from "../discover/sources.js";
import { hashText } from "../hash/index.js";
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
  /** Restricts extraction to this locale instead of every locale in `config.locales.list`. */
  locale?: string;
}

export interface ExtractResult {
  changes: ExtractChange[];
}

/**
 * The `plugins.stores` equivalent of the `catalog`-strategy scaffolding above, for a `"segments"`-shaped (or empty/`null`) store — a `"full-text"` result has no catalog ids to scaffold at all, so it's skipped, the same way a `sidecar`/`inline` source is skipped above. Does nothing if the store has no `write`.
 */
async function extractPluginStore(
  file: DiscoveredFile,
  config: KiritanConfig,
  cwd: string,
  changes: ExtractChange[],
  store: TranslationStore,
  targetLocales: string[]
): Promise<void> {
  if (!store.write) return;

  const sourceText = await readFile(join(cwd, file.path), "utf8");
  const segments = collectCatalogSegments(parseMarkdown(sourceText));
  const ids = new Set(segments.keys());
  const ctx: StoreContext = { source: file.source, filePath: file.path };

  for (const locale of targetLocales) {
    if (locale === config.locales.default) continue;

    const existing = await store.read(ctx, locale);
    if (existing?.kind === "full-text") continue;

    const segmentsMap = {
      ...(existing?.kind === "segments" ? existing.segments : {}),
    };
    let changed = false;

    for (const id of ids) {
      if (id in segmentsMap) continue;
      segmentsMap[id] = { text: "" };
      changed = true;
      changes.push({
        source: file.path,
        locale,
        detail: `added id "${id}" via plugin store "${store.id}"`,
      });
    }

    for (const id of Object.keys(segmentsMap)) {
      if (!ids.has(id)) {
        changes.push({
          source: file.path,
          locale,
          detail: `id "${id}" is orphaned (no longer in the base file) in plugin store "${store.id}"`,
        });
      }
    }

    if (changed) {
      await store.write(ctx, locale, {
        kind: "segments",
        segments: segmentsMap,
      });
    }
  }
}

/**
 * `kiritan extract` (docs/DESIGN.md chapter 4.3): scaffolds each catalog-strategy source's catalog files.
 * Adds an empty `{ text: "" }` placeholder for every `:::kiritan{#<id>}` not yet in the catalog, ready for a translator to fill in — existing entries (translated or not) are never touched.
 * Also reports ids present in a catalog file but no longer in the base file, as orphans (left in place; `kiritan check` is what warns about them going forward).
 */
export async function extract(
  config: KiritanConfig,
  options: ExtractOptions = {}
): Promise<ExtractResult> {
  const cwd = options.cwd ?? process.cwd();
  const targetLocales = resolveTargetLocales(config, options.locale);
  const files = await discoverSourceFiles(config.sources, {
    cwd,
    baseSuffix: config.naming?.baseSuffix,
  });
  const changes: ExtractChange[] = [];

  for (const file of files) {
    if (
      file.source.strategy === "sidecar" ||
      file.source.strategy === "inline"
    ) {
      continue;
    }

    if (file.source.strategy !== "catalog") {
      const store = config.plugins?.stores?.[file.source.strategy];
      if (store) {
        await extractPluginStore(
          file,
          config,
          cwd,
          changes,
          store,
          targetLocales
        );
        continue;
      }
      throw new Error(
        `kiritan: the "${file.source.strategy}" strategy isn't implemented yet`
      );
    }

    const sourceText = await readFile(join(cwd, file.path), "utf8");
    const segments = collectCatalogSegments(parseMarkdown(sourceText));
    const ids = new Set(segments.keys());

    for (const locale of targetLocales) {
      if (locale === config.locales.default) continue;

      const catalogPath = join(
        cwd,
        catalogPathFor(file.base.dir, file.base.base, locale)
      );
      const existing: CatalogData = (await readCatalogFile(catalogPath)) ?? {};
      let changed = false;

      for (const id of ids) {
        if (id in existing) continue;
        const hash = hashText(
          stringifyMarkdown({ type: "root", children: segments.get(id) ?? [] })
        );
        existing[id] = { text: "", hash };
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
