import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { KiritanConfig } from "../config/types.js";
import { parseMarkdown, stringifyMarkdown } from "../directive/parse.js";
import { collectCatalogSegments } from "../directive/render.js";
import { hashText, withHashComment } from "../hash/index.js";
import { check, resolveInterpolationVariableNames } from "./check.js";

/** Matches how `checkCatalog` hashes a segment, so tests can assert against a real hash without guessing the exact stringified form. */
function catalogSegmentHash(baseMarkdown: string, id: string): string {
  const segments = collectCatalogSegments(parseMarkdown(baseMarkdown));
  return hashText(
    stringifyMarkdown({ type: "root", children: segments.get(id) ?? [] })
  );
}

let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "kiritan-check-"));
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

describe("check (inline strategy)", () => {
  it("reports no issues when every locale has a block", async () => {
    await writeFile(
      join(cwd, "README.base.md"),
      [
        ":::kiritan{locale=en}",
        "a",
        ":::",
        ":::kiritan{locale=ja}",
        "b",
        ":::",
      ].join("\n"),
      "utf8"
    );
    const config = baseConfig({
      sources: [{ glob: "README.base.md", strategy: "inline" }],
    });
    const result = await check(config, { cwd });
    expect(result.issues).toEqual([]);
    expect(result.failed).toBe(false);
  });

  it("reports a missing issue when a locale block is absent", async () => {
    await writeFile(
      join(cwd, "README.base.md"),
      [":::kiritan{locale=en}", "a", ":::"].join("\n"),
      "utf8"
    );
    const config = baseConfig({
      sources: [{ glob: "README.base.md", strategy: "inline" }],
    });
    const result = await check(config, { cwd });
    expect(result.issues).toEqual([
      {
        kind: "missing",
        source: "README.base.md",
        locale: "ja",
        detail: "no :::kiritan{locale=ja} block",
      },
    ]);
    expect(result.failed).toBe(true);
  });
});

describe("check (sidecar strategy)", () => {
  it("reports a missing issue when the sidecar file doesn't exist", async () => {
    await writeFile(join(cwd, "README.base.md"), "English content.\n", "utf8");
    const config = baseConfig({
      sources: [{ glob: "README.base.md", strategy: "sidecar" }],
    });
    const result = await check(config, { cwd });
    expect(result.issues).toEqual([
      {
        kind: "missing",
        source: "README.base.md",
        locale: "ja",
        detail: 'sidecar file "README.ja.md" does not exist',
      },
    ]);
    expect(result.failed).toBe(true);
  });

  it("reports no issues once the sidecar file exists", async () => {
    await writeFile(join(cwd, "README.base.md"), "English content.\n", "utf8");
    await writeFile(
      join(cwd, "README.ja.md"),
      "日本語のコンテンツ。\n",
      "utf8"
    );
    const config = baseConfig({
      sources: [{ glob: "README.base.md", strategy: "sidecar" }],
    });
    const result = await check(config, { cwd });
    expect(result.issues).toEqual([]);
  });

  it("does not flag a translated file with no hash comment as stale", async () => {
    await writeFile(join(cwd, "README.base.md"), "English content.\n", "utf8");
    await writeFile(
      join(cwd, "README.ja.md"),
      "手動翻訳、ハッシュコメント無し。\n",
      "utf8"
    );
    const config = baseConfig({
      sources: [{ glob: "README.base.md", strategy: "sidecar" }],
    });
    const result = await check(config, { cwd });
    expect(result.issues).toEqual([]);
  });

  it("reports a stale issue once the base content no longer matches the hash comment", async () => {
    await writeFile(join(cwd, "README.base.md"), "Updated content.\n", "utf8");
    await writeFile(
      join(cwd, "README.ja.md"),
      withHashComment("翻訳済み。\n", hashText("Old content.\n")),
      "utf8"
    );
    const config = baseConfig({
      sources: [{ glob: "README.base.md", strategy: "sidecar" }],
    });
    const result = await check(config, { cwd });
    expect(result.issues).toEqual([
      {
        kind: "stale",
        source: "README.base.md",
        locale: "ja",
        detail:
          'sidecar file "README.ja.md" is stale (source changed since it was last translated)',
      },
    ]);
    expect(result.failed).toBe(true);
  });
});

describe("check (catalog strategy)", () => {
  it("reports missing and machine-translated catalog entries", async () => {
    await writeFile(
      join(cwd, "README.base.md"),
      [
        ":::kiritan{#intro}",
        "Original.",
        ":::",
        ":::kiritan{#usage}",
        "Usage text.",
        ":::",
      ].join("\n"),
      "utf8"
    );
    await writeFile(
      join(cwd, "README.ja.catalog.json"),
      JSON.stringify({ intro: { text: "翻訳済み", machine: true } }),
      "utf8"
    );
    const config = baseConfig({
      sources: [{ glob: "README.base.md", strategy: "catalog" }],
    });
    const result = await check(config, { cwd });
    expect(result.issues).toEqual([
      {
        kind: "machine",
        source: "README.base.md",
        locale: "ja",
        detail: 'catalog id "intro" is machine-translated and needs review',
        id: "intro",
      },
      {
        kind: "missing",
        source: "README.base.md",
        locale: "ja",
        detail: 'catalog id "usage" has no translation',
        id: "usage",
      },
    ]);
    // "machine" isn't in the default failOn list.
    expect(result.failed).toBe(true);
  });

  it("does not fail when only machine-translated issues exist and failOn excludes them", async () => {
    await writeFile(
      join(cwd, "README.base.md"),
      [":::kiritan{#intro}", "Original.", ":::"].join("\n"),
      "utf8"
    );
    await writeFile(
      join(cwd, "README.ja.catalog.json"),
      JSON.stringify({ intro: { text: "翻訳済み", machine: true } }),
      "utf8"
    );
    const config = baseConfig({
      sources: [{ glob: "README.base.md", strategy: "catalog" }],
      check: { failOn: ["missing"] },
    });
    const result = await check(config, { cwd });
    expect(result.issues).toEqual([
      {
        kind: "machine",
        source: "README.base.md",
        locale: "ja",
        detail: 'catalog id "intro" is machine-translated and needs review',
        id: "intro",
      },
    ]);
    expect(result.failed).toBe(false);
  });

  it("does not flag an entry with no stored hash as stale", async () => {
    await writeFile(
      join(cwd, "README.base.md"),
      [":::kiritan{#intro}", "Original.", ":::"].join("\n"),
      "utf8"
    );
    await writeFile(
      join(cwd, "README.ja.catalog.json"),
      JSON.stringify({ intro: { text: "翻訳済み" } }),
      "utf8"
    );
    const config = baseConfig({
      sources: [{ glob: "README.base.md", strategy: "catalog" }],
    });
    const result = await check(config, { cwd });
    expect(result.issues).toEqual([]);
  });

  it("reports a stale issue once the segment's stored hash no longer matches the source", async () => {
    const baseMarkdown = [":::kiritan{#intro}", "Updated.", ":::"].join("\n");
    await writeFile(join(cwd, "README.base.md"), baseMarkdown, "utf8");
    await writeFile(
      join(cwd, "README.ja.catalog.json"),
      JSON.stringify({
        intro: { text: "翻訳済み", hash: "0000000000000000" },
      }),
      "utf8"
    );
    const config = baseConfig({
      sources: [{ glob: "README.base.md", strategy: "catalog" }],
    });
    const result = await check(config, { cwd });
    expect(result.issues).toEqual([
      {
        kind: "stale",
        source: "README.base.md",
        locale: "ja",
        detail:
          'catalog id "intro" is stale (source changed since it was last translated)',
        id: "intro",
      },
    ]);
    expect(result.failed).toBe(true);
  });

  it("reports no issues once the segment's stored hash matches the source", async () => {
    const baseMarkdown = [":::kiritan{#intro}", "Original.", ":::"].join("\n");
    await writeFile(join(cwd, "README.base.md"), baseMarkdown, "utf8");
    await writeFile(
      join(cwd, "README.ja.catalog.json"),
      JSON.stringify({
        intro: {
          text: "翻訳済み",
          hash: catalogSegmentHash(baseMarkdown, "intro"),
        },
      }),
      "utf8"
    );
    const config = baseConfig({
      sources: [{ glob: "README.base.md", strategy: "catalog" }],
    });
    const result = await check(config, { cwd });
    expect(result.issues).toEqual([]);
  });
});

describe("check (runtime.sources, colocated strategy)", () => {
  it("reports a key missing a locale", async () => {
    await mkdir(join(cwd, "src"), { recursive: true });
    await writeFile(
      join(cwd, "src", "Button.i18n.mjs"),
      "export default { submit: { en: 'Submit' }, cancel: { en: 'Cancel', ja: 'キャンセル' } };\n",
      "utf8"
    );
    const config = baseConfig({
      runtime: {
        sources: [{ glob: "src/**/*.i18n.mjs", strategy: "colocated" }],
      },
    });
    const result = await check(config, { cwd });
    expect(result.issues).toEqual([
      {
        kind: "i18n-key-mismatch",
        source: "src/Button.i18n.mjs",
        locale: "ja",
        detail: 'key "submit" is missing locale(s): ja',
      },
    ]);
    expect(result.failed).toBe(true);
  });

  it("reports no issues when every key has every locale", async () => {
    await mkdir(join(cwd, "src"), { recursive: true });
    await writeFile(
      join(cwd, "src", "Button.i18n.mjs"),
      "export default { submit: { en: 'Submit', ja: '送信' } };\n",
      "utf8"
    );
    const config = baseConfig({
      runtime: {
        sources: [{ glob: "src/**/*.i18n.mjs", strategy: "colocated" }],
      },
    });
    const result = await check(config, { cwd });
    expect(result.issues).toEqual([]);
  });
});

describe("check (runtime.sources, split strategy)", () => {
  it("merges sibling per-locale files and reports a missing key", async () => {
    await mkdir(join(cwd, "src"), { recursive: true });
    await writeFile(
      join(cwd, "src", "Button.en.i18n.mjs"),
      "export default { submit: 'Submit', cancel: 'Cancel' };\n",
      "utf8"
    );
    await writeFile(
      join(cwd, "src", "Button.ja.i18n.mjs"),
      "export default { submit: '送信' };\n",
      "utf8"
    );
    const config = baseConfig({
      runtime: {
        sources: [{ glob: "src/**/*.i18n.mjs", strategy: "split" }],
      },
    });
    const result = await check(config, { cwd });
    expect(result.issues).toEqual([
      {
        kind: "i18n-key-mismatch",
        source: "src/Button.en.i18n.mjs, src/Button.ja.i18n.mjs",
        locale: "ja",
        detail: 'key "cancel" is missing locale(s): ja',
      },
    ]);
    expect(result.failed).toBe(true);
  });
});

describe("check (runtime.sources, centralized strategy)", () => {
  it("merges per-locale JSON files and reports a missing key", async () => {
    await mkdir(join(cwd, "locales", "en"), { recursive: true });
    await mkdir(join(cwd, "locales", "ja"), { recursive: true });
    await writeFile(
      join(cwd, "locales", "en", "common.json"),
      JSON.stringify({ submit: "Submit", cancel: "Cancel" }),
      "utf8"
    );
    await writeFile(
      join(cwd, "locales", "ja", "common.json"),
      JSON.stringify({ submit: "送信" }),
      "utf8"
    );
    const config = baseConfig({
      runtime: {
        sources: [{ glob: "locales/*/*.json", strategy: "centralized" }],
      },
    });
    const result = await check(config, { cwd });
    expect(result.issues).toEqual([
      {
        kind: "i18n-key-mismatch",
        source: "locales/en/common.json, locales/ja/common.json",
        locale: "ja",
        detail: 'key "cancel" is missing locale(s): ja',
      },
    ]);
    expect(result.failed).toBe(true);
  });
});

describe("check (runtime.sources, embedded strategy)", () => {
  it("reports a key missing a locale in the named export", async () => {
    await mkdir(join(cwd, "src"), { recursive: true });
    await writeFile(
      join(cwd, "src", "Button.mjs"),
      "export const i18n = { submit: { en: 'Submit' }, cancel: { en: 'Cancel', ja: 'キャンセル' } };\n",
      "utf8"
    );
    const config = baseConfig({
      runtime: {
        sources: [{ glob: "src/**/*.mjs", strategy: "embedded" }],
      },
    });
    const result = await check(config, { cwd });
    expect(result.issues).toEqual([
      {
        kind: "i18n-key-mismatch",
        source: "src/Button.mjs",
        locale: "ja",
        detail: 'key "submit" is missing locale(s): ja',
      },
    ]);
    expect(result.failed).toBe(true);
  });
});

describe("check (locale option)", () => {
  it("restricts document-level checks to the requested locale", async () => {
    await writeFile(
      join(cwd, "README.base.md"),
      [":::kiritan{locale=en}", "a", ":::"].join("\n"),
      "utf8"
    );
    const config = baseConfig({
      locales: { default: "en", list: ["en", "ja", "fr"] },
      sources: [{ glob: "README.base.md", strategy: "inline" }],
    });
    const result = await check(config, { cwd, locale: "fr" });
    expect(result.issues).toEqual([
      {
        kind: "missing",
        source: "README.base.md",
        locale: "fr",
        detail: "no :::kiritan{locale=fr} block",
      },
    ]);
  });

  it("restricts the i18n-key-mismatch check to the requested locale", async () => {
    await mkdir(join(cwd, "src"), { recursive: true });
    await writeFile(
      join(cwd, "src", "Button.i18n.mjs"),
      "export default { submit: { en: 'Submit', fr: 'Envoyer' } };\n",
      "utf8"
    );
    const config = baseConfig({
      locales: { default: "en", list: ["en", "ja", "fr"] },
      runtime: {
        sources: [{ glob: "src/**/*.i18n.mjs", strategy: "colocated" }],
      },
    });
    const result = await check(config, { cwd, locale: "fr" });
    expect(result.issues).toEqual([]);
  });

  it("rejects a locale that isn't in locales.list", async () => {
    const config = baseConfig();
    await expect(check(config, { cwd, locale: "de" })).rejects.toThrow(
      /locale "de" is not in locales\.list/
    );
  });
});

describe("resolveInterpolationVariableNames", () => {
  it("returns an empty array when no variables are configured", () => {
    const config = baseConfig();
    expect(resolveInterpolationVariableNames(config)).toEqual([]);
  });

  it("returns the keys of a plain variables object", () => {
    const config = baseConfig({
      interpolation: {
        variables: { repo: "kiritan", owner: { en: "otnc", ja: "おつねこ" } },
      },
    });
    expect(resolveInterpolationVariableNames(config)).toEqual([
      "repo",
      "owner",
    ]);
  });

  it("calls the function form with the default locale as context", () => {
    const config = baseConfig({
      interpolation: {
        variables: (ctx) => ({ [`for-${ctx.locale}`]: "value" }),
      },
    });
    expect(resolveInterpolationVariableNames(config)).toEqual(["for-en"]);
  });
});
