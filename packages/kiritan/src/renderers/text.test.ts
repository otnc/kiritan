import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { KiritanConfig } from "../config/types.js";
import { interpolateTree } from "../interpolate/index.js";
import { build } from "../pipeline/build.js";
import { check } from "../pipeline/check.js";
import { translate } from "../pipeline/translate.js";
import { resolveRenderer } from "./index.js";
import { textRenderer } from "./text.js";

describe("textRenderer", () => {
  it.each([
    ["plain", "Hello.\n"],
    ["blank lines and indentation", "One.\n\n\n  Two.\n\tThree\n"],
    ["Markdown-looking syntax", "# Not a heading\n* not a list\n[x](y) `z`\n"],
    ["no trailing newline", "abc"],
    ["empty", ""],
    ["CRLF", "a\r\nb\r\n"],
  ])("round-trips %s byte for byte", (_name, source) => {
    expect(textRenderer.stringify(textRenderer.parse(source))).toBe(source);
  });

  it("is interpolated like any other text node, leaving other syntax alone", () => {
    const tree = interpolateTree(
      textRenderer.parse("v%{version} `%{version}`\n"),
      {
        version: "1.2.0",
      }
    );
    expect(textRenderer.stringify(tree)).toBe("v1.2.0 `1.2.0`\n");
  });

  it("is picked for .txt but only supports sidecar", () => {
    const config: KiritanConfig = {
      locales: { default: "en", list: ["en"] },
      sources: [],
    };
    expect(
      resolveRenderer(config, { glob: "*", strategy: "sidecar" }, "a.txt")
    ).toBe(textRenderer);
    expect(() =>
      resolveRenderer(config, { glob: "*", strategy: "catalog" }, "a.txt")
    ).toThrow(/"text" renderer doesn't support the "catalog" strategy/);
  });
});

describe("text sources through the pipeline", () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "kiritan-text-"));
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  const config = (translateMiddleware = false): KiritanConfig => ({
    locales: { default: "en", list: ["en", "ja"] },
    sources: [
      {
        glob: "notes.base.txt",
        strategy: "sidecar",
        ...(translateMiddleware && {
          translate: { middlewares: [async (ctx) => `ja: ${ctx.text}`] },
        }),
      },
    ],
    naming: {
      template: "{dir}/{base}.{locale}.{ext}",
      omitDefaultLocaleSuffix: true,
      baseSuffix: ".base",
    },
    interpolation: {
      delimiters: ["%{", "}"],
      onMissing: "keep",
      skipCodeBlocks: true,
      variables: { name: "Kiritan" },
    },
  });

  it("builds without a switcher, a marker, or any reformatting", async () => {
    await writeFile(join(cwd, "notes.base.txt"), "# Hi %{name}\n\n  * item\n");

    await build(config(), { cwd });

    expect(await readFile(join(cwd, "notes.txt"), "utf8")).toBe(
      "# Hi Kiritan\n\n  * item\n"
    );
    // No translation exists yet, so the ja file is the base text, unmarked.
    expect(await readFile(join(cwd, "notes.ja.txt"), "utf8")).toBe(
      "# Hi Kiritan\n\n  * item\n"
    );
  });

  it("reports a missing translation but never a stale one", async () => {
    await writeFile(join(cwd, "notes.base.txt"), "Hello.\n");
    expect((await check(config(), { cwd })).issues).toMatchObject([
      { kind: "missing", locale: "ja" },
    ]);

    await writeFile(join(cwd, "notes.ja.txt"), "こんにちは。\n");
    await writeFile(join(cwd, "notes.base.txt"), "Hello again.\n");
    expect((await check(config(), { cwd })).issues).toEqual([]);
  });

  it("translates a missing file without appending a hash marker", async () => {
    await writeFile(join(cwd, "notes.base.txt"), "Hello.\n");

    await translate(config(true), { cwd });

    expect(await readFile(join(cwd, "notes.ja.txt"), "utf8")).toBe(
      "ja: Hello.\n"
    );
  });
});
