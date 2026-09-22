import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { KiritanConfig, TranslateMiddleware } from "../config/types.js";
import { hashText } from "../hash/index.js";
import { check } from "./check.js";
import { translate } from "./translate.js";

let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "kiritan-inline-"));
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

const uppercase: TranslateMiddleware = async (ctx) => ctx.text.toUpperCase();

const config = (locales = ["en", "ja"], auto = true): KiritanConfig => ({
  locales: { default: "en", list: locales },
  sources: [
    {
      glob: "README.base.md",
      strategy: "inline",
      translate: { auto, middlewares: [uppercase] },
    },
  ],
});

const read = () => readFile(join(cwd, "README.base.md"), "utf8");
const write = (text: string) =>
  writeFile(join(cwd, "README.base.md"), text, "utf8");

describe("translate (inline strategy)", () => {
  it("adds a machine-marked block, with the source block's hash, right after the default-locale one", async () => {
    await write("# Title\n\n:::kiritan{locale=en}\nhello\n:::\n\nafter\n");

    const result = await translate(config(), { cwd });

    expect(result.translated).toEqual([
      {
        source: "README.base.md",
        locale: "ja",
        detail: "added a :::kiritan{locale=ja} block",
      },
    ]);
    const hash = hashText("hello\n");
    expect(await read()).toBe(
      "# Title\n\n:::kiritan{locale=en}\nhello\n:::\n\n" +
        `:::kiritan{locale=ja machine hash=${hash}}\nHELLO\n:::\n\nafter\n`
    );
  });

  it("leaves a hand-written block, and everything else in the file, exactly as it was", async () => {
    const source =
      "Intro   with  odd   spacing\n\n:::kiritan{locale=en}\nhello\n:::\n\n:::kiritan{locale=ja}\nこんにちは\n:::\n";
    await write(source);

    const result = await translate(config(), { cwd });

    expect(result.translated).toEqual([]);
    expect(await read()).toBe(source);
  });

  it("translates each group of blocks on its own, in locale order", async () => {
    await write(
      ":::kiritan{locale=en}\none\n:::\n\ntext\n\n:::kiritan{locale=en}\ntwo\n:::\n"
    );

    await translate(config(["en", "ja", "fr"]), { cwd });

    const out = await read();
    expect(out.match(/locale=ja/g)).toHaveLength(2);
    expect(out.match(/locale=fr/g)).toHaveLength(2);
    // Within each group ja comes before fr, as in `locales.list`.
    expect(out.indexOf("locale=ja")).toBeLessThan(out.indexOf("locale=fr"));
    expect(out).toContain("ONE");
    expect(out).toContain("TWO");
    // The original English blocks are untouched.
    expect(out.match(/:::kiritan\{locale=en\}/g)).toHaveLength(2);
  });

  it("refreshes a block whose source has changed, but not one that is still current", async () => {
    await write(":::kiritan{locale=en}\nhello\n:::\n");
    await translate(config(), { cwd });

    // Unchanged: a second run does nothing.
    expect((await translate(config(), { cwd })).translated).toEqual([]);

    // Change the English; the ja block (which carries the old hash) is rewritten in place.
    await write((await read()).replace("hello", "goodbye"));
    const result = await translate(config(), { cwd });

    expect(result.translated).toEqual([
      {
        source: "README.base.md",
        locale: "ja",
        detail: "refreshed a :::kiritan{locale=ja} block",
      },
    ]);
    const out = await read();
    expect(out).toContain("GOODBYE");
    expect(out).not.toContain("HELLO");
    expect(out.match(/locale=ja/g)).toHaveLength(1);
    expect(out).toContain(`hash=${hashText("goodbye\n")}`);
  });

  it("uses the same number of colons as the block it translates", async () => {
    await write("::::kiritan{locale=en}\nhello\n\n:::note\ninner\n:::\n::::\n");
    await translate(config(), { cwd });
    expect(await read()).toMatch(
      /\n\n::::kiritan\{locale=ja machine hash=[0-9a-f]+\}\n[\s\S]*\n::::\n$/
    );
  });

  it("only translates the requested locale", async () => {
    await write(":::kiritan{locale=en}\nhello\n:::\n");
    await translate(config(["en", "ja", "fr"]), { cwd, locale: "fr" });
    const out = await read();
    expect(out).toContain("locale=fr");
    expect(out).not.toContain("locale=ja");
  });

  it("does nothing for a group with no default-locale block", async () => {
    const source = ":::kiritan{locale=fr}\nsalut\n:::\n";
    await write(source);
    expect((await translate(config(), { cwd })).translated).toEqual([]);
    expect(await read()).toBe(source);
  });

  it("doesn't run unless translate.auto is true", async () => {
    const source = ":::kiritan{locale=en}\nhello\n:::\n";
    await write(source);
    const result = await translate(config(["en", "ja"], false), { cwd });
    expect(result.translated).toEqual([]);
    expect(result.autoDisabled).toEqual(["README.base.md"]);
    expect(await read()).toBe(source);
  });
});

describe("check (inline strategy: machine and stale)", () => {
  it("reports a machine-translated block until its machine attribute is deleted", async () => {
    await write(":::kiritan{locale=en}\nhello\n:::\n");
    await translate(config(), { cwd });

    expect((await check(config(), { cwd })).issues).toMatchObject([
      { kind: "machine", locale: "ja" },
    ]);

    await write((await read()).replace(" machine", ""));
    expect((await check(config(), { cwd })).issues).toEqual([]);
  });

  it("reports a block as stale once the default-locale block it was translated from changes", async () => {
    await write(":::kiritan{locale=en}\nhello\n:::\n");
    await translate(config(), { cwd });
    await write(
      (await read()).replace(" machine", "").replace("hello", "goodbye")
    );

    expect((await check(config(), { cwd })).issues).toMatchObject([
      { kind: "stale", locale: "ja" },
    ]);
  });

  it("never flags a hand-written block (no hash) as stale", async () => {
    await write(
      ":::kiritan{locale=en}\nhello\n:::\n\n:::kiritan{locale=ja}\nこんにちは\n:::\n"
    );
    await write((await read()).replace("hello", "goodbye"));
    expect((await check(config(), { cwd })).issues).toEqual([]);
  });
});

describe("translate and check (sidecar machine marker)", () => {
  const sidecar = (): KiritanConfig => ({
    locales: { default: "en", list: ["en", "ja"] },
    sources: [
      {
        glob: "README.base.md",
        strategy: "sidecar",
        translate: { auto: true, middlewares: [uppercase] },
      },
    ],
  });

  it("marks a translated file machine-translated, and check reports it until the line is deleted", async () => {
    await write("hello\n");
    await translate(sidecar(), { cwd });

    const ja = await readFile(join(cwd, "README.ja.md"), "utf8");
    expect(ja).toContain("<!-- kiritan:machine -->");
    expect((await check(sidecar(), { cwd })).issues).toMatchObject([
      { kind: "machine", locale: "ja" },
    ]);

    await writeFile(
      join(cwd, "README.ja.md"),
      ja.replace("<!-- kiritan:machine -->\n", ""),
      "utf8"
    );
    expect((await check(sidecar(), { cwd })).issues).toEqual([]);
  });

  it("does not treat the same words in prose as the marker", async () => {
    await write("hello\n");
    await writeFile(
      join(cwd, "README.ja.md"),
      "The marker is kiritan:machine, written as a comment.\n",
      "utf8"
    );
    expect((await check(sidecar(), { cwd })).issues).toEqual([]);
  });

  it("re-marks a stale file when it is re-translated", async () => {
    await write("hello\n");
    await translate(sidecar(), { cwd });
    const path = join(cwd, "README.ja.md");
    await writeFile(
      path,
      (await readFile(path, "utf8")).replace("<!-- kiritan:machine -->\n", ""),
      "utf8"
    );

    await write("goodbye\n");
    await translate(sidecar(), { cwd });

    expect(await readFile(path, "utf8")).toContain("<!-- kiritan:machine -->");
  });
});

describe("build after an inline translate", () => {
  it("renders the translated block for its locale, without the machine/hash attributes leaking", async () => {
    await write("# Title\n\n:::kiritan{locale=en}\nhello\n:::\n");
    await translate(config(), { cwd });

    const { build } = await import("./build.js");
    await build(
      {
        ...config(),
        naming: {
          template: "{dir}/{base}.{locale}.{ext}",
          baseSuffix: ".base",
        },
        switcher: { enabled: false },
      },
      { cwd }
    );

    const ja = await readFile(join(cwd, "README.ja.md"), "utf8");
    expect(ja).toContain("HELLO");
    expect(ja).not.toContain("hello");
    expect(ja).not.toMatch(/machine|hash=|:::kiritan/);
    const en = await readFile(join(cwd, "README.md"), "utf8");
    expect(en).toContain("hello");
    expect(en).not.toContain("HELLO");
  });
});
