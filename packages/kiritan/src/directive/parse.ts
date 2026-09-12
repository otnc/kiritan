import remarkDirective from "remark-directive";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import type { Root } from "mdast";

const parser = unified().use(remarkParse).use(remarkDirective);
const stringifier = unified().use(remarkStringify).use(remarkDirective);

/** Parses Markdown source into an mdast tree, recognizing `:::kiritan{...}` / `::kiritan{...}` directives. */
export function parseMarkdown(source: string): Root {
  return parser.parse(source) as Root;
}

/** Serializes an mdast tree (produced by `parseMarkdown`/`renderForLocale`) back to Markdown. */
export function stringifyMarkdown(tree: Root): string {
  return stringifier.stringify(tree);
}
