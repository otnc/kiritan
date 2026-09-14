import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { KiritanConfig } from "../config/types.js";
import { build } from "./build.js";

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
