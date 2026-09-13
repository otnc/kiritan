import type { Root, RootContent } from "mdast";
import { parseMarkdown } from "./parse.js";

/**
 * mdast-util-directive's node shape, viewed structurally. We deliberately don't try to extend `RootContent` (a large discriminated union) — a plain duck-typed view keeps the tree-rewriting logic below readable.
 */
interface DirectiveLike {
  type: string;
  name?: string;
  attributes?: Record<string, string | null | undefined> | null;
  children?: RootContent[];
}

function asDirective(node: RootContent): DirectiveLike {
  return node as unknown as DirectiveLike;
}

function isKiritanContainerDirective(node: RootContent): boolean {
  const directive = asDirective(node);
  return (
    directive.type === "containerDirective" && directive.name === "kiritan"
  );
}

function isKiritanLeafDirective(node: RootContent): boolean {
  const directive = asDirective(node);
  return directive.type === "leafDirective" && directive.name === "kiritan";
}

function childrenOf(node: RootContent): RootContent[] {
  return asDirective(node).children ?? [];
}

export type FallbackKind = "locale-block" | "catalog-id";

export interface RenderForLocaleOptions {
  targetLocale: string;
  defaultLocale: string;
  /** catalog戦略のみ: idとロケールから訳文を引く。無ければ base ロケールの原文にフォールバックする。 */
  resolveCatalogText?: (id: string, locale: string) => string | undefined;
  /** `::kiritan{switcher}` の位置に差し込むノード群。省略時、その位置は単に取り除かれる。 */
  renderSwitcher?: () => RootContent[];
  /** フォールバック(未翻訳)が発生するたびに呼ばれる。`kiritan check` 等での検出に使う。 */
  onFallback?: (kind: FallbackKind, key: string) => void;
}

function fallbackCommentNode(defaultLocale: string): RootContent {
  return {
    type: "html",
    value: `<!-- kiritan:untranslated (source: ${defaultLocale}) -->`,
  } as RootContent;
}

function parseFragment(text: string): RootContent[] {
  return parseMarkdown(text).children;
}

function transformNodes(
  nodes: RootContent[],
  options: RenderForLocaleOptions
): RootContent[] {
  const result: RootContent[] = [];

  for (const node of nodes) {
    if (isKiritanContainerDirective(node)) {
      const attributes = asDirective(node).attributes ?? {};
      const locale = attributes.locale ?? undefined;
      const id = attributes.id ?? undefined;

      if (locale !== undefined) {
        if (locale === options.targetLocale) {
          result.push(...transformNodes(childrenOf(node), options));
        }
        continue;
      }

      if (id !== undefined) {
        if (options.targetLocale === options.defaultLocale) {
          result.push(...transformNodes(childrenOf(node), options));
        } else {
          const translated = options.resolveCatalogText?.(
            id,
            options.targetLocale
          );
          if (translated !== undefined) {
            result.push(...parseFragment(translated));
          } else {
            options.onFallback?.("catalog-id", id);
            result.push(fallbackCommentNode(options.defaultLocale));
            result.push(...transformNodes(childrenOf(node), options));
          }
        }
        continue;
      }

      throw new Error(
        'kiritan: a ":::kiritan" directive needs either a "locale" or "#<id>" attribute'
      );
    }

    if (isKiritanLeafDirective(node)) {
      const attributes = asDirective(node).attributes ?? {};
      if ("switcher" in attributes) {
        result.push(...(options.renderSwitcher?.() ?? []));
        continue;
      }
      throw new Error(
        'kiritan: unrecognized "::kiritan" directive (expected "switcher")'
      );
    }

    const children = asDirective(node).children;
    if (children) {
      result.push({
        ...node,
        children: transformNodes(children, options),
      } as RootContent);
    } else {
      result.push(node);
    }
  }

  return result;
}

/** Produces the tree for one locale's build by resolving every `:::kiritan{...}`/`::kiritan{...}` directive. */
export function renderForLocale(
  tree: Root,
  options: RenderForLocaleOptions
): Root {
  return { ...tree, children: transformNodes(tree.children, options) };
}

function collectContainerAttribute(
  tree: Root,
  attribute: "locale" | "id"
): Set<string> {
  const values = new Set<string>();
  function walk(nodes: RootContent[]) {
    for (const node of nodes) {
      if (isKiritanContainerDirective(node)) {
        const value = asDirective(node).attributes?.[attribute];
        if (value) values.add(value);
      }
      const children = asDirective(node).children;
      if (children) walk(children);
    }
  }
  walk(tree.children);
  return values;
}

/** Which locales have an explicit `:::kiritan{locale=...}` block somewhere in `tree` (inline strategy). */
export function collectLocaleBlocks(tree: Root): Set<string> {
  return collectContainerAttribute(tree, "locale");
}

/** Which `:::kiritan{#<id>}` ids exist in `tree` (catalog strategy). */
export function collectCatalogIds(tree: Root): Set<string> {
  return collectContainerAttribute(tree, "id");
}

/** Each `:::kiritan{#<id>}` block's own content (its default-locale original text), keyed by id. */
export function collectCatalogSegments(tree: Root): Map<string, RootContent[]> {
  const segments = new Map<string, RootContent[]>();
  function walk(nodes: RootContent[]) {
    for (const node of nodes) {
      if (isKiritanContainerDirective(node)) {
        const id = asDirective(node).attributes?.id;
        if (id) segments.set(id, childrenOf(node));
      }
      const children = asDirective(node).children;
      if (children) walk(children);
    }
  }
  walk(tree.children);
  return segments;
}
