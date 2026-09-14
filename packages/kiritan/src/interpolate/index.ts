import {
  interpolate,
  type InterpolateOptions,
  type InterpolationParams,
} from "@kiritan/runtime";
import type { Root, RootContent } from "mdast";

export interface InterpolateTreeOptions extends InterpolateOptions {
  /** Default: true. Leaves `code`/`inlineCode` node values untouched. */
  skipCodeBlocks?: boolean;
}

const SKIPPABLE_TYPES = new Set(["code", "inlineCode"]);

function hasChildren(
  node: RootContent
): node is RootContent & { children: RootContent[] } {
  return Array.isArray((node as Partial<{ children: unknown }>).children);
}

function isTextNode(
  node: RootContent
): node is RootContent & { value: string } {
  return (
    node.type === "text" &&
    typeof (node as Partial<{ value: unknown }>).value === "string"
  );
}

function walk(
  nodes: RootContent[],
  params: InterpolationParams,
  options: InterpolateTreeOptions
): RootContent[] {
  return nodes.map((node): RootContent => {
    if (SKIPPABLE_TYPES.has(node.type)) {
      if (
        options.skipCodeBlocks === false &&
        "value" in node &&
        typeof node.value === "string"
      ) {
        return {
          ...node,
          value: interpolate(node.value, params, options),
        } as RootContent;
      }
      return node;
    }
    if (isTextNode(node)) {
      return {
        ...node,
        value: interpolate(node.value, params, options),
      } as RootContent;
    }
    if (hasChildren(node)) {
      return {
        ...node,
        children: walk(node.children, params, options),
      } as RootContent;
    }
    return node;
  });
}

/** Expands `%{name}` placeholders in every text node of `tree` (docs/DESIGN.md chapter 5). */
export function interpolateTree(
  tree: Root,
  params: InterpolationParams,
  options: InterpolateTreeOptions = {}
): Root {
  return { ...tree, children: walk(tree.children, params, options) };
}

export { interpolate };
export type { InterpolateOptions, InterpolationParams };
