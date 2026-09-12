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
// mangles alert/callout syntax (`> [!NOTE]`, `> [!TIP]`, etc.) into
// `> \[!NOTE]` — and, if the type name itself contains a character that's
// separately escape-worthy (an underscore, say), that gets backslash-escaped
// too. Renders fine as prose, but every alert-detecting renderer (GitHub,
// GitLab, and others each define their own, overlapping but not identical,
// set of types) looks for the literal, unescaped marker. Match the general
// `[!<anything but "]">]` shape right after a blockquote marker rather than
// a fixed keyword list, so this keeps working as those sets grow and for any
// custom/project-specific type — that position isn't otherwise meaningful
// Markdown, so stripping every backslash out of it is always safe.
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
