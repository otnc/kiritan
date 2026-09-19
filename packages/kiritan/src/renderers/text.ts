import type { Root, RootContent } from "mdast";
import type { Renderer } from "../config/types.js";

/**
 * Plain text (`.txt`): the whole file is one text node, so nothing is reflowed, escaped, or normalized — what goes in comes out byte for byte, apart from `%{name}` interpolation (which only ever touches text nodes).
 * With no Markdown syntax there is nowhere for a `:::kiritan{...}` directive or a switcher link to live, so this only supports `sidecar`. There's no invisible comment syntax either, so it gets no `kiritan:hash` marker and hence no staleness detection.
 */
export const textRenderer: Renderer = {
  id: "text",
  extensions: [".txt", ".text"],
  strategies: ["sidecar"],
  supportsDirectives: false,
  parse: (source) => ({
    type: "root",
    children: [
      {
        type: "paragraph",
        children: [{ type: "text", value: source }],
      },
    ],
  }),
  stringify: (tree) => tree.children.map((node) => textOf(node)).join(""),
};

function textOf(node: RootContent | Root): string {
  if ("value" in node && typeof node.value === "string") return node.value;
  if ("children" in node) {
    return (node.children as RootContent[])
      .map((child) => textOf(child))
      .join("");
  }
  return "";
}
