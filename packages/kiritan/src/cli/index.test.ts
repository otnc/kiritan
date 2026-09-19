import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { createCli } from "./index.js";

let cwd: string;
let originalCwd: string;
let logSpy: MockInstance<typeof console.log>;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "kiritan-cli-"));
  originalCwd = process.cwd();
  process.chdir(cwd);
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(async () => {
  process.chdir(originalCwd);
  logSpy.mockRestore();
  await rm(cwd, { recursive: true, force: true });
});

function logged(): string[] {
  return logSpy.mock.calls.map((call) => String(call[0]));
}

describe("createCli (init)", () => {
  it("prints translated created/skipped lines depending on --lang", async () => {
    await createCli("en", { exitProcess: false }).parseAsync(["init"]);
    expect(logged()).toEqual([
      "created .kiritanconfig",
      "created base/README.base.md",
      "created .gitignore",
    ]);

    logSpy.mockClear();
    await createCli("ja", { exitProcess: false }).parseAsync(["init"]);
    expect(logged()).toEqual([
      ".kiritanconfig をスキップしました(既に存在します)",
      "base/README.base.md をスキップしました(既に存在します)",
      ".gitignore をスキップしました(既に存在します)",
    ]);
  });
});

describe("createCli (build/check)", () => {
  it("builds and checks a scaffolded project, with translated wrapper text only", async () => {
    await writeFile(
      join(cwd, ".kiritanconfig"),
      [
        "export default {",
        '  locales: { default: "en", list: ["en", "ja"] },',
        '  sources: [{ glob: "README.base.md", strategy: "inline" }],',
        '  naming: { template: "{base}.{locale}.{ext}" },',
        "};",
      ].join("\n"),
      "utf8"
    );
    await writeFile(
      join(cwd, "README.base.md"),
      [
        ":::kiritan{locale=en}",
        "English.",
        ":::",
        ":::kiritan{locale=ja}",
        "日本語。",
        ":::",
      ].join("\n"),
      "utf8"
    );

    await createCli("ja", { exitProcess: false }).parseAsync(["build"]);
    expect(logged().sort()).toEqual(
      ["README.md を書き込みました", "README.ja.md を書き込みました"].sort()
    );

    logSpy.mockClear();
    await createCli("ja", { exitProcess: false }).parseAsync(["check"]);
    expect(logged()).toEqual(["kiritan check: 問題は見つかりませんでした"]);
  });

  it("keeps --json output as plain machine-readable JSON regardless of --lang", async () => {
    await writeFile(
      join(cwd, ".kiritanconfig"),
      [
        "export default {",
        '  locales: { default: "en", list: ["en", "ja"] },',
        '  sources: [{ glob: "README.base.md", strategy: "inline" }],',
        "};",
      ].join("\n"),
      "utf8"
    );
    await writeFile(
      join(cwd, "README.base.md"),
      [":::kiritan{locale=en}", "hello", ":::"].join("\n"),
      "utf8"
    );

    await createCli("ja", { exitProcess: false }).parseAsync([
      "check",
      "--json",
    ]);
    expect(logged()).toHaveLength(1);
    const parsed = JSON.parse(logged()[0]!);
    expect(parsed.issues).toEqual([
      {
        kind: "missing",
        source: "README.base.md",
        locale: "ja",
        detail: "no :::kiritan{locale=ja} block",
      },
    ]);
    expect(parsed.failed).toBe(true);
  });
});

describe("createCli (verify)", () => {
  async function scaffold() {
    await writeFile(
      join(cwd, ".kiritanconfig"),
      [
        "export default {",
        '  locales: { default: "en", list: ["en", "ja"] },',
        '  sources: [{ glob: "README.base.md", strategy: "inline" }],',
        '  naming: { template: "{base}.{locale}.{ext}" },',
        "};",
      ].join("\n"),
      "utf8"
    );
    await writeFile(
      join(cwd, "README.base.md"),
      [
        ":::kiritan{locale=en}",
        "English.",
        ":::",
        ":::kiritan{locale=ja}",
        "日本語。",
        ":::",
      ].join("\n"),
      "utf8"
    );
  }

  beforeEach(() => {
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it("passes after a build, and fails with a translated line once a document is edited", async () => {
    await scaffold();
    await createCli("en", { exitProcess: false }).parseAsync(["build"]);

    logSpy.mockClear();
    await createCli("en", { exitProcess: false }).parseAsync(["verify"]);
    expect(logged()).toEqual([
      "kiritan verify: 2 generated document(s) up to date",
    ]);
    expect(process.exitCode).toBeUndefined();

    await writeFile(join(cwd, "README.md"), "Tampered.\n", "utf8");
    logSpy.mockClear();
    await createCli("ja", { exitProcess: false }).parseAsync(["verify"]);
    expect(logged()).toHaveLength(1);
    expect(logged()[0]).toMatch(
      /^\[mismatch\] README\.md \(en、元: README\.base\.md\): 期待 [0-9a-f]+、実際 [0-9a-f]+$/
    );
    expect(process.exitCode).toBe(1);
  });

  it("prints machine-readable JSON with --json", async () => {
    await scaffold();
    await createCli("en", { exitProcess: false }).parseAsync(["build"]);
    logSpy.mockClear();
    await createCli("ja", { exitProcess: false }).parseAsync([
      "verify",
      "--json",
    ]);
    const parsed = JSON.parse(logged()[0]);
    expect(parsed.failed).toBe(false);
    expect(parsed.entries).toHaveLength(2);
  });
});

describe("createCli (translate.auto)", () => {
  it("tells you when middlewares are configured but translate.auto isn't true", async () => {
    await writeFile(
      join(cwd, ".kiritanconfig"),
      [
        "export default {",
        '  locales: { default: "en", list: ["en", "ja"] },',
        '  sources: [{ glob: "README.base.md", strategy: "sidecar" }],',
        '  naming: { template: "{base}.{locale}.{ext}" },',
        "  translate: { middlewares: [async (ctx) => ctx.text.toUpperCase()] },",
        "};",
      ].join("\n"),
      "utf8"
    );
    await writeFile(join(cwd, "README.base.md"), "hello", "utf8");

    await createCli("en", { exitProcess: false }).parseAsync(["translate"]);
    expect(logged()).toEqual([
      "kiritan translate: translate.middlewares are configured for 1 source(s), but translate.auto is not true, so they did not run (set translate: { auto: true } to enable them)",
      "kiritan translate: nothing to do",
    ]);
  });
});
