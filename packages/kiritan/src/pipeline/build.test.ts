import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  KiritanConfig,
  Renderer,
  TranslatedContent,
  TranslationStore,
} from "../config/types.js";
import { build } from "./build.js";

/** A minimal in-memory `TranslationStore` fake, keyed by locale. */
function createMemoryStore(
  initial: Record<string, TranslatedContent> = {}
): TranslationStore {
  const data = new Map(Object.entries(initial));
  return {
    id: "memory",
    async read(_ctx, locale) {
      return data.get(locale) ?? null;
    },
    async write(_ctx, locale, content) {
      data.set(locale, content);
    },
    async status(_ctx, locale) {
      return data.has(locale) ? "complete" : "missing";
    },
  };
}

let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "kiritan-build-"));
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

function baseConfig(overrides: Partial<KiritanConfig> = {}): KiritanConfig {
  return {
    locales: { default: "en", list: ["en", "ja"] },
    sources: [],
    naming: {
      template: "{dir}/{base}.{locale}.{ext}",
      omitDefaultLocaleSuffix: true,
      baseSuffix: ".base",
    },
    interpolation: {
      delimiters: ["%{", "}"],
      onMissing: "keep",
      skipCodeBlocks: true,
    },
    switcher: {
      enabled: true,
      position: "after-heading",
      separator: " | ",
      currentLocaleLink: false,
    },
    ...overrides,
  };
}

describe("build (inline strategy)", () => {
  it("splits locale blocks into separate output files, with a switcher and interpolated variables", async () => {
    await writeFile(
      join(cwd, "README.base.md"),
      [
        "# Kiritan",
        "",
        "Shared badge line.",
        "",
        ":::kiritan{locale=en}",
        "## Usage",
        "Version: %{version}",
        ":::",
        "",
        ":::kiritan{locale=ja}",
        "## 使い方",
        "バージョン: %{version}",
        ":::",
        "",
      ].join("\n"),
      "utf8"
    );

    const config = baseConfig({
      sources: [{ glob: "README.base.md", strategy: "inline" }],
      interpolation: {
        delimiters: ["%{", "}"],
        onMissing: "keep",
        skipCodeBlocks: true,
        variables: { version: "1.2.0" },
      },
    });

    const result = await build(config, { cwd });
    expect(result.written.sort()).toEqual(["README.ja.md", "README.md"]);

    const en = await readFile(join(cwd, "README.md"), "utf8");
    expect(en).toContain("## Usage");
    expect(en).toContain("Version: 1.2.0");
    expect(en).not.toContain("使い方");
    expect(en).toContain("Shared badge line.");
    expect(en).toContain("**English**");
    expect(en).toContain("[日本語](README.ja.md)");

    const ja = await readFile(join(cwd, "README.ja.md"), "utf8");
    expect(ja).toContain("## 使い方");
    expect(ja).toContain("バージョン: 1.2.0");
    expect(ja).toContain("[English](README.md)");
    expect(ja).toContain("**日本語**");
  });

  it("with a locale option, only writes that locale's output but still links every locale in the switcher", async () => {
    await writeFile(
      join(cwd, "README.base.md"),
      [
        ":::kiritan{locale=en}",
        "English.",
        ":::",
        ":::kiritan{locale=ja}",
        "日本語。",
        ":::",
        ":::kiritan{locale=fr}",
        "Français.",
        ":::",
      ].join("\n"),
      "utf8"
    );

    const config = baseConfig({
      locales: { default: "en", list: ["en", "ja", "fr"] },
      sources: [{ glob: "README.base.md", strategy: "inline" }],
    });

    const result = await build(config, { cwd, locale: "ja" });
    expect(result.written).toEqual(["README.ja.md"]);

    const ja = await readFile(join(cwd, "README.ja.md"), "utf8");
    expect(ja).toContain("日本語。");
    // The switcher still links every configured locale, even ones this run didn't (re)build.
    expect(ja).toContain("[English](README.md)");
    expect(ja).toContain("[français](README.fr.md)");
  });

  it("rejects a locale that isn't in locales.list", async () => {
    await writeFile(join(cwd, "README.base.md"), "hello", "utf8");
    const config = baseConfig({
      sources: [{ glob: "README.base.md", strategy: "inline" }],
    });
    await expect(build(config, { cwd, locale: "de" })).rejects.toThrow(
      /locale "de" is not in locales\.list/
    );
  });
});

describe("build (sidecar strategy)", () => {
  it("uses the base file for the default locale and a sibling file for others", async () => {
    await writeFile(
      join(cwd, "README.base.md"),
      "# Kiritan\n\nEnglish content.\n",
      "utf8"
    );
    await writeFile(
      join(cwd, "README.ja.md"),
      "# きりたん\n\n日本語のコンテンツ。\n",
      "utf8"
    );

    const config = baseConfig({
      sources: [{ glob: "README.base.md", strategy: "sidecar" }],
    });
    const result = await build(config, { cwd });
    expect(result.written.sort()).toEqual(["README.ja.md", "README.md"]);

    const en = await readFile(join(cwd, "README.md"), "utf8");
    expect(en).toContain("English content.");

    const ja = await readFile(join(cwd, "README.ja.md"), "utf8");
    expect(ja).toContain("日本語のコンテンツ。");
  });

  it("puts the fallback marker after leading front matter, which stays verbatim", async () => {
    await writeFile(
      join(cwd, "README.base.md"),
      "---\ntitle: Hi %{name}\n---\n\n# Kiritan\n",
      "utf8"
    );

    await build(
      baseConfig({
        sources: [{ glob: "README.base.md", strategy: "sidecar" }],
        switcher: { enabled: false },
      }),
      { cwd }
    );

    expect(await readFile(join(cwd, "README.ja.md"), "utf8")).toBe(
      "---\ntitle: Hi %{name}\n---\n\n<!-- kiritan:untranslated (source: en) -->\n\n# Kiritan\n"
    );
  });

  it("falls back to the base content with a marker when the sidecar file is missing", async () => {
    await writeFile(
      join(cwd, "README.base.md"),
      "# Kiritan\n\nEnglish content.\n",
      "utf8"
    );

    const config = baseConfig({
      sources: [{ glob: "README.base.md", strategy: "sidecar" }],
    });
    await build(config, { cwd });

    const ja = await readFile(join(cwd, "README.ja.md"), "utf8");
    expect(ja).toContain("kiritan:untranslated (source: en)");
    expect(ja).toContain("English content.");
  });
});

describe("build (catalog strategy)", () => {
  it("resolves each #id from its catalog file, falling back to the source text when missing", async () => {
    await writeFile(
      join(cwd, "README.base.md"),
      ["# Kiritan", "", ":::kiritan{#intro}", "Original text.", ":::", ""].join(
        "\n"
      ),
      "utf8"
    );
    await writeFile(
      join(cwd, "README.ja.catalog.json"),
      JSON.stringify({ intro: { text: "翻訳済みテキスト。" } }),
      "utf8"
    );

    const config = baseConfig({
      sources: [{ glob: "README.base.md", strategy: "catalog" }],
    });
    const result = await build(config, { cwd });
    expect(result.written.sort()).toEqual(["README.ja.md", "README.md"]);

    const en = await readFile(join(cwd, "README.md"), "utf8");
    expect(en).toContain("Original text.");

    const ja = await readFile(join(cwd, "README.ja.md"), "utf8");
    expect(ja).toContain("翻訳済みテキスト。");
    expect(ja).not.toContain("Original text.");
  });

  it("falls back to the source text with a marker when the catalog file or id is missing", async () => {
    await writeFile(
      join(cwd, "README.base.md"),
      [":::kiritan{#intro}", "Original text.", ":::", ""].join("\n"),
      "utf8"
    );

    const config = baseConfig({
      sources: [{ glob: "README.base.md", strategy: "catalog" }],
    });
    await build(config, { cwd });

    const ja = await readFile(join(cwd, "README.ja.md"), "utf8");
    expect(ja).toContain("kiritan:untranslated (source: en)");
    expect(ja).toContain("Original text.");
  });
});

describe("build (plugins.stores)", () => {
  it("renders a full-text store's translation as its own document", async () => {
    await writeFile(join(cwd, "README.base.md"), "Original text.", "utf8");
    const store = createMemoryStore({
      ja: { kind: "full-text", text: "翻訳済みテキスト。" },
    });
    const config = baseConfig({
      sources: [{ glob: "README.base.md", strategy: "memory" }],
      plugins: { stores: { memory: store } },
    });

    const result = await build(config, { cwd });
    expect(result.written.sort()).toEqual(["README.ja.md", "README.md"]);
    const ja = await readFile(join(cwd, "README.ja.md"), "utf8");
    expect(ja).toContain("翻訳済みテキスト。");
    expect(ja).not.toContain("Original text.");
  });

  it("resolves each #id from a segments store, falling back to the source text when missing", async () => {
    await writeFile(
      join(cwd, "README.base.md"),
      [":::kiritan{#intro}", "Original text.", ":::"].join("\n"),
      "utf8"
    );
    const store = createMemoryStore({
      ja: {
        kind: "segments",
        segments: { intro: { text: "翻訳済みテキスト。" } },
      },
    });
    const config = baseConfig({
      sources: [{ glob: "README.base.md", strategy: "memory" }],
      plugins: { stores: { memory: store } },
    });

    await build(config, { cwd });
    const ja = await readFile(join(cwd, "README.ja.md"), "utf8");
    expect(ja).toContain("翻訳済みテキスト。");
    expect(ja).not.toContain("Original text.");
  });

  it("falls back to the source text with a marker when nothing is stored yet", async () => {
    await writeFile(
      join(cwd, "README.base.md"),
      [":::kiritan{#intro}", "Original text.", ":::"].join("\n"),
      "utf8"
    );
    const config = baseConfig({
      sources: [{ glob: "README.base.md", strategy: "memory" }],
      plugins: { stores: { memory: createMemoryStore() } },
    });

    await build(config, { cwd });
    const ja = await readFile(join(cwd, "README.ja.md"), "utf8");
    expect(ja).toContain("kiritan:untranslated (source: en)");
    expect(ja).toContain("Original text.");
  });

  it("throws for a strategy with no matching plugins.stores entry", async () => {
    await writeFile(join(cwd, "README.base.md"), "hello", "utf8");
    const config = baseConfig({
      sources: [{ glob: "README.base.md", strategy: "unregistered" }],
    });
    await expect(build(config, { cwd })).rejects.toThrow(
      /the "unregistered" strategy isn't implemented yet/
    );
  });
});

describe("build (plugins.renderers)", () => {
  // A toy format: the whole file is one text node, and no directives or comments exist.
  const plainRenderer: Renderer = {
    id: "plain",
    extensions: [".rst"],
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
    stringify: (tree) =>
      tree.children
        .map((node) =>
          "children" in node
            ? node.children
                .map((child) => ("value" in child ? child.value : ""))
                .join("")
            : ""
        )
        .join(""),
  };

  it("parses and writes a source through the matching custom renderer, without switcher or markers", async () => {
    await writeFile(join(cwd, "doc.base.rst"), "Hello %{name}.\n  indented\n");
    await writeFile(join(cwd, "doc.ja.rst"), "こんにちは %{name}。\n");

    const result = await build(
      baseConfig({
        sources: [{ glob: "doc.base.rst", strategy: "sidecar" }],
        interpolation: {
          delimiters: ["%{", "}"],
          onMissing: "keep",
          skipCodeBlocks: true,
          variables: { name: "Kiritan" },
        },
        plugins: { renderers: { plain: plainRenderer } },
      }),
      { cwd }
    );

    expect(result.written.sort()).toEqual(["doc.ja.rst", "doc.rst"]);
    expect(await readFile(join(cwd, "doc.rst"), "utf8")).toBe(
      "Hello Kiritan.\n  indented\n"
    );
    expect(await readFile(join(cwd, "doc.ja.rst"), "utf8")).toBe(
      "こんにちは Kiritan。\n"
    );
  });

  it("leaves a missing translation as the plain source, with no untranslated marker", async () => {
    await writeFile(join(cwd, "doc.base.rst"), "Hello.\n");

    await build(
      baseConfig({
        sources: [{ glob: "doc.base.rst", strategy: "sidecar" }],
        plugins: { renderers: { plain: plainRenderer } },
      }),
      { cwd }
    );

    expect(await readFile(join(cwd, "doc.ja.rst"), "utf8")).toBe("Hello.\n");
  });

  it("rejects a strategy the renderer doesn't support before writing anything", async () => {
    await writeFile(join(cwd, "doc.base.rst"), "Hello.\n");

    await expect(
      build(
        baseConfig({
          sources: [{ glob: "doc.base.rst", strategy: "inline" }],
          plugins: { renderers: { plain: plainRenderer } },
        }),
        { cwd }
      )
    ).rejects.toThrow(/"plain" renderer doesn't support the "inline" strategy/);
  });
});

describe("build (markdown.alertBlankLineSpaces)", () => {
  const alertDoc = "# T\n\n> [!NOTE]\n>\n> Careful.\n";

  it("writes a bare > by default", async () => {
    await writeFile(join(cwd, "README.base.md"), alertDoc, "utf8");
    await build(
      baseConfig({
        sources: [{ glob: "README.base.md", strategy: "sidecar" }],
        switcher: { enabled: false },
      }),
      { cwd }
    );
    const out = await readFile(join(cwd, "README.md"), "utf8");
    expect(out).toContain("> [!NOTE]\n>\n> Careful.");
  });

  it("writes the configured trailing spaces on an alert's blank lines", async () => {
    await writeFile(join(cwd, "README.base.md"), alertDoc, "utf8");
    await build(
      baseConfig({
        sources: [{ glob: "README.base.md", strategy: "sidecar" }],
        switcher: { enabled: false },
        markdown: { alertBlankLineSpaces: 3 },
      }),
      { cwd }
    );
    const out = await readFile(join(cwd, "README.md"), "utf8");
    expect(out).toContain("> [!NOTE]\n>   \n> Careful.");
  });
});
