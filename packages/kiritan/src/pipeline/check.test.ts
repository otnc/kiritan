import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { KiritanConfig } from "../config/types.js";
import { check } from "./check.js";

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
      },
      {
        kind: "missing",
        source: "README.base.md",
        locale: "ja",
        detail: 'catalog id "usage" has no translation',
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
      },
    ]);
    expect(result.failed).toBe(false);
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
