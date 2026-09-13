import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  KiritanConfig,
  SourceConfig,
  TranslateContext,
} from "../config/types.js";
import { parseMarkdown, stringifyMarkdown } from "../directive/parse.js";
import { collectCatalogSegments } from "../directive/render.js";
import { resolveNamingOptions, resolveOutputPath } from "../discover/naming.js";
import {
  discoverSourceFiles,
  type DiscoveredFile,
} from "../discover/sources.js";
import {
  catalogPathFor,
  readCatalogFile,
  type CatalogData,
} from "../stores/catalog.js";
import { runTranslateMiddlewares } from "../translate/run.js";

export interface TranslatedEntry {
  source: string;
  locale: string;
  detail: string;
}

export interface TranslateOptions {
  cwd?: string;
}

export interface TranslateResult {
  translated: TranslatedEntry[];
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await readFile(path, "utf8");
    return true;
  } catch {
    return false;
  }
}

function middlewaresFor(source: SourceConfig, config: KiritanConfig) {
  return (source.translate ?? config.translate)?.middlewares ?? [];
}

async function translateSidecar(
  file: DiscoveredFile,
  config: KiritanConfig,
  cwd: string,
  translated: TranslatedEntry[]
): Promise<void> {
  const middlewares = middlewaresFor(file.source, config);
  if (middlewares.length === 0) return;

  const naming = resolveNamingOptions(file.source.naming ?? config.naming);
  const sourceText = await readFile(join(cwd, file.path), "utf8");
  const missingLocales: string[] = [];
  for (const locale of config.locales.list) {
    if (locale === config.locales.default) continue;
    const outPath = resolveOutputPath(
      file.base,
      locale,
      config.locales.default,
      naming
    );
    if (!(await fileExists(join(cwd, outPath)))) missingLocales.push(locale);
  }
  if (missingLocales.length === 0) return;

  const contexts: TranslateContext[] = missingLocales.map((locale) => ({
    text: sourceText,
    from: config.locales.default,
    to: locale,
    source: file.source,
  }));
  const results = await runTranslateMiddlewares(middlewares, contexts);

  for (const [index, locale] of missingLocales.entries()) {
    const result = results[index];
    if (result == null) continue;
    const outPath = resolveOutputPath(
      file.base,
      locale,
      config.locales.default,
      naming
    );
    await mkdir(dirname(join(cwd, outPath)), { recursive: true });
    await writeFile(join(cwd, outPath), result, "utf8");
    translated.push({ source: file.path, locale, detail: `wrote ${outPath}` });
  }
}

async function translateCatalog(
  file: DiscoveredFile,
  config: KiritanConfig,
  cwd: string,
  translated: TranslatedEntry[]
): Promise<void> {
  const middlewares = middlewaresFor(file.source, config);
  if (middlewares.length === 0) return;

  const sourceText = await readFile(join(cwd, file.path), "utf8");
  const segments = collectCatalogSegments(parseMarkdown(sourceText));

  for (const locale of config.locales.list) {
    if (locale === config.locales.default) continue;
    const catalogPath = join(
      cwd,
      catalogPathFor(file.base.dir, file.base.base, locale)
    );
    const existing: CatalogData = (await readCatalogFile(catalogPath)) ?? {};
    const missingIds = [...segments.keys()].filter((id) => !existing[id]?.text);
    if (missingIds.length === 0) continue;

    const contexts: TranslateContext[] = missingIds.map((id) => ({
      text: stringifyMarkdown({ type: "root", children: segments.get(id)! }),
      from: config.locales.default,
      to: locale,
      source: file.source,
      segmentId: id,
    }));
    const results = await runTranslateMiddlewares(middlewares, contexts);

    let changed = false;
    for (const [index, id] of missingIds.entries()) {
      const result = results[index];
      if (result == null) continue;
      existing[id] = { text: result, machine: true };
      changed = true;
      translated.push({
        source: file.path,
        locale,
        detail: `catalog id "${id}"`,
      });
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

/**
 * `kiritan translate` (docs/DESIGN.md 7章): fills in missing translations via `translate.middlewares`.
 * Only runs for sources that actually configure middlewares — the default `middlewares: []` means nothing happens.
 * `inline` isn't supported yet (inserting a new locale block into the shared base file needs placement logic this doesn't have).
 */
export async function translate(
  config: KiritanConfig,
  options: TranslateOptions = {}
): Promise<TranslateResult> {
  const cwd = options.cwd ?? process.cwd();
  const files = await discoverSourceFiles(config.sources, {
    cwd,
    baseSuffix: config.naming?.baseSuffix,
  });
  const translated: TranslatedEntry[] = [];

  for (const file of files) {
    if (file.source.strategy === "sidecar") {
      await translateSidecar(file, config, cwd, translated);
      continue;
    }
    if (file.source.strategy === "catalog") {
      await translateCatalog(file, config, cwd, translated);
      continue;
    }
    if (
      file.source.strategy === "inline" &&
      middlewaresFor(file.source, config).length > 0
    ) {
      throw new Error(
        `kiritan: "${file.path}" configures translate middlewares, but the "inline" strategy doesn't support auto-translation yet`
      );
    }
  }

  return { translated };
}
