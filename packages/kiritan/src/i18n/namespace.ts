import type { AggregatedResource } from "./aggregate.js";

/**
 * Derives a namespace from a resource's identifying path, e.g. `src/components/Button/Button.i18n.ts` → `components/Button` (docs/DESIGN.md chapter 9.6).
 * The leading `src/` segment is dropped since it rarely carries meaning as a namespace; a file with no other directory (e.g. `common.i18n.ts` at the root) falls back to its own basename with the `.i18n`/locale-file suffix stripped.
 */
export function deriveNamespace(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const lastSlash = normalized.lastIndexOf("/");
  const dir = lastSlash === -1 ? "" : normalized.slice(0, lastSlash);
  const strippedDir = dir.replace(/^src(\/|$)/, "");
  if (strippedDir) return strippedDir;

  const base = lastSlash === -1 ? normalized : normalized.slice(lastSlash + 1);
  return base.replace(/\.i18n\.[^.]+$/, "").replace(/\.[^.]+$/, "");
}

/** Resolves the namespace for one aggregated resource, honoring `ResourceSourceConfig.namespace` when set. */
export function resolveNamespace(entry: AggregatedResource): string {
  return entry.source.namespace
    ? entry.source.namespace(entry.key)
    : deriveNamespace(entry.key);
}
