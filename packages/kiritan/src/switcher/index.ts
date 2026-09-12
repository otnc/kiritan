import { dirname, relative, sep } from "node:path";
import type { Root, RootContent } from "mdast";
import type { SwitcherConfig, SwitcherLink } from "../config/types.js";
import { parseMarkdown } from "../directive/parse.js";

/** The default label: each locale's own autonym, via the standard `Intl.DisplayNames` (docs/DESIGN.md 6.1章). */
export function resolveLabel(
  locale: string,
  labels: Record<string, string | false> | undefined
): string | false {
  if (labels && Object.hasOwn(labels, locale)) {
    return labels[locale];
  }
  try {
    const displayNames = new Intl.DisplayNames([locale], { type: "language" });
    return displayNames.of(locale) ?? locale;
  } catch {
    return locale;
  }
}

function toPosixRelative(fromDir: string, toPath: string): string {
  const rel = relative(fromDir, toPath);
  return (rel === "" ? "." : rel).split(sep).join("/");
}

export interface BuildSwitcherLinksOptions {
  locales: string[];
  currentLocale: string;
  currentOutputPath: string;
  outputPathFor: (locale: string) => string;
  labels?: Record<string, string | false>;
}

/** Resolves the (label, href, isCurrent) for every non-excluded locale, in `locales` order. */
export function buildSwitcherLinks(
  options: BuildSwitcherLinksOptions
): SwitcherLink[] {
  const fromDir = dirname(options.currentOutputPath);
  const links: SwitcherLink[] = [];
  for (const locale of options.locales) {
    const label = resolveLabel(locale, options.labels);
    if (label === false) continue;
    const href = toPosixRelative(fromDir, options.outputPathFor(locale));
    links.push({
      locale,
      label,
      href,
      isCurrent: locale === options.currentLocale,
    });
  }
  return links;
}

export interface RenderSwitcherOptions {
  separator: string;
  currentLocaleLink: boolean;
}

/** The default rendering: `**English** | [日本語](README.ja.md)`. */
export function renderSwitcherNodes(
  links: SwitcherLink[],
  options: RenderSwitcherOptions
): RootContent[] {
  if (links.length === 0) return [];
  const children: RootContent[] = [];

  links.forEach((link, index) => {
    if (index > 0) {
      children.push({ type: "text", value: options.separator } as RootContent);
    }
    if (link.isCurrent && !options.currentLocaleLink) {
      children.push({
        type: "strong",
        children: [{ type: "text", value: link.label }],
      } as unknown as RootContent);
    } else {
      children.push({
        type: "link",
        url: link.href,
        children: [{ type: "text", value: link.label }],
      } as unknown as RootContent);
    }
  });

  return [{ type: "paragraph", children } as unknown as RootContent];
}

/**
 * Renders the switcher for one locale: `switcher.render`, if given, fully overrides the line (its returned Markdown string is parsed as a fragment); otherwise falls back to `renderSwitcherNodes`.
 */
export function renderSwitcher(
  locale: string,
  links: SwitcherLink[],
  config: Pick<SwitcherConfig, "render" | "separator" | "currentLocaleLink">
): RootContent[] {
  if (config.render) {
    const markdown = config.render({ locale, links });
    return parseMarkdown(markdown).children;
  }
  return renderSwitcherNodes(links, {
    separator: config.separator ?? " | ",
    currentLocaleLink: config.currentLocaleLink ?? false,
  });
}

function isKiritanSwitcherLeaf(node: RootContent): boolean {
  const directive = node as unknown as {
    type: string;
    name?: string;
    attributes?: Record<string, unknown>;
  };
  return (
    directive.type === "leafDirective" &&
    directive.name === "kiritan" &&
    "switcher" in (directive.attributes ?? {})
  );
}

function hasSwitcherMarker(tree: Root): boolean {
  function walk(nodes: RootContent[]): boolean {
    return nodes.some((node) => {
      if (isKiritanSwitcherLeaf(node)) return true;
      const children = (node as unknown as { children?: RootContent[] })
        .children;
      return children ? walk(children) : false;
    });
  }
  return walk(tree.children);
}

function firstHeadingIndex(nodes: RootContent[]): number {
  return nodes.findIndex((node) => node.type === "heading");
}

function switcherMarkerNode(): RootContent {
  return {
    type: "leafDirective",
    name: "kiritan",
    attributes: { switcher: "" },
    children: [],
  } as unknown as RootContent;
}

/**
 * If `tree` has no explicit `::kiritan{switcher}` marker and `switcher.enabled` is true, inserts one at `switcher.position` (docs/DESIGN.md 6.1章). A tree that already has a marker is returned unchanged regardless of `enabled`.
 */
export function ensureSwitcherMarker(
  tree: Root,
  switcherConfig: SwitcherConfig
): Root {
  if (hasSwitcherMarker(tree)) return tree;
  if (switcherConfig.enabled === false) return tree;
  const position = switcherConfig.position ?? "after-heading";
  if (position === "none") return tree;

  const children = [...tree.children];
  let index = 0;
  if (position === "after-heading") {
    const headingIndex = firstHeadingIndex(children);
    index = headingIndex === -1 ? 0 : headingIndex + 1;
  }
  children.splice(index, 0, switcherMarkerNode());
  return { ...tree, children };
}
