import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  KiritanConfig,
  TranslatedContent,
  TranslationStore,
} from "../config/types.js";
import { extract } from "./extract.js";

/** A minimal in-memory `TranslationStore` fake, keyed by locale. `writable: false` omits `write` entirely (a read-only store). */
function createMemoryStore(
  options: {
    initial?: Record<string, TranslatedContent>;
    writable?: boolean;
  } = {}
): { store: TranslationStore; data: Map<string, TranslatedContent> } {
  const data = new Map(Object.entries(options.initial ?? {}));
  const store: TranslationStore = {
    id: "memory",
    async read(_ctx, locale) {
      return data.get(locale) ?? null;
    },
    async status(_ctx, locale) {
      return data.has(locale) ? "complete" : "missing";
    },
  };
  if (options.writable !== false) {
    store.write = async (_ctx, locale, content) => {
      data.set(locale, content);
    };
  }
  return { store, data };
}

let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "kiritan-extract-"));
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

function baseConfig(overrides: Partial<KiritanConfig> = {}): KiritanConfig {
  return {
    locales: { default: "en", list: ["en", "ja"] },
    sources: [],
    ...overrides,
  };
}

describe("extract", () => {
  it("scaffolds an empty entry for a new id", async () => {
    await writeFile(
      join(cwd, "README.base.md"),
      [":::kiritan{#intro}", "hello", ":::"].join("\n"),
      "utf8"
    );
    const config = baseConfig({
      sources: [{ glob: "README.base.md", strategy: "catalog" }],
    });
    const result = await extract(config, { cwd });
    expect(result.changes).toEqual([
      { source: "README.base.md", locale: "ja", detail: 'added id "intro"' },
    ]);
    const catalog = JSON.parse(
      await readFile(join(cwd, "README.ja.catalog.json"), "utf8")
    );
    expect(catalog.intro.text).toBe("");
    expect(catalog.intro.hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("never touches an existing entry, translated or not", async () => {
    await writeFile(
      join(cwd, "README.base.md"),
      [":::kiritan{#intro}", "hello", ":::"].join("\n"),
      "utf8"
    );
    await writeFile(
      join(cwd, "README.ja.catalog.json"),
      JSON.stringify({ intro: { text: "既存の訳文", machine: true } }),
      "utf8"
    );
    const config = baseConfig({
      sources: [{ glob: "README.base.md", strategy: "catalog" }],
    });
    const result = await extract(config, { cwd });
    expect(result.changes).toEqual([]);
    const catalog = JSON.parse(
      await readFile(join(cwd, "README.ja.catalog.json"), "utf8")
    );
    expect(catalog).toEqual({ intro: { text: "既存の訳文", machine: true } });
  });

  it("reports an orphaned id without removing it", async () => {
    await writeFile(join(cwd, "README.base.md"), "no directives here", "utf8");
    await writeFile(
      join(cwd, "README.ja.catalog.json"),
      JSON.stringify({ gone: { text: "古い訳文" } }),
      "utf8"
    );
    const config = baseConfig({
      sources: [{ glob: "README.base.md", strategy: "catalog" }],
    });
    const result = await extract(config, { cwd });
    expect(result.changes).toEqual([
      {
        source: "README.base.md",
        locale: "ja",
        detail: 'id "gone" is orphaned (no longer in the base file)',
      },
    ]);
    const catalog = JSON.parse(
      await readFile(join(cwd, "README.ja.catalog.json"), "utf8")
    );
    expect(catalog).toEqual({ gone: { text: "古い訳文" } });
  });

  it("ignores sources that aren't the catalog strategy", async () => {
    await writeFile(join(cwd, "README.base.md"), "hello", "utf8");
    const config = baseConfig({
      sources: [{ glob: "README.base.md", strategy: "sidecar" }],
    });
    const result = await extract(config, { cwd });
    expect(result.changes).toEqual([]);
  });
});

describe("extract (locale option)", () => {
  it("only scaffolds a catalog for the requested locale", async () => {
    await writeFile(
      join(cwd, "README.base.md"),
      [":::kiritan{#intro}", "hello", ":::"].join("\n"),
      "utf8"
    );
    const config = baseConfig({
      locales: { default: "en", list: ["en", "ja", "fr"] },
      sources: [{ glob: "README.base.md", strategy: "catalog" }],
    });
    const result = await extract(config, { cwd, locale: "fr" });
    expect(result.changes).toEqual([
      { source: "README.base.md", locale: "fr", detail: 'added id "intro"' },
    ]);
    await expect(
      readFile(join(cwd, "README.ja.catalog.json"), "utf8")
    ).rejects.toThrow();
  });

  it("rejects a locale that isn't in locales.list", async () => {
    await writeFile(join(cwd, "README.base.md"), "hello", "utf8");
    const config = baseConfig({
      sources: [{ glob: "README.base.md", strategy: "catalog" }],
    });
    await expect(extract(config, { cwd, locale: "de" })).rejects.toThrow(
      /locale "de" is not in locales\.list/
    );
  });
});

describe("extract (plugins.stores)", () => {
  it("scaffolds an empty entry for a new id in a segments store", async () => {
    await writeFile(
      join(cwd, "README.base.md"),
      [":::kiritan{#intro}", "hello", ":::"].join("\n"),
      "utf8"
    );
    const { store, data } = createMemoryStore();
    const config = baseConfig({
      sources: [{ glob: "README.base.md", strategy: "memory" }],
      plugins: { stores: { memory: store } },
    });
    const result = await extract(config, { cwd });
    expect(result.changes).toEqual([
      {
        source: "README.base.md",
        locale: "ja",
        detail: 'added id "intro" via plugin store "memory"',
      },
    ]);
    expect(data.get("ja")).toEqual({
      kind: "segments",
      segments: { intro: { text: "" } },
    });
  });

  it("never touches an existing entry, translated or not", async () => {
    await writeFile(
      join(cwd, "README.base.md"),
      [":::kiritan{#intro}", "hello", ":::"].join("\n"),
      "utf8"
    );
    const { store, data } = createMemoryStore({
      initial: {
        ja: {
          kind: "segments",
          segments: { intro: { text: "既存の訳文", machine: true } },
        },
      },
    });
    const config = baseConfig({
      sources: [{ glob: "README.base.md", strategy: "memory" }],
      plugins: { stores: { memory: store } },
    });
    const result = await extract(config, { cwd });
    expect(result.changes).toEqual([]);
    expect(data.get("ja")).toEqual({
      kind: "segments",
      segments: { intro: { text: "既存の訳文", machine: true } },
    });
  });

  it("reports an orphaned id without removing it", async () => {
    await writeFile(join(cwd, "README.base.md"), "no directives here", "utf8");
    const { store } = createMemoryStore({
      initial: {
        ja: { kind: "segments", segments: { gone: { text: "古い訳文" } } },
      },
    });
    const config = baseConfig({
      sources: [{ glob: "README.base.md", strategy: "memory" }],
      plugins: { stores: { memory: store } },
    });
    const result = await extract(config, { cwd });
    expect(result.changes).toEqual([
      {
        source: "README.base.md",
        locale: "ja",
        detail:
          'id "gone" is orphaned (no longer in the base file) in plugin store "memory"',
      },
    ]);
  });

  it("skips a full-text store — there are no catalog ids to scaffold", async () => {
    await writeFile(
      join(cwd, "README.base.md"),
      [":::kiritan{#intro}", "hello", ":::"].join("\n"),
      "utf8"
    );
    const { store } = createMemoryStore({
      initial: { ja: { kind: "full-text", text: "翻訳済み" } },
    });
    const config = baseConfig({
      sources: [{ glob: "README.base.md", strategy: "memory" }],
      plugins: { stores: { memory: store } },
    });
    const result = await extract(config, { cwd });
    expect(result.changes).toEqual([]);
  });

  it("does nothing for a read-only store (no write)", async () => {
    await writeFile(
      join(cwd, "README.base.md"),
      [":::kiritan{#intro}", "hello", ":::"].join("\n"),
      "utf8"
    );
    const { store } = createMemoryStore({ writable: false });
    const config = baseConfig({
      sources: [{ glob: "README.base.md", strategy: "memory" }],
      plugins: { stores: { memory: store } },
    });
    const result = await extract(config, { cwd });
    expect(result.changes).toEqual([]);
  });

  it("throws for a strategy with no matching plugins.stores entry", async () => {
    await writeFile(join(cwd, "README.base.md"), "hello", "utf8");
    const config = baseConfig({
      sources: [{ glob: "README.base.md", strategy: "unregistered" }],
    });
    await expect(extract(config, { cwd })).rejects.toThrow(
      /the "unregistered" strategy isn't implemented yet/
    );
  });
});
