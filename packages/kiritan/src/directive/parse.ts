import remarkDirective from "remark-directive";
import remarkFrontmatter from "remark-frontmatter";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import type { Root } from "mdast";

// remark-frontmatter keeps a leading `---` YAML block as one opaque `yaml` node, so it survives a parse/stringify round trip verbatim (interpolation only touches text nodes, so it never reaches it either).
const parser = unified()
  .use(remarkParse)
  .use(remarkFrontmatter)
  .use(remarkDirective);
// bullet: "-" matches the convention used throughout kiritan's own docs
// (remark-stringify otherwise defaults to "*").
const stringifier = unified()
  .use(remarkStringify, { bullet: "-" })
  .use(remarkFrontmatter)
  .use(remarkDirective);

/** Parses Markdown source into an mdast tree, recognizing `:::kiritan{...}` / `::kiritan{...}` directives. */
export function parseMarkdown(source: string): Root {
  return parser.parse(source) as Root;
}

// mdast-util-to-markdown always escapes a "[" at the start of a line (it could otherwise start a link reference definition), which breaks alert/callout markers like `> [!NOTE]` — GitHub, GitLab, and custom types alike.
// That position is never meaningful Markdown otherwise, so restoring any `[!...]` marker found there (and any escaping inside it) is always safe.
const ESCAPED_ALERT_MARKER = /^(>\s*)(\\\[![^\]\n]*\\?\])/gm;

/** Serializes an mdast tree (produced by `parseMarkdown`/`renderForLocale`) back to Markdown. */
export function stringifyMarkdown(tree: Root): string {
  return stringifier
    .stringify(tree)
    .replace(
      ESCAPED_ALERT_MARKER,
      (_match, prefix: string, marker: string) =>
        prefix + marker.replace(/\\/g, "")
    );
}
