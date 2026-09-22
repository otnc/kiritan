import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { KiritanConfig } from "../config/types.js";
import { build } from "../pipeline/build.js";
import { check } from "../pipeline/check.js";
import { translate } from "../pipeline/translate.js";
import { resolveRenderer } from "./index.js";
import { mdxRenderer } from "./mdx.js";

const roundTrip = (source: string) =>
  mdxRenderer.stringify(mdxRenderer.parse(source));

describe("mdxRenderer", () => {
  it("is picked for .mdx and supports every built-in strategy", () => {
    const config: KiritanConfig = {
      locales: { default: "en", list: ["en"] },
      sources: [],
    };
    for (const strategy of ["sidecar", "inline", "catalog"]) {
      expect(resolveRenderer(config, { glob: "*", strategy }, "a.mdx")).toBe(
        mdxRenderer
      );
    }
  });

  it("keeps JSX, import/export, and expressions intact", () => {
    const source = [
      "---",
      "title: Hi",
      "---",
      "",
      'import { Chart } from "./chart.js";',
      "",
      "export const meta = { a: 1 };",
      "",
      "# Title",
      "",
      "Some <b>bold</b> text and {1 + 1}.",
      "",
      '<Chart data={[1, 2]} title="x">',
      "  inside",
      "</Chart>",
      "",
    ].join("\n");
    const result = roundTrip(source);

    expect(result).toContain('import { Chart } from "./chart.js";');
    expect(result).toContain("export const meta = { a: 1 };");
    expect(result).toContain("<b>bold</b>");
    expect(result).toContain("{1 + 1}");
    expect(result).toContain('<Chart data={[1, 2]} title="x">');
    expect(result.startsWith("---\ntitle: Hi\n---\n")).toBe(true);
  });

  it("parses :::kiritan directives as in Markdown", () => {
    const tree = mdxRenderer.parse(
      ":::kiritan{locale=en}\nHello\n:::\n\n:::kiritan{locale=ja}\nこんにちは\n:::\n"
    );
    expect(tree.children.map((node) => node.type)).toEqual([
      "containerDirective",
      "containerDirective",
    ]);
  });

  it("wraps a comment as an MDX expression comment, not an HTML one", () => {
    expect(mdxRenderer.comment?.("kiritan:hash abc")).toBe(
      "{/* kiritan:hash abc */}"
    );
    // Round-trips: HTML comments would be a syntax error in MDX.
    expect(() => roundTrip("{/* kiritan:hash abc */}\n")).not.toThrow();
  });

  it("doesn't interpolate %{name}, since the brace opens a JS expression", () => {
    const tree = mdxRenderer.parse("Hi %{name}\n");
    expect(tree.children[0]).toMatchObject({
      children: [
        { type: "text", value: "Hi %" },
        { type: "mdxTextExpression", value: "name" },
      ],
    });
    // It still round-trips untouched rather than erroring.
    expect(roundTrip("Hi %{name}\n")).toBe("Hi %{name}\n");
  });

  it("keeps an alert marker unescaped", () => {
    expect(roundTrip("> [!NOTE]\n>\n> Hi.\n")).toContain("> [!NOTE]");
  });
});

describe("mdx sources through the pipeline", () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "kiritan-mdx-"));
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  const config = (
    strategy: "sidecar" | "inline" | "catalog",
    withMiddleware = false
  ): KiritanConfig => ({
    locales: { default: "en", list: ["en", "ja"] },
    sources: [
      {
        glob: "page.base.mdx",
        strategy,
        switcher: { enabled: false },
        ...(withMiddleware && {
          translate: {
            auto: true,
            middlewares: [async (ctx) => `ja: ${ctx.text}`],
          },
        }),
      },
    ],
    naming: {
      template: "{dir}/{base}.{locale}.{ext}",
      omitDefaultLocaleSuffix: true,
      baseSuffix: ".base",
    },
    interpolation: { delimiters: ["%{", "}"], onMissing: "keep" },
  });

  it("builds inline locale blocks while leaving JSX alone", async () => {
    await writeFile(
      join(cwd, "page.base.mdx"),
      [
        'import { Card } from "./card.js";',
        "",
        ":::kiritan{locale=en}",
        '<Card title="Hello">Welcome</Card>',
        ":::",
        "",
        ":::kiritan{locale=ja}",
        '<Card title="こんにちは">ようこそ</Card>',
        ":::",
        "",
      ].join("\n")
    );

    await build(config("inline"), { cwd });

    const en = await readFile(join(cwd, "page.mdx"), "utf8");
    const ja = await readFile(join(cwd, "page.ja.mdx"), "utf8");
    expect(en).toContain('import { Card } from "./card.js";');
    expect(en).toContain('<Card title="Hello">Welcome</Card>');
    expect(en).not.toContain("こんにちは");
    expect(ja).toContain('<Card title="こんにちは">ようこそ</Card>');
    expect(ja).not.toContain("Welcome");
  });

  it("marks an untranslated sidecar with an MDX comment and reports staleness", async () => {
    await writeFile(join(cwd, "page.base.mdx"), "# Hello\n");

    await build(config("sidecar"), { cwd });
    expect(await readFile(join(cwd, "page.ja.mdx"), "utf8")).toContain(
      "{/* kiritan:untranslated (source: en) */}"
    );

    await translate(config("sidecar", true), { cwd });
    // The marker-only file written by build has no hash yet, so translate leaves it (hand-authored, from its point of view); remove it to see a fresh translation.
    await rm(join(cwd, "page.ja.mdx"));
    await translate(config("sidecar", true), { cwd });
    const translated = await readFile(join(cwd, "page.ja.mdx"), "utf8");
    expect(translated).toMatch(/\{\/\* kiritan:hash [0-9a-f]+ \*\/\}/);
    // A machine translation is flagged for review, in MDX's own comment syntax, until its marker line is deleted.
    expect(translated).toContain("{/* kiritan:machine */}");
    expect((await check(config("sidecar"), { cwd })).issues).toMatchObject([
      { kind: "machine", locale: "ja" },
    ]);
    await writeFile(
      join(cwd, "page.ja.mdx"),
      translated.replace("{/* kiritan:machine */}\n", "")
    );
    expect((await check(config("sidecar"), { cwd })).issues).toEqual([]);

    await writeFile(join(cwd, "page.base.mdx"), "# Hello, changed\n");
    expect((await check(config("sidecar"), { cwd })).issues).toMatchObject([
      { kind: "stale", locale: "ja" },
    ]);
  });
});
