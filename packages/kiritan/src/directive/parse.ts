import remarkDirective from "remark-directive";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import type { Root } from "mdast";

const parser = unified().use(remarkParse).use(remarkDirective);
// bullet: "-" matches the convention used throughout kiritan's own docs
// (remark-stringify otherwise defaults to "*").
const stringifier = unified()
  .use(remarkStringify, { bullet: "-" })
  .use(remarkDirective);

/** Parses Markdown source into an mdast tree, recognizing `:::kiritan{...}` / `::kiritan{...}` directives. */
export function parseMarkdown(source: string): Root {
  return parser.parse(source) as Root;
}

// mdast-util-to-markdown unconditionally escapes a "[" at the start of a
// line (it could otherwise start a link reference definition), which also
// mangles GitHub's alert syntax (`> [!NOTE]` etc.) into `> \[!NOTE]`. That
// still renders fine as prose, but GitHub's alert detector looks for the
// literal, unescaped marker, so restore it for the small set of known types.
const ESCAPED_ALERT_MARKER =
  /^(>\s*)\\\[(!(?:NOTE|TIP|IMPORTANT|WARNING|CAUTION)\])/gim;

/** Serializes an mdast tree (produced by `parseMarkdown`/`renderForLocale`) back to Markdown. */
export function stringifyMarkdown(tree: Root): string {
  return stringifier.stringify(tree).replace(ESCAPED_ALERT_MARKER, "$1[$2");
}
