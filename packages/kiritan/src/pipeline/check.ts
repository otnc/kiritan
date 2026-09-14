import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { KiritanConfig } from "../config/types.js";
import { parseMarkdown, stringifyMarkdown } from "../directive/parse.js";
import {
  collectCatalogIds,
  collectCatalogSegments,
  collectLocaleBlocks,
} from "../directive/render.js";
import { resolveNamingOptions, resolveOutputPath } from "../discover/naming.js";
import {
  discoverSourceFiles,
  type DiscoveredFile,
} from "../discover/sources.js";
import { extractHashComment, hashText } from "../hash/index.js";
import { aggregateResources } from "../i18n/aggregate.js";
import { findKeyMismatches } from "../i18n/mismatch.js";
import { catalogPathFor, readCatalogFile } from "../stores/catalog.js";

export type CheckIssueKind =
  "missing" | "stale" | "machine" | "i18n-key-mismatch";

export interface CheckIssue {
  kind: CheckIssueKind;
  /** The base file's path, relative to `cwd`. */
  source: string;
  locale: string;
  detail: string;
  /** The catalog-strategy segment id this issue is about, if any. */
  id?: string;
}

export interface CheckOptions {
  cwd?: string;
}

export interface CheckResult {
  issues: CheckIssue[];
  /** Whether any issue's kind is in `config.check.failOn` (defaults applied). */
  failed: boolean;
}

const DEFAULT_FAIL_ON: CheckIssueKind[] = [
  "missing",
  "stale",
  "i18n-key-mismatch",
];

async function readFileIfExists(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

async function checkSidecar(
  file: DiscoveredFile,
  sourceText: string,
  config: KiritanConfig,
  cwd: string,
  issues: CheckIssue[]
): Promise<void> {
  const naming = resolveNamingOptions(file.source.naming ?? config.naming);
  const sourceHash = hashText(sourceText);
  for (const locale of config.locales.list) {
    if (locale === config.locales.default) continue;
    const outPath = resolveOutputPath(
      file.base,
      locale,
      config.locales.default,
      naming
    );
    const outputText = await readFileIfExists(join(cwd, outPath));
    if (outputText === undefined) {
      issues.push({
        kind: "missing",
        source: file.path,
        locale,
        detail: `sidecar file "${outPath}" does not exist`,
      });
      continue;
    }

    // No hash comment means the file predates this feature (or was hand-authored without one) — only flag staleness once a hash comment exists and no longer matches.
    const existingHash = extractHashComment(outputText);
    if (existingHash && existingHash !== sourceHash) {
      issues.push({
        kind: "stale",
        source: file.path,
        locale,
        detail: `sidecar file "${outPath}" is stale (source changed since it was last translated)`,
      });
    }
  }
}

function checkInline(
  file: DiscoveredFile,
  sourceText: string,
  config: KiritanConfig,
  issues: CheckIssue[]
): void {
  const declared = collectLocaleBlocks(parseMarkdown(sourceText));
  for (const locale of config.locales.list) {
    if (locale === config.locales.default) continue;
    if (!declared.has(locale)) {
      issues.push({
        kind: "missing",
        source: file.path,
        locale,
        detail: `no :::kiritan{locale=${locale}} block`,
      });
    }
  }
}

async function checkCatalog(
  file: DiscoveredFile,
  sourceText: string,
  config: KiritanConfig,
  cwd: string,
  issues: CheckIssue[]
): Promise<void> {
  const tree = parseMarkdown(sourceText);
  const ids = collectCatalogIds(tree);
  const segments = collectCatalogSegments(tree);
  for (const locale of config.locales.list) {
    if (locale === config.locales.default) continue;
    const catalogData = await readCatalogFile(
      join(cwd, catalogPathFor(file.base.dir, file.base.base, locale))
    );
    for (const id of ids) {
      const entry = catalogData?.[id];
      if (!entry?.text) {
        issues.push({
          kind: "missing",
          source: file.path,
          locale,
          detail: `catalog id "${id}" has no translation`,
          id,
        });
        continue;
      }

      if (entry.machine) {
        issues.push({
          kind: "machine",
          source: file.path,
          locale,
          detail: `catalog id "${id}" is machine-translated and needs review`,
          id,
        });
      }

      // No stored hash means the entry predates this feature (or was written by hand) — only flag staleness once a hash exists and no longer matches.
      if (entry.hash) {
        const currentHash = hashText(
          stringifyMarkdown({ type: "root", children: segments.get(id) ?? [] })
        );
        if (currentHash !== entry.hash) {
          issues.push({
            kind: "stale",
            source: file.path,
            locale,
            detail: `catalog id "${id}" is stale (source changed since it was last translated)`,
            id,
          });
        }
      }
    }
  }
}

async function checkRuntimeResources(
  config: KiritanConfig,
  cwd: string,
  issues: CheckIssue[]
): Promise<void> {
  const sources = config.runtime?.sources ?? [];
  if (sources.length === 0) return;

  const aggregated = await aggregateResources(
    sources,
    config.locales.list,
    cwd
  );
  for (const { resource, files } of aggregated) {
    for (const mismatch of findKeyMismatches(resource, config.locales.list)) {
      issues.push({
        kind: "i18n-key-mismatch",
        source: files.join(", "),
        locale: mismatch.missingLocales.join(", "),
        detail: `key "${mismatch.key}" is missing locale(s): ${mismatch.missingLocales.join(", ")}`,
      });
    }
  }
}

/**
 * The set of `%{name}` variable names `config.interpolation.variables` declares — for the function form, called once with the default locale as a representative context, since variable *names* aren't expected to vary by locale (only their translated values are). Used for undefined-variable detection (editor tooling only; the build pipeline itself resolves values per-locale via `resolveVariables` in pipeline/build.ts).
 */
export function resolveInterpolationVariableNames(
  config: KiritanConfig
): string[] {
  const variables = config.interpolation?.variables;
  if (!variables) return [];
  const raw =
    typeof variables === "function"
      ? variables({
          locale: config.locales.default,
          defaultLocale: config.locales.default,
        })
      : variables;
  return Object.keys(raw);
}

/**
 * `kiritan check` (docs/DESIGN.md chapter 8): finds missing/stale/machine-translated content across every source, plus `i18n-key-mismatch` for every `runtime.sources` strategy (`colocated`/`split`/`centralized`/`embedded`).
 * Stale detection compares a hash embedded at translation time (a `<!-- kiritan:hash ... -->` comment for `sidecar`, the catalog entry's `hash` field for `catalog`) against the source's current hash; a file/entry with no hash yet (predating this feature, or hand-authored) is never flagged.
 * `inline` has no stale detection yet, since there's no per-block place to embed a hash without kiritan owning the base file's translated content.
 */
export async function check(
  config: KiritanConfig,
  options: CheckOptions = {}
): Promise<CheckResult> {
  const cwd = options.cwd ?? process.cwd();
  const files = await discoverSourceFiles(config.sources, {
    cwd,
    baseSuffix: config.naming?.baseSuffix,
  });
  const issues: CheckIssue[] = [];

  for (const file of files) {
    const sourceText = await readFile(join(cwd, file.path), "utf8");

    if (file.source.strategy === "sidecar") {
      await checkSidecar(file, sourceText, config, cwd, issues);
      continue;
    }

    if (file.source.strategy === "inline") {
      checkInline(file, sourceText, config, issues);
      continue;
    }

    if (file.source.strategy === "catalog") {
      await checkCatalog(file, sourceText, config, cwd, issues);
      continue;
    }
  }

  await checkRuntimeResources(config, cwd, issues);

  const failOn = new Set(config.check?.failOn ?? DEFAULT_FAIL_ON);
  const failed = issues.some((issue) => failOn.has(issue.kind));
  return { issues, failed };
}
