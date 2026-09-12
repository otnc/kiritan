import { readFile } from "node:fs/promises";

export interface CatalogEntry {
  text: string;
  machine?: boolean;
  hash?: string;
}

export type CatalogData = Record<string, CatalogEntry>;

/** Reads one locale's catalog file (docs/DESIGN.md 4.3章). Returns `undefined` if it doesn't exist. */
export async function readCatalogFile(
  path: string
): Promise<CatalogData | undefined> {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as CatalogData;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/** The catalog file path for one source's locale, e.g. `README.ja.catalog.json`. */
export function catalogPathFor(
  dir: string,
  base: string,
  locale: string
): string {
  return `${dir === "." ? "" : `${dir}/`}${base}.${locale}.catalog.json`;
}
