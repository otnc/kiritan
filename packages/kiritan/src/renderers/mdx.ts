import remarkDirective from "remark-directive";
import remarkFrontmatter from "remark-frontmatter";
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import type { Root } from "mdast";
import type { Renderer } from "../config/types.js";
import { restoreAlertMarkers } from "../directive/parse.js";

const parser = unified()
  .use(remarkParse)
  .use(remarkFrontmatter)
  .use(remarkMdx)
  .use(remarkDirective);
const stringifier = unified()
  .use(remarkStringify, { bullet: "-" })
  .use(remarkFrontmatter)
  .use(remarkMdx)
  .use(remarkDirective);

/**
 * MDX: Markdown plus JSX, `import`/`export`, and `{expressions}`. All of those parse into their own mdast nodes (`mdxJsxFlowElement`, `mdxjsEsm`, `mdxFlowExpression`, ...) that the pipeline never descends into as prose, so they pass through untouched — code stays code. `:::kiritan{...}` directives work exactly as in Markdown.
 * `%{name}` interpolation can't work here: the `{` opens a JS expression, so `name` never reaches the pipeline as text. Use MDX's own `{expression}` instead. Comments are JS block comments inside an expression, MDX's only comment syntax (HTML comments are a syntax error in MDX).
 */
export const mdxRenderer: Renderer = {
  id: "mdx",
  extensions: [".mdx"],
  strategies: ["sidecar", "inline", "catalog"],
  parse: (source) => parser.parse(source) as Root,
  stringify: (tree) => restoreAlertMarkers(stringifier.stringify(tree)),
  comment: (text) => `{/* ${text} */}`,
};
