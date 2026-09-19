import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { KiritanConfig } from "../config/types.js";
import { hashText } from "../hash/index.js";
import { build } from "./build.js";
import { verify } from "./verify.js";

let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "kiritan-verify-"));
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

const config: KiritanConfig = {
  locales: { default: "en", list: ["en", "ja"] },
  sources: [{ glob: "README.base.md", strategy: "inline" }],
  naming: { template: "{base}.{locale}.{ext}", baseSuffix: ".base" },
  interpolation: {
    onMissing: "keep",
    variables: { version: "1.0.0" },
  },
};

const base = (version = "%{version}") =>
  [
    ":::kiritan{locale=en}",
    `English ${version}.`,
    ":::",
    ":::kiritan{locale=ja}",
    `日本語 ${version}。`,
    ":::",
    "",
  ].join("\n");

describe("verify", () => {
  it("reports every generated document as ok right after a build, and writes nothing", async () => {
    await writeFile(join(cwd, "README.base.md"), base());
    await build(config, { cwd });
    const before = await readFile(join(cwd, "README.md"), "utf8");

    const result = await verify(config, { cwd });

    expect(result.failed).toBe(false);
    expect(result.entries.map((e) => [e.path, e.locale, e.status])).toEqual([
      ["README.md", "en", "ok"],
      ["README.ja.md", "ja", "ok"],
    ]);
    for (const entry of result.entries) {
      expect(entry.actualHash).toBe(entry.expectedHash);
    }
    expect(await readFile(join(cwd, "README.md"), "utf8")).toBe(before);
  });

  it("flags a document as a mismatch once the base file changes", async () => {
    await writeFile(join(cwd, "README.base.md"), base());
    await build(config, { cwd });
    await writeFile(join(cwd, "README.base.md"), base("v%{version}"));

    const result = await verify(config, { cwd });

    expect(result.failed).toBe(true);
    expect(result.entries.map((e) => e.status)).toEqual([
      "mismatch",
      "mismatch",
    ]);
  });

  it("flags a hand-edited generated document, with both hashes reported", async () => {
    await writeFile(join(cwd, "README.base.md"), base());
    await build(config, { cwd });
    const edited = "Tampered.\n";
    await writeFile(join(cwd, "README.md"), edited);

    const result = await verify(config, { cwd });

    const entry = result.entries.find((e) => e.path === "README.md");
    expect(entry).toMatchObject({
      status: "mismatch",
      source: "README.base.md",
      locale: "en",
      actualHash: hashText(edited),
    });
    expect(entry?.expectedHash).not.toBe(entry?.actualHash);
    expect(result.entries.find((e) => e.path === "README.ja.md")?.status).toBe(
      "ok"
    );
  });

  it("flags a document that was never generated", async () => {
    await writeFile(join(cwd, "README.base.md"), base());

    const result = await verify(config, { cwd });

    expect(result.failed).toBe(true);
    expect(result.entries.map((e) => e.status)).toEqual(["missing", "missing"]);
    expect(result.entries[0].actualHash).toBeUndefined();
  });

  it("ignores line-ending differences", async () => {
    await writeFile(join(cwd, "README.base.md"), base());
    await build(config, { cwd });
    const text = await readFile(join(cwd, "README.md"), "utf8");
    await writeFile(join(cwd, "README.md"), text.replace(/\n/g, "\r\n"));

    expect((await verify(config, { cwd })).failed).toBe(false);
  });

  it("with a locale option, only checks that locale", async () => {
    await writeFile(join(cwd, "README.base.md"), base());
    await build(config, { cwd });
    await writeFile(join(cwd, "README.md"), "Tampered.\n");

    const result = await verify(config, { cwd, locale: "ja" });

    expect(result.failed).toBe(false);
    expect(result.entries.map((e) => e.locale)).toEqual(["ja"]);
  });
});
