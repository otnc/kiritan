import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { KiritanConfig } from "../config/types.js";
import { parseMarkdown } from "../directive/parse.js";
import { collectCatalogIds, collectLocaleBlocks } from "../directive/render.js";
import { resolveNamingOptions, resolveOutputPath } from "../discover/naming.js";
import {
  discoverSourceFiles,
  type DiscoveredFile,
} from "../discover/sources.js";
import { discoverResourceFiles } from "../i18n/discover.js";
import { loadColocatedResource } from "../i18n/load.js";
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

async function fileExists(path: string): Promise<boolean> {
  try {
    await readFile(path, "utf8");
    return true;
  } catch {
    return false;
  }
}

async function checkSidecar(
  file: DiscoveredFile,
  config: KiritanConfig,
  cwd: string,
  issues: CheckIssue[]
): Promise<void> {
  const naming = resolveNamingOptions(file.source.naming ?? config.naming);
  for (const locale of config.locales.list) {
    if (locale === config.locales.default) continue;
    const outPath = resolveOutputPath(
      file.base,
      locale,
      config.locales.default,
      naming
    );
    if (!(await fileExists(join(cwd, outPath)))) {
      issues.push({
        kind: "missing",
        source: file.path,
        locale,
        detail: `sidecar file "${outPath}" does not exist`,
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
  const ids = collectCatalogIds(parseMarkdown(sourceText));
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
        });
      } else if (entry.machine) {
        issues.push({
          kind: "machine",
          source: file.path,
          locale,
          detail: `catalog id "${id}" is machine-translated and needs review`,
        });
      }
    }
  }
}

async function checkRuntimeResources(
  config: KiritanConfig,
  cwd: string,
  issues: CheckIssue[]
): Promise<void> {
  const sources = (config.runtime?.sources ?? []).filter(
    (source) => source.strategy === "colocated"
  );
  if (sources.length === 0) return;

  const files = await discoverResourceFiles(sources, { cwd });
  for (const file of files) {
    let resource;
    try {
      resource = await loadColocatedResource(join(cwd, file.path));
    } catch {
      continue;
    }
    for (const mismatch of findKeyMismatches(resource, config.locales.list)) {
      issues.push({
        kind: "i18n-key-mismatch",
        source: file.path,
        locale: mismatch.missingLocales.join(", "),
        detail: `key "${mismatch.key}" is missing locale(s): ${mismatch.missingLocales.join(", ")}`,
      });
    }
  }
}

/**
 * `kiritan check` (docs/DESIGN.md 8章): finds missing/machine-translated content across every source, plus `i18n-key-mismatch` for `runtime.sources` using the `colocated` strategy.
 * Stale detection (hash-based) isn't implemented yet, and `split`/`centralized`/`embedded` runtime resource strategies aren't discovered here yet either — neither exists yet to produce those, so they simply never appear in `issues`.
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
    if (file.source.strategy === "sidecar") {
      await checkSidecar(file, config, cwd, issues);
      continue;
    }

    const sourceText = await readFile(join(cwd, file.path), "utf8");

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
