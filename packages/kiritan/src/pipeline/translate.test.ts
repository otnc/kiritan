import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  KiritanConfig,
  StoreStatus,
  TranslateMiddleware,
  TranslatedContent,
  TranslationStore,
} from "../config/types.js";
import { parseMarkdown, stringifyMarkdown } from "../directive/parse.js";
import { collectCatalogSegments } from "../directive/render.js";
import { extractHashComment, hashText } from "../hash/index.js";
import { translate } from "./translate.js";

/** Matches how `translateCatalog` hashes a segment, so tests can assert against a real stored hash without guessing the exact stringified form. */
function catalogSegmentHash(baseMarkdown: string, id: string): string {
  const segments = collectCatalogSegments(parseMarkdown(baseMarkdown));
  return hashText(
    stringifyMarkdown({ type: "root", children: segments.get(id) ?? [] })
  );
}

let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "kiritan-translate-"));
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

const uppercase: TranslateMiddleware = async (ctx) => ctx.text.toUpperCase();

/** A `TranslationStore` fake backed by a plain `Map`, exposing that map so tests can inspect what got written. `writable: false` omits `write` entirely (a read-only store). */
function createMemoryStore(
  options: {
    initial?: Record<string, TranslatedContent>;
    statuses?: Record<string, StoreStatus>;
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
      if (options.statuses) return options.statuses[locale] ?? "complete";
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

function baseConfig(overrides: Partial<KiritanConfig> = {}): KiritanConfig {
  return {
    locales: { default: "en", list: ["en", "ja"] },
    sources: [],
    ...overrides,
  };
}

describe("translate (sidecar strategy)", () => {
  it("writes a translated sidecar file when one is missing", async () => {
    await writeFile(join(cwd, "README.base.md"), "hello", "utf8");
    const config = baseConfig({
      sources: [
        {
          glob: "README.base.md",
          strategy: "sidecar",
          translate: { middlewares: [uppercase] },
        },
      ],
    });
    const result = await translate(config, { cwd });
    expect(result.translated).toEqual([
      { source: "README.base.md", locale: "ja", detail: "wrote README.ja.md" },
    ]);
    const written = await readFile(join(cwd, "README.ja.md"), "utf8");
    expect(written).toContain("HELLO");
    expect(extractHashComment(written)).toBe(hashText("hello"));
  });

  it("does nothing when no middlewares are configured", async () => {
    await writeFile(join(cwd, "README.base.md"), "hello", "utf8");
    const config = baseConfig({
      sources: [{ glob: "README.base.md", strategy: "sidecar" }],
    });
    const result = await translate(config, { cwd });
    expect(result.translated).toEqual([]);
  });

  it("does nothing when the sidecar file already exists", async () => {
    await writeFile(join(cwd, "README.base.md"), "hello", "utf8");
    await writeFile(join(cwd, "README.ja.md"), "existing", "utf8");
    const config = baseConfig({
      sources: [
        {
          glob: "README.base.md",
          strategy: "sidecar",
          translate: { middlewares: [uppercase] },
        },
      ],
    });
    const result = await translate(config, { cwd });
    expect(result.translated).toEqual([]);
    expect(await readFile(join(cwd, "README.ja.md"), "utf8")).toBe("existing");
  });

  it("leaves a hand-translated file with no hash comment untouched", async () => {
    await writeFile(join(cwd, "README.base.md"), "hello", "utf8");
    await writeFile(join(cwd, "README.ja.md"), "手動翻訳", "utf8");
    const config = baseConfig({
      sources: [
        {
          glob: "README.base.md",
          strategy: "sidecar",
          translate: { middlewares: [uppercase] },
        },
      ],
    });
    const result = await translate(config, { cwd });
    expect(result.translated).toEqual([]);
    expect(await readFile(join(cwd, "README.ja.md"), "utf8")).toBe("手動翻訳");
  });

  it("re-translates a sidecar file once its hash comment no longer matches the source", async () => {
    await writeFile(join(cwd, "README.base.md"), "hello again", "utf8");
    await writeFile(
      join(cwd, "README.ja.md"),
      `古い翻訳\n\n<!-- kiritan:hash ${hashText("hello")} -->\n`,
      "utf8"
    );
    const config = baseConfig({
      sources: [
        {
          glob: "README.base.md",
          strategy: "sidecar",
          translate: { middlewares: [uppercase] },
        },
      ],
    });
    const result = await translate(config, { cwd });
    expect(result.translated).toEqual([
      { source: "README.base.md", locale: "ja", detail: "wrote README.ja.md" },
    ]);
    const written = await readFile(join(cwd, "README.ja.md"), "utf8");
    expect(written).toContain("HELLO AGAIN");
    expect(extractHashComment(written)).toBe(hashText("hello again"));
  });
});

describe("translate (catalog strategy)", () => {
  it("fills a missing catalog entry and marks it machine-translated", async () => {
    await writeFile(
      join(cwd, "README.base.md"),
      [":::kiritan{#intro}", "hello", ":::"].join("\n"),
      "utf8"
    );
    const config = baseConfig({
      sources: [
        {
          glob: "README.base.md",
          strategy: "catalog",
          translate: { middlewares: [uppercase] },
        },
      ],
    });
    const result = await translate(config, { cwd });
    expect(result.translated).toEqual([
      { source: "README.base.md", locale: "ja", detail: 'catalog id "intro"' },
    ]);
    const catalog = JSON.parse(
      await readFile(join(cwd, "README.ja.catalog.json"), "utf8")
    );
    expect(catalog.intro.text).toContain("HELLO");
    expect(catalog.intro.machine).toBe(true);
  });

  it("leaves an existing human translation untouched", async () => {
    await writeFile(
      join(cwd, "README.base.md"),
      [":::kiritan{#intro}", "hello", ":::"].join("\n"),
      "utf8"
    );
    await writeFile(
      join(cwd, "README.ja.catalog.json"),
      JSON.stringify({ intro: { text: "既存の訳文" } }),
      "utf8"
    );
    const config = baseConfig({
      sources: [
        {
          glob: "README.base.md",
          strategy: "catalog",
          translate: { middlewares: [uppercase] },
        },
      ],
    });
    const result = await translate(config, { cwd });
    expect(result.translated).toEqual([]);
    const catalog = JSON.parse(
      await readFile(join(cwd, "README.ja.catalog.json"), "utf8")
    );
    expect(catalog.intro.text).toBe("既存の訳文");
  });

  it("re-translates a catalog entry once its stored hash no longer matches the source", async () => {
    const baseMarkdown = [":::kiritan{#intro}", "hello again", ":::"].join(
      "\n"
    );
    await writeFile(join(cwd, "README.base.md"), baseMarkdown, "utf8");
    await writeFile(
      join(cwd, "README.ja.catalog.json"),
      JSON.stringify({
        intro: { text: "古い訳文", hash: "0000000000000000" },
      }),
      "utf8"
    );
    const config = baseConfig({
      sources: [
        {
          glob: "README.base.md",
          strategy: "catalog",
          translate: { middlewares: [uppercase] },
        },
      ],
    });
    const result = await translate(config, { cwd });
    expect(result.translated).toEqual([
      { source: "README.base.md", locale: "ja", detail: 'catalog id "intro"' },
    ]);
    const catalog = JSON.parse(
      await readFile(join(cwd, "README.ja.catalog.json"), "utf8")
    );
    expect(catalog.intro.text).toContain("HELLO AGAIN");
    expect(catalog.intro.machine).toBe(true);
    expect(catalog.intro.hash).toBe(catalogSegmentHash(baseMarkdown, "intro"));
  });
});

describe("translate (locale option)", () => {
  it("only translates the requested locale, leaving other missing locales alone", async () => {
    await writeFile(join(cwd, "README.base.md"), "hello", "utf8");
    const config = baseConfig({
      locales: { default: "en", list: ["en", "ja", "fr"] },
      sources: [
        {
          glob: "README.base.md",
          strategy: "sidecar",
          translate: { middlewares: [uppercase] },
        },
      ],
    });
    const result = await translate(config, { cwd, locale: "fr" });
    expect(result.translated).toEqual([
      { source: "README.base.md", locale: "fr", detail: "wrote README.fr.md" },
    ]);
    expect(await readFile(join(cwd, "README.fr.md"), "utf8")).toContain(
      "HELLO"
    );
    await expect(readFile(join(cwd, "README.ja.md"), "utf8")).rejects.toThrow();
  });

  it("rejects a locale that isn't in locales.list", async () => {
    await writeFile(join(cwd, "README.base.md"), "hello", "utf8");
    const config = baseConfig({
      sources: [{ glob: "README.base.md", strategy: "sidecar" }],
    });
    await expect(translate(config, { cwd, locale: "de" })).rejects.toThrow(
      /locale "de" is not in locales\.list/
    );
  });
});

describe("translate (plugins.stores)", () => {
  it("translates the whole document into a full-text store when nothing is stored yet", async () => {
    await writeFile(join(cwd, "README.base.md"), "hello", "utf8");
    const { store, data } = createMemoryStore();
    const config = baseConfig({
      sources: [
        {
          glob: "README.base.md",
          strategy: "memory",
          translate: { middlewares: [uppercase] },
        },
      ],
      plugins: { stores: { memory: store } },
    });
    const result = await translate(config, { cwd });
    expect(result.translated).toEqual([
      {
        source: "README.base.md",
        locale: "ja",
        detail: 'wrote via plugin store "memory"',
      },
    ]);
    expect(data.get("ja")).toEqual({
      kind: "full-text",
      text: "HELLO",
      machine: true,
    });
  });

  it("only fills in ids missing from an existing segments store", async () => {
    await writeFile(
      join(cwd, "README.base.md"),
      [
        ":::kiritan{#intro}",
        "hello",
        ":::",
        ":::kiritan{#outro}",
        "bye",
        ":::",
      ].join("\n"),
      "utf8"
    );
    const { store, data } = createMemoryStore({
      initial: {
        ja: {
          kind: "segments",
          segments: { intro: { text: "既存の訳文" } },
        },
      },
      statuses: { ja: "partial" },
    });
    const config = baseConfig({
      sources: [
        {
          glob: "README.base.md",
          strategy: "memory",
          translate: { middlewares: [uppercase] },
        },
      ],
      plugins: { stores: { memory: store } },
    });
    const result = await translate(config, { cwd });
    expect(result.translated).toEqual([
      {
        source: "README.base.md",
        locale: "ja",
        detail: 'catalog id "outro" via plugin store "memory"',
      },
    ]);
    const stored = data.get("ja");
    if (stored?.kind !== "segments") throw new Error("expected segments");
    expect(stored.segments.intro).toEqual({ text: "既存の訳文" });
    expect(stored.segments.outro?.text).toContain("BYE");
    expect(stored.segments.outro?.machine).toBe(true);
  });

  it("does nothing once the store reports complete", async () => {
    await writeFile(join(cwd, "README.base.md"), "hello", "utf8");
    const { store, data } = createMemoryStore({ statuses: { ja: "complete" } });
    const config = baseConfig({
      sources: [
        {
          glob: "README.base.md",
          strategy: "memory",
          translate: { middlewares: [uppercase] },
        },
      ],
      plugins: { stores: { memory: store } },
    });
    const result = await translate(config, { cwd });
    expect(result.translated).toEqual([]);
    expect(data.has("ja")).toBe(false);
  });

  it("does nothing for a read-only store (no write)", async () => {
    await writeFile(join(cwd, "README.base.md"), "hello", "utf8");
    const { store } = createMemoryStore({ writable: false });
    const config = baseConfig({
      sources: [
        {
          glob: "README.base.md",
          strategy: "memory",
          translate: { middlewares: [uppercase] },
        },
      ],
      plugins: { stores: { memory: store } },
    });
    const result = await translate(config, { cwd });
    expect(result.translated).toEqual([]);
  });

  it("throws for a strategy with no matching plugins.stores entry", async () => {
    await writeFile(join(cwd, "README.base.md"), "hello", "utf8");
    const config = baseConfig({
      sources: [{ glob: "README.base.md", strategy: "unregistered" }],
    });
    await expect(translate(config, { cwd })).rejects.toThrow(
      /the "unregistered" strategy isn't implemented yet/
    );
  });
});

describe("translate (inline strategy)", () => {
  it("throws when middlewares are configured, since inline isn't supported yet", async () => {
    await writeFile(
      join(cwd, "README.base.md"),
      [":::kiritan{locale=en}", "hello", ":::"].join("\n"),
      "utf8"
    );
    const config = baseConfig({
      sources: [
        {
          glob: "README.base.md",
          strategy: "inline",
          translate: { middlewares: [uppercase] },
        },
      ],
    });
    await expect(translate(config, { cwd })).rejects.toThrow(/inline/);
  });

  it("does nothing (and doesn't throw) when no middlewares are configured", async () => {
    await writeFile(
      join(cwd, "README.base.md"),
      [":::kiritan{locale=en}", "hello", ":::"].join("\n"),
      "utf8"
    );
    const config = baseConfig({
      sources: [{ glob: "README.base.md", strategy: "inline" }],
    });
    const result = await translate(config, { cwd });
    expect(result.translated).toEqual([]);
  });
});
