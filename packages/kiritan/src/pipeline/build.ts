import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { InterpolationParams } from "@kiritan/runtime";
import type { RootContent } from "mdast";
import type {
  BuildContext,
  KiritanConfig,
  SourceConfig,
  SwitcherConfig,
} from "../config/types.js";
import { parseMarkdown, stringifyMarkdown } from "../directive/parse.js";
import { renderForLocale } from "../directive/render.js";
import { resolveNamingOptions, resolveOutputPath } from "../discover/naming.js";
import { discoverSourceFiles } from "../discover/sources.js";
import { interpolateTree } from "../interpolate/index.js";
import { catalogPathFor, readCatalogFile } from "../stores/catalog.js";
import {
  buildSwitcherLinks,
  ensureSwitcherMarker,
  renderSwitcher,
} from "../switcher/index.js";

export interface BuildOptions {
  cwd?: string;
}

export interface BuildResult {
  /** Output paths written, relative to `cwd`. */
  written: string[];
}

function resolveVariableValue(
  value: string | Record<string, string>,
  locale: string,
  defaultLocale: string
): string {
  if (typeof value === "string") return value;
  return value[locale] ?? value[defaultLocale] ?? Object.values(value)[0] ?? "";
}

function resolveVariables(
  config: KiritanConfig,
  locale: string
): InterpolationParams {
  const variables = config.interpolation?.variables;
  const ctx: BuildContext = { locale, defaultLocale: config.locales.default };
  const raw =
    typeof variables === "function" ? variables(ctx) : (variables ?? {});
  const resolved: InterpolationParams = {};
  for (const [key, value] of Object.entries(raw)) {
    resolved[key] = resolveVariableValue(value, locale, config.locales.default);
  }
  return resolved;
}

async function writeOutput(
  cwd: string,
  relativePath: string,
  content: string
): Promise<void> {
  const fullPath = join(cwd, relativePath);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, "utf8");
}

function resolveSwitcherConfig(
  source: SourceConfig,
  config: KiritanConfig
): SwitcherConfig {
  return source.switcher ?? config.switcher ?? {};
}

/** Builds one locale's document, given its already-directive-resolved tree. */
function finalizeTree(
  tree: ReturnType<typeof parseMarkdown>,
  config: KiritanConfig,
  locale: string
): string {
  const interpolated = interpolateTree(
    tree,
    resolveVariables(config, locale),
    config.interpolation
  );
  return stringifyMarkdown(interpolated);
}

/** `kiritan build` (docs/DESIGN.md chapter 2): discover -> parse -> resolve -> interpolate -> reassemble -> write. */
export async function build(
  config: KiritanConfig,
  options: BuildOptions = {}
): Promise<BuildResult> {
  const cwd = options.cwd ?? process.cwd();
  const files = await discoverSourceFiles(config.sources, {
    cwd,
    baseSuffix: config.naming?.baseSuffix,
  });
  const written: string[] = [];

  for (const file of files) {
    const naming = resolveNamingOptions(file.source.naming ?? config.naming);
    const outputPathFor = (locale: string) =>
      resolveOutputPath(file.base, locale, config.locales.default, naming);
    const switcherConfig = resolveSwitcherConfig(file.source, config);

    const renderSwitcherFor =
      (locale: string, outPath: string) => (): RootContent[] =>
        renderSwitcher(
          locale,
          buildSwitcherLinks({
            locales: config.locales.list,
            currentLocale: locale,
            currentOutputPath: outPath,
            outputPathFor,
            labels: switcherConfig.labels,
          }),
          switcherConfig
        );

    const sourceText = await readFile(join(cwd, file.path), "utf8");

    if (file.source.strategy === "sidecar") {
      for (const locale of config.locales.list) {
        const outPath = outputPathFor(locale);
        let text = sourceText;
        if (locale !== config.locales.default) {
          try {
            text = await readFile(join(cwd, outPath), "utf8");
          } catch {
            text = `<!-- kiritan:untranslated (source: ${config.locales.default}) -->\n\n${sourceText}`;
          }
        }
        const tree = ensureSwitcherMarker(parseMarkdown(text), switcherConfig);
        const rendered = renderForLocale(tree, {
          targetLocale: locale,
          defaultLocale: config.locales.default,
          renderSwitcher: renderSwitcherFor(locale, outPath),
        });
        await writeOutput(cwd, outPath, finalizeTree(rendered, config, locale));
        written.push(outPath);
      }
      continue;
    }

    if (file.source.strategy === "inline") {
      const baseTree = ensureSwitcherMarker(
        parseMarkdown(sourceText),
        switcherConfig
      );
      for (const locale of config.locales.list) {
        const outPath = outputPathFor(locale);
        const rendered = renderForLocale(baseTree, {
          targetLocale: locale,
          defaultLocale: config.locales.default,
          renderSwitcher: renderSwitcherFor(locale, outPath),
        });
        await writeOutput(cwd, outPath, finalizeTree(rendered, config, locale));
        written.push(outPath);
      }
      continue;
    }

    if (file.source.strategy === "catalog") {
      const baseTree = ensureSwitcherMarker(
        parseMarkdown(sourceText),
        switcherConfig
      );
      for (const locale of config.locales.list) {
        const outPath = outputPathFor(locale);
        const catalogData =
          locale === config.locales.default
            ? undefined
            : await readCatalogFile(
                join(cwd, catalogPathFor(file.base.dir, file.base.base, locale))
              );
        const rendered = renderForLocale(baseTree, {
          targetLocale: locale,
          defaultLocale: config.locales.default,
          resolveCatalogText: catalogData
            ? (id) => catalogData[id]?.text
            : undefined,
          renderSwitcher: renderSwitcherFor(locale, outPath),
        });
        await writeOutput(cwd, outPath, finalizeTree(rendered, config, locale));
        written.push(outPath);
      }
      continue;
    }

    throw new Error(
      `kiritan: the "${file.source.strategy}" strategy isn't implemented yet`
    );
  }

  return { written };
}
