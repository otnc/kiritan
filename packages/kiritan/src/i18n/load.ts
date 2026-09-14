import { createJiti } from "jiti";
import type { ResourceModule } from "@kiritan/runtime";

const jiti = createJiti(import.meta.url);

/** Loads a `colocated`-strategy file's default export as a `ResourceModule` (docs/DESIGN.md chapter 9.2). */
export async function loadColocatedResource(
  path: string
): Promise<ResourceModule> {
  const mod = await jiti.import(path, { default: true });
  return mod as ResourceModule;
}

/** Loads an `embedded`-strategy file's named export (default `"i18n"`) as a `ResourceModule` (docs/DESIGN.md chapter 9.5). */
export async function loadEmbeddedResource(
  path: string,
  exportName = "i18n"
): Promise<ResourceModule> {
  const mod = (await jiti.import(path)) as Record<string, unknown>;
  return (mod[exportName] ?? {}) as ResourceModule;
}

/** A single locale's flat `{key: value}` map, as read from one `split` or `centralized` file. */
export type FlatLocaleResource = Record<string, string>;

/** Loads a `split`-strategy file's default export, e.g. `Button.en.i18n.ts` (docs/DESIGN.md chapter 9.3). */
export async function loadSplitResource(
  path: string
): Promise<FlatLocaleResource> {
  const mod = await jiti.import(path, { default: true });
  return mod as FlatLocaleResource;
}

/** Loads a `centralized`-strategy file, e.g. `locales/en/common.json` (docs/DESIGN.md chapter 9.4). i18next plural suffixes (`key_one`, etc.) are passed through as-is, unparsed. */
export async function loadCentralizedResource(
  path: string
): Promise<FlatLocaleResource> {
  const mod = await jiti.import(path, { default: true });
  return mod as FlatLocaleResource;
}
