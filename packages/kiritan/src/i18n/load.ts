import { createJiti } from "jiti";
import type { ResourceModule } from "@kiritan/runtime";

const jiti = createJiti(import.meta.url);

/** Loads a `colocated`-strategy file's default export as a `ResourceModule` (docs/DESIGN.md 9.2章). */
export async function loadColocatedResource(
  path: string
): Promise<ResourceModule> {
  const mod = await jiti.import(path, { default: true });
  return mod as ResourceModule;
}

/** Loads an `embedded`-strategy file's named export (default `"i18n"`) as a `ResourceModule` (docs/DESIGN.md 9.5章). */
export async function loadEmbeddedResource(
  path: string,
  exportName = "i18n"
): Promise<ResourceModule> {
  const mod = (await jiti.import(path)) as Record<string, unknown>;
  return (mod[exportName] ?? {}) as ResourceModule;
}
