import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/** Where finished translations are remembered, so the same text isn't paid for (or rate-limited) twice. */
export interface CacheStore {
  get(key: string): string | undefined | Promise<string | undefined>;
  set(key: string, value: string): void | Promise<void>;
}

export function createMemoryCache(): CacheStore {
  const map = new Map<string, string>();
  return {
    get: (key) => map.get(key),
    set: (key, value) => void map.set(key, value),
  };
}

/**
 * A JSON file on disk, read once and rewritten after each new entry. Meant to be committed or cached in CI so a re-run costs no quota. Not safe for several processes writing the same file at once.
 */
export function createFileCache(path: string): CacheStore {
  let data: Promise<Record<string, string>> | undefined;
  const load = (): Promise<Record<string, string>> =>
    (data ??= readFile(path, "utf8")
      .then((text) => JSON.parse(text) as Record<string, string>)
      .catch((): Record<string, string> => ({})));
  let writing: Promise<void> = Promise.resolve();

  return {
    async get(key) {
      return (await load())[key];
    },
    async set(key, value) {
      const entries = await load();
      entries[key] = value;
      writing = writing.then(async () => {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
      });
      await writing;
    },
  };
}

export function cacheKey(parts: string[]): string {
  return createHash("sha1").update(parts.join("\u0000")).digest("hex");
}
