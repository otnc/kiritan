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

/**
 * `kiritan check` (docs/DESIGN.md 8章): finds missing/machine-translated content across every source.
 * Stale detection (hash-based) and `i18n-key-mismatch` (runtime resources) aren't implemented yet — neither strategy exists yet to produce them, so they simply never appear in `issues`.
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

  const failOn = new Set(config.check?.failOn ?? DEFAULT_FAIL_ON);
  const failed = issues.some((issue) => failOn.has(issue.kind));
  return { issues, failed };
}
