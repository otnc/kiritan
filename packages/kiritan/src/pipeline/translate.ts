import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { resolveTargetLocales } from "../config/locale.js";
import type {
  KiritanConfig,
  Renderer,
  SourceConfig,
  StoreContext,
  TranslateContext,
  TranslationStore,
} from "../config/types.js";
import { collectCatalogSegments } from "../directive/render.js";
import { resolveNamingOptions, resolveOutputPath } from "../discover/naming.js";
import {
  discoverSourceFiles,
  type DiscoveredFile,
} from "../discover/sources.js";
import {
  extractHashComment,
  hashText,
  withHashComment,
} from "../hash/index.js";
import { resolveRenderer } from "../renderers/index.js";
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
  /** Restricts translation to this locale instead of every locale in `config.locales.list`. */
  locale?: string;
}

export interface TranslateResult {
  translated: TranslatedEntry[];
}

async function readFileIfExists(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

function middlewaresFor(source: SourceConfig, config: KiritanConfig) {
  return (source.translate ?? config.translate)?.middlewares ?? [];
}

async function translateSidecar(
  file: DiscoveredFile,
  renderer: Renderer,
  config: KiritanConfig,
  cwd: string,
  translated: TranslatedEntry[],
  allowedLocales: string[]
): Promise<void> {
  const middlewares = middlewaresFor(file.source, config);
  if (middlewares.length === 0) return;

  const naming = resolveNamingOptions(file.source.naming ?? config.naming);
  const sourceText = await readFile(join(cwd, file.path), "utf8");
  const sourceHash = hashText(sourceText);
  const staleOrMissingLocales: string[] = [];
  for (const locale of allowedLocales) {
    if (locale === config.locales.default) continue;
    const outPath = resolveOutputPath(
      file.base,
      locale,
      config.locales.default,
      naming
    );
    const existing = await readFileIfExists(join(cwd, outPath));
    if (existing === undefined) {
      staleOrMissingLocales.push(locale);
      continue;
    }
    const existingHash = renderer.comment
      ? extractHashComment(existing, renderer.comment)
      : undefined;
    if (existingHash && existingHash !== sourceHash) {
      staleOrMissingLocales.push(locale);
    }
  }
  if (staleOrMissingLocales.length === 0) return;

  const contexts: TranslateContext[] = staleOrMissingLocales.map((locale) => ({
    text: sourceText,
    from: config.locales.default,
    to: locale,
    source: file.source,
  }));
  const results = await runTranslateMiddlewares(middlewares, contexts);

  for (const [index, locale] of staleOrMissingLocales.entries()) {
    const result = results[index];
    if (result == null) continue;
    const outPath = resolveOutputPath(
      file.base,
      locale,
      config.locales.default,
      naming
    );
    await mkdir(dirname(join(cwd, outPath)), { recursive: true });
    await writeFile(
      join(cwd, outPath),
      renderer.comment
        ? withHashComment(result, sourceHash, renderer.comment)
        : result,
      "utf8"
    );
    translated.push({ source: file.path, locale, detail: `wrote ${outPath}` });
  }
}

async function translateCatalog(
  file: DiscoveredFile,
  renderer: Renderer,
  config: KiritanConfig,
  cwd: string,
  translated: TranslatedEntry[],
  allowedLocales: string[]
): Promise<void> {
  const middlewares = middlewaresFor(file.source, config);
  if (middlewares.length === 0) return;

  const sourceText = await readFile(join(cwd, file.path), "utf8");
  const segments = collectCatalogSegments(renderer.parse(sourceText));
  const segmentTextFor = (id: string) =>
    renderer.stringify({ type: "root", children: segments.get(id) ?? [] });
  const segmentHashFor = (id: string) => hashText(segmentTextFor(id));

  for (const locale of allowedLocales) {
    if (locale === config.locales.default) continue;
    const catalogPath = join(
      cwd,
      catalogPathFor(file.base.dir, file.base.base, locale)
    );
    const existing: CatalogData = (await readCatalogFile(catalogPath)) ?? {};
    const staleOrMissingIds = [...segments.keys()].filter((id) => {
      const entry = existing[id];
      if (!entry?.text) return true;
      return entry.hash !== undefined && entry.hash !== segmentHashFor(id);
    });
    if (staleOrMissingIds.length === 0) continue;

    const contexts: TranslateContext[] = staleOrMissingIds.map((id) => ({
      text: segmentTextFor(id),
      from: config.locales.default,
      to: locale,
      source: file.source,
      segmentId: id,
    }));
    const results = await runTranslateMiddlewares(middlewares, contexts);

    let changed = false;
    for (const [index, id] of staleOrMissingIds.entries()) {
      const result = results[index];
      if (result == null) continue;
      existing[id] = { text: result, machine: true, hash: segmentHashFor(id) };
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
 * A plugin store is a black box for staleness — rather than recomputing it, this trusts `store.status()` outright (matches `checkPluginStore` in `pipeline/check.ts`) and skips entirely once it reports `"complete"`. A `"full-text"` existing value (or nothing stored yet) is translated as one whole-document middleware call, mirroring `translateSidecar`. A `"segments"` value only has its still-empty ids filled in — per-id staleness isn't detectable through the generic `TranslationStore` contract, so a `"stale"`/`"partial"` status where every id already has text is a documented no-op. Does nothing if the store has no `write` (a read-only store, e.g. one backed by an external TMS kiritan can't push to).
 */
async function translatePluginStore(
  file: DiscoveredFile,
  renderer: Renderer,
  config: KiritanConfig,
  cwd: string,
  translated: TranslatedEntry[],
  allowedLocales: string[],
  store: TranslationStore
): Promise<void> {
  const middlewares = middlewaresFor(file.source, config);
  if (middlewares.length === 0) return;
  if (!store.write) return;

  const sourceText = await readFile(join(cwd, file.path), "utf8");
  const ctx: StoreContext = { source: file.source, filePath: file.path };

  for (const locale of allowedLocales) {
    if (locale === config.locales.default) continue;
    const status = await store.status(ctx, locale);
    if (status === "complete") continue;

    const existing = await store.read(ctx, locale);

    if (existing == null || existing.kind === "full-text") {
      const [result] = await runTranslateMiddlewares(middlewares, [
        {
          text: sourceText,
          from: config.locales.default,
          to: locale,
          source: file.source,
        },
      ]);
      if (result == null) continue;
      await store.write(ctx, locale, {
        kind: "full-text",
        text: result,
        machine: true,
      });
      translated.push({
        source: file.path,
        locale,
        detail: `wrote via plugin store "${store.id}"`,
      });
      continue;
    }

    const segments = collectCatalogSegments(renderer.parse(sourceText));
    const segmentTextFor = (id: string) =>
      renderer.stringify({ type: "root", children: segments.get(id) ?? [] });
    const idsNeedingTranslation = [...segments.keys()].filter(
      (id) => !existing.segments[id]?.text
    );
    if (idsNeedingTranslation.length === 0) continue;

    const contexts: TranslateContext[] = idsNeedingTranslation.map((id) => ({
      text: segmentTextFor(id),
      from: config.locales.default,
      to: locale,
      source: file.source,
      segmentId: id,
    }));
    const results = await runTranslateMiddlewares(middlewares, contexts);

    const merged = { ...existing.segments };
    let changed = false;
    for (const [index, id] of idsNeedingTranslation.entries()) {
      const result = results[index];
      if (result == null) continue;
      merged[id] = { text: result, machine: true };
      changed = true;
      translated.push({
        source: file.path,
        locale,
        detail: `catalog id "${id}" via plugin store "${store.id}"`,
      });
    }
    if (changed) {
      await store.write(ctx, locale, { kind: "segments", segments: merged });
    }
  }
}

/**
 * `kiritan translate` (docs/DESIGN.md chapter 7): fills in missing translations, and re-translates stale ones, via `translate.middlewares`.
 * A translation only counts as stale once it carries a hash (a `<!-- kiritan:hash ... -->` comment for `sidecar`, the catalog entry's `hash` field for `catalog`) that no longer matches the current source — one written by hand, with no hash yet, is left untouched.
 * Only runs for sources that actually configure middlewares — the default `middlewares: []` means nothing happens.
 * `inline` isn't supported yet (inserting a new locale block into the shared base file needs placement logic this doesn't have).
 */
export async function translate(
  config: KiritanConfig,
  options: TranslateOptions = {}
): Promise<TranslateResult> {
  const cwd = options.cwd ?? process.cwd();
  const targetLocales = resolveTargetLocales(config, options.locale);
  const files = await discoverSourceFiles(config.sources, {
    cwd,
    baseSuffix: config.naming?.baseSuffix,
  });
  const translated: TranslatedEntry[] = [];

  for (const file of files) {
    const renderer = resolveRenderer(config, file.source, file.path);
    if (file.source.strategy === "sidecar") {
      await translateSidecar(
        file,
        renderer,
        config,
        cwd,
        translated,
        targetLocales
      );
      continue;
    }
    if (file.source.strategy === "catalog") {
      await translateCatalog(
        file,
        renderer,
        config,
        cwd,
        translated,
        targetLocales
      );
      continue;
    }
    if (file.source.strategy === "inline") {
      if (middlewaresFor(file.source, config).length > 0) {
        throw new Error(
          `kiritan: "${file.path}" configures translate middlewares, but the "inline" strategy doesn't support auto-translation yet`
        );
      }
      continue;
    }

    const store = config.plugins?.stores?.[file.source.strategy];
    if (store) {
      await translatePluginStore(
        file,
        renderer,
        config,
        cwd,
        translated,
        targetLocales,
        store
      );
      continue;
    }

    throw new Error(
      `kiritan: the "${file.source.strategy}" strategy isn't implemented yet`
    );
  }

  return { translated };
}
