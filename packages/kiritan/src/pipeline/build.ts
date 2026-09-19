import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { InterpolationParams } from "@kiritan/runtime";
import type { Root, RootContent } from "mdast";
import type {
  BuildContext,
  KiritanConfig,
  Renderer,
  SourceConfig,
  StoreContext,
  SwitcherConfig,
} from "../config/types.js";
import { resolveTargetLocales } from "../config/locale.js";
import { renderForLocale } from "../directive/render.js";
import { resolveNamingOptions, resolveOutputPath } from "../discover/naming.js";
import { discoverSourceFiles } from "../discover/sources.js";
import { interpolateTree } from "../interpolate/index.js";
import { resolveRenderer } from "../renderers/index.js";
import { catalogPathFor, readCatalogFile } from "../stores/catalog.js";
import {
  buildSwitcherLinks,
  ensureSwitcherMarker,
  renderSwitcher,
} from "../switcher/index.js";

export interface BuildOptions {
  cwd?: string;
  /** Restricts the build to this locale instead of every locale in `config.locales.list`. */
  locale?: string;
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
  tree: Root,
  renderer: Renderer,
  config: KiritanConfig,
  locale: string
): string {
  const interpolated = interpolateTree(
    tree,
    resolveVariables(config, locale),
    config.interpolation
  );
  return renderer.stringify(interpolated);
}

// A leading `---` YAML block only counts as front matter as the very first thing in the file, so a marker has to go after it, not before.
const FRONT_MATTER = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/;

function insertAfterFrontMatter(source: string, marker: string): string {
  const end = FRONT_MATTER.exec(source)?.[0].length ?? 0;
  const head = source.slice(0, end);
  const separator = head && !head.endsWith("\n") ? "\n" : "";
  return (
    head + separator + marker + "\n\n" + source.slice(end).replace(/^\r?\n/, "")
  );
}

/** `kiritan build` (docs/DESIGN.md chapter 2): discover -> parse -> resolve -> interpolate -> reassemble -> write. */
export async function build(
  config: KiritanConfig,
  options: BuildOptions = {}
): Promise<BuildResult> {
  const cwd = options.cwd ?? process.cwd();
  const targetLocales = resolveTargetLocales(config, options.locale);
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

    const renderer = resolveRenderer(config, file.source, file.path);
    // A format without directives (e.g. plain text) has nothing for `renderForLocale` to resolve and nowhere to put a switcher.
    const prepareTree = (text: string): Root => {
      const tree = renderer.parse(text);
      return renderer.supportsDirectives === false
        ? tree
        : ensureSwitcherMarker(tree, switcherConfig);
    };
    const renderOptions = (locale: string, outPath: string) => ({
      targetLocale: locale,
      defaultLocale: config.locales.default,
      renderSwitcher: renderSwitcherFor(locale, outPath),
      parseFragment: (text: string) => renderer.parse(text).children,
      comment: renderer.comment ?? null,
    });

    const sourceText = await readFile(join(cwd, file.path), "utf8");

    if (file.source.strategy === "sidecar") {
      for (const locale of targetLocales) {
        const outPath = outputPathFor(locale);
        let text = sourceText;
        if (locale !== config.locales.default) {
          try {
            text = await readFile(join(cwd, outPath), "utf8");
          } catch {
            text = renderer.comment
              ? insertAfterFrontMatter(
                  sourceText,
                  renderer.comment(
                    `kiritan:untranslated (source: ${config.locales.default})`
                  )
                )
              : sourceText;
          }
        }
        const tree = prepareTree(text);
        const rendered = renderForLocale(tree, renderOptions(locale, outPath));
        await writeOutput(
          cwd,
          outPath,
          finalizeTree(rendered, renderer, config, locale)
        );
        written.push(outPath);
      }
      continue;
    }

    if (file.source.strategy === "inline") {
      const baseTree = prepareTree(sourceText);
      for (const locale of targetLocales) {
        const outPath = outputPathFor(locale);
        const rendered = renderForLocale(
          baseTree,
          renderOptions(locale, outPath)
        );
        await writeOutput(
          cwd,
          outPath,
          finalizeTree(rendered, renderer, config, locale)
        );
        written.push(outPath);
      }
      continue;
    }

    if (file.source.strategy === "catalog") {
      const baseTree = prepareTree(sourceText);
      for (const locale of targetLocales) {
        const outPath = outputPathFor(locale);
        const catalogData =
          locale === config.locales.default
            ? undefined
            : await readCatalogFile(
                join(cwd, catalogPathFor(file.base.dir, file.base.base, locale))
              );
        const rendered = renderForLocale(baseTree, {
          ...renderOptions(locale, outPath),
          resolveCatalogText: catalogData
            ? (id) => catalogData[id]?.text
            : undefined,
        });
        await writeOutput(
          cwd,
          outPath,
          finalizeTree(rendered, renderer, config, locale)
        );
        written.push(outPath);
      }
      continue;
    }

    const store = config.plugins?.stores?.[file.source.strategy];
    if (store) {
      const baseTree = prepareTree(sourceText);
      const ctx: StoreContext = { source: file.source, filePath: file.path };

      for (const locale of targetLocales) {
        const outPath = outputPathFor(locale);

        if (locale === config.locales.default) {
          const rendered = renderForLocale(
            baseTree,
            renderOptions(locale, outPath)
          );
          await writeOutput(
            cwd,
            outPath,
            finalizeTree(rendered, renderer, config, locale)
          );
          written.push(outPath);
          continue;
        }

        const content = await store.read(ctx, locale);

        // A "full-text" result replaces the whole document, the same way a sidecar file's own content does — it's parsed fresh rather than layered onto the base tree.
        if (content?.kind === "full-text") {
          const tree = prepareTree(content.text);
          const rendered = renderForLocale(
            tree,
            renderOptions(locale, outPath)
          );
          await writeOutput(
            cwd,
            outPath,
            finalizeTree(rendered, renderer, config, locale)
          );
          written.push(outPath);
          continue;
        }

        // A "segments" result (or nothing stored yet) is treated catalog-style — renderForLocale's own per-id fallback handles a missing id or a null/undefined content.
        const segments =
          content?.kind === "segments" ? content.segments : undefined;
        const rendered = renderForLocale(baseTree, {
          ...renderOptions(locale, outPath),
          resolveCatalogText: segments ? (id) => segments[id]?.text : undefined,
        });
        await writeOutput(
          cwd,
          outPath,
          finalizeTree(rendered, renderer, config, locale)
        );
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
