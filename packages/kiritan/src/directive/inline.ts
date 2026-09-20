import type { Root, RootContent } from "mdast";
import type { Renderer } from "../config/types.js";

/**
 * One `:::kiritan{locale=xx}` block of an `inline` source, with where it sits in the file.
 */
export interface LocaleBlock {
  locale: string;
  /** Every attribute on the opening line, `machine` and `hash` included. */
  attributes: Record<string, string | null | undefined>;
  /** Offsets of the whole block in the source text, opening line to closing line. */
  start: number;
  end: number;
  children: RootContent[];
}

/**
 * Locale blocks written next to each other, with nothing else between them: the translations of one stretch of content. One block per locale is expected, and an `inline` translation is added to (or refreshed in) the group of the default-locale block it translates.
 */
export interface LocaleGroup {
  blocks: LocaleBlock[];
}

interface DirectiveLike {
  type: string;
  name?: string;
  attributes?: Record<string, string | null | undefined> | null;
  children?: RootContent[];
  position?: { start: { offset?: number }; end: { offset?: number } };
}

function asLocaleBlock(node: RootContent): LocaleBlock | undefined {
  const directive = node as unknown as DirectiveLike;
  if (directive.type !== "containerDirective" || directive.name !== "kiritan") {
    return undefined;
  }
  const attributes = directive.attributes ?? {};
  const locale = attributes.locale;
  const start = directive.position?.start.offset;
  const end = directive.position?.end.offset;
  if (!locale || start === undefined || end === undefined) return undefined;
  return {
    locale,
    attributes,
    start,
    end,
    children: directive.children ?? [],
  };
}

/** Every group of adjacent locale blocks in the tree, in document order. A block nested inside another block's content starts a group of its own. */
export function collectLocaleGroups(tree: Root): LocaleGroup[] {
  const groups: LocaleGroup[] = [];

  const visit = (nodes: RootContent[]) => {
    let current: LocaleGroup | undefined;
    for (const node of nodes) {
      const block = asLocaleBlock(node);
      if (block) {
        if (!current) {
          current = { blocks: [] };
          groups.push(current);
        }
        current.blocks.push(block);
        visit(block.children);
        continue;
      }
      current = undefined;
      const children = (node as unknown as DirectiveLike).children;
      if (children) visit(children);
    }
  };
  visit(tree.children);
  return groups;
}

/** What a block says, as text — what an `inline` translation is hashed from and translated. */
export function blockBody(renderer: Renderer, block: LocaleBlock): string {
  return renderer.stringify({ type: "root", children: block.children });
}

/** How many colons the block's opening line uses (a directive nested inside another needs more), so a written-out sibling uses the same. */
export function openingColons(source: string, block: LocaleBlock): number {
  return /^:+/.exec(source.slice(block.start))?.[0].length ?? 3;
}

/**
 * A locale block as it is written into an `inline` source by `kiritan translate`: marked `machine` (awaiting review; delete the attribute once reviewed) and carrying the hash of the default-locale block it was translated from, so a later change to that block makes it stale.
 */
export function renderLocaleBlock(options: {
  colons: number;
  locale: string;
  hash: string;
  body: string;
}): string {
  const fence = ":".repeat(options.colons);
  const body = options.body.replace(/^\s*\n/, "").replace(/\s+$/, "");
  return `${fence}kiritan{locale=${options.locale} machine hash=${options.hash}}\n${body}\n${fence}`;
}
