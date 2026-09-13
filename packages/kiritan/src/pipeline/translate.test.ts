import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { KiritanConfig, TranslateMiddleware } from "../config/types.js";
import { translate } from "./translate.js";

let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "kiritan-translate-"));
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

const uppercase: TranslateMiddleware = async (ctx) => ctx.text.toUpperCase();

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
    expect(await readFile(join(cwd, "README.ja.md"), "utf8")).toBe("HELLO");
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
