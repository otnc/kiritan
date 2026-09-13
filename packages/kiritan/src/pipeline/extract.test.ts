import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { KiritanConfig } from "../config/types.js";
import { extract } from "./extract.js";

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
