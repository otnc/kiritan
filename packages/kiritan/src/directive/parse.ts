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

/** Undoes mdast-util-to-markdown escaping a `[!TYPE]` alert marker at the start of a blockquote line. */
export function restoreAlertMarkers(markdown: string): string {
  return markdown.replace(
    ESCAPED_ALERT_MARKER,
    (_match, prefix: string, marker: string) =>
      prefix + marker.replace(/\\/g, "")
  );
}

/** Serializes an mdast tree (produced by `parseMarkdown`/`renderForLocale`) back to Markdown. */
export function stringifyMarkdown(tree: Root): string {
  return restoreAlertMarkers(stringifier.stringify(tree));
}

/**
 * Pads the blank continuation lines of GitHub-style alerts (`> [!NOTE]` ... ) with `spaces` trailing spaces: `>` becomes `>   ` for 3. Markdown serializers write a bare `>`, but a house style may want the padding, and this puts it back after the fact.
 * Only lines inside an alert block are touched, and never the inside of a fenced code block in one, where trailing spaces are content.
 */
export function padAlertBlankLines(markdown: string, spaces: number): string {
  if (spaces <= 0) return markdown;
  const padding = " ".repeat(spaces);
  const lines = markdown.split("\n");
  let inAlert = false;
  let fence: string | undefined;

  return lines
    .map((line) => {
      if (!/^>/.test(line)) {
        inAlert = false;
        fence = undefined;
        return line;
      }
      if (/^>[ \t]*\[![\w-]+\]/.test(line)) {
        inAlert = true;
        fence = undefined;
        return line;
      }
      if (!inAlert) return line;

      const content = line.replace(/^>[ \t]?/, "");
      const marker = /^(`{3,}|~{3,})/.exec(content)?.[1];
      if (marker) {
        if (fence === undefined) fence = marker[0];
        else if (marker[0] === fence) fence = undefined;
      }
      if (fence === undefined && /^>[ \t]*\r?$/.test(line)) {
        return `>${padding}${line.endsWith("\r") ? "\r" : ""}`;
      }
      return line;
    })
    .join("\n");
}
