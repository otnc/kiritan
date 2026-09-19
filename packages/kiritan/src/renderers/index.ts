import { extname } from "node:path";
import type { KiritanConfig, Renderer, SourceConfig } from "../config/types.js";
import { parseMarkdown, stringifyMarkdown } from "../directive/parse.js";
import { textRenderer } from "./text.js";

const BUILTIN_STRATEGIES = new Set(["sidecar", "inline", "catalog"]);

export const markdownRenderer: Renderer = {
  id: "markdown",
  extensions: [".md", ".markdown"],
  strategies: ["sidecar", "inline", "catalog"],
  parse: parseMarkdown,
  stringify: stringifyMarkdown,
  comment: (text) => `<!-- ${text} -->`,
};

/** Every renderer kiritan ships with, keyed by id. */
export function builtinRenderers(): Record<string, Renderer> {
  return { markdown: markdownRenderer, text: textRenderer };
}

function findByExtension(
  renderers: Renderer[],
  extension: string
): Renderer | undefined {
  return renderers.find((renderer) => renderer.extensions?.includes(extension));
}

/**
 * Picks the renderer for one source file: an explicit `source.renderer` id wins, then an extension match (a `plugins.renderers` entry beats a built-in claiming the same extension), then `markdown` — the only format v1 ever handled, so a file with an unfamiliar extension behaves as it always has.
 * Throws if the source names an id that isn't registered, or if the chosen renderer can't support the source's built-in `strategy` (a custom `plugins.stores` strategy isn't checked here — its own registration is).
 */
export function resolveRenderer(
  config: KiritanConfig,
  source: SourceConfig,
  filePath: string
): Renderer {
  const plugins = config.plugins?.renderers ?? {};
  const builtins = builtinRenderers();

  let renderer: Renderer | undefined;
  if (source.renderer !== undefined) {
    renderer = plugins[source.renderer] ?? builtins[source.renderer];
    if (!renderer) {
      throw new Error(
        `kiritan: "${filePath}" uses renderer "${source.renderer}", which isn't registered in plugins.renderers or built in`
      );
    }
  } else {
    const extension = extname(filePath).toLowerCase();
    renderer =
      findByExtension(Object.values(plugins), extension) ??
      findByExtension(Object.values(builtins), extension) ??
      markdownRenderer;
  }

  if (
    BUILTIN_STRATEGIES.has(source.strategy) &&
    !renderer.strategies.includes(source.strategy)
  ) {
    throw new Error(
      `kiritan: the "${renderer.id}" renderer doesn't support the "${source.strategy}" strategy (used by "${filePath}"); it supports: ${renderer.strategies.join(", ")}`
    );
  }
  return renderer;
}
