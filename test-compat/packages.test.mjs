// Runs the built dist/ of every published package on the oldest Node.js versions engines.node allows (18.3.0, 18, 20), where vitest itself can't run. Kept to node:test and plain .mjs so nothing here needs a newer Node.js than the packages do.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { deepl } from "@kiritan/deepl";
import { myMemory } from "@kiritan/free-translate";
import { googleTranslate } from "@kiritan/google-translate";
import { mask, unmask } from "@kiritan/middleware";
import { createT } from "@kiritan/runtime";
import { resolveConfig } from "kiritan";

const run = promisify(execFile);
const cli = fileURLToPath(
  new URL("../packages/kiritan/dist/cli.mjs", import.meta.url)
);
const doc = "# Hello\n\nSee `code` and [a link](https://example.com).\n";
const next = async () => [];
const cacheDir = fileURLToPath(
  new URL("../node_modules/.cache/", import.meta.url)
);

test("@kiritan/runtime translates, interpolates and switches locale", () => {
  const { t, setLocale } = createT(
    { greet: { en: "Hi, %{name}", ja: "やあ、%{name}" } },
    { locale: "en", fallbackLocale: "en" }
  );
  assert.equal(t("greet", { name: "Kiri" }), "Hi, Kiri");
  setLocale("ja");
  assert.equal(t("greet", { name: "Kiri" }), "やあ、Kiri");
});

test("@kiritan/middleware masks markup and restores it", () => {
  const masked = mask(doc);
  assert.doesNotMatch(masked.text, /example\.com|`code`/);
  assert.equal(unmask(masked.text, masked.spans), doc);
});

test("@kiritan/deepl translates through the middleware layer", async () => {
  const fetch = async (_url, init) => {
    const body = JSON.parse(String(init.body));
    return Response.json({
      translations: body.text.map((text) => ({ text: text.toUpperCase() })),
    });
  };
  const [out] = await deepl({ apiKey: "key:fx", fetch }).handle(
    [{ text: doc, from: "en", to: "ja" }],
    next
  );
  assert.match(out, /HELLO/);
  assert.match(out, /`code`/);
  assert.match(out, /\(https:\/\/example\.com\)/);
});

test("@kiritan/google-translate translates through the middleware layer", async () => {
  const fetch = async (_url, init) => {
    const body = JSON.parse(String(init.body));
    return Response.json({
      data: {
        translations: body.q.map((text) => ({
          translatedText: text.toUpperCase(),
        })),
      },
    });
  };
  const [out] = await googleTranslate({ apiKey: "key", fetch }).handle(
    [{ text: doc, from: "en", to: "ja" }],
    next
  );
  assert.match(out, /HELLO/);
  assert.match(out, /`code`/);
});

test("@kiritan/free-translate translates through the middleware layer", async () => {
  const fetch = async (url) => {
    const q = new URL(String(url)).searchParams.get("q");
    return Response.json({
      responseStatus: 200,
      responseData: { translatedText: q.toUpperCase() },
    });
  };
  const [out] = await myMemory({ fetch, minInterval: 0 }).handle(
    [{ text: "Hello `code`", from: "en", to: "ja" }],
    next
  );
  assert.equal(out, "HELLO `code`");
});

test("kiritan CLI scaffolds and builds a project", async () => {
  // Inside the repo so the scaffolded config's `import ... from "kiritan"` resolves to the workspace package.
  await mkdir(cacheDir, { recursive: true });
  const cwd = await mkdtemp(join(cacheDir, "kiritan-compat-"));
  try {
    await run(process.execPath, [cli, "init"], { cwd });
    await writeFile(
      join(cwd, "base", "README.base.md"),
      ":::kiritan{locale=en}\nEnglish.\n:::\n:::kiritan{locale=ja}\n日本語。\n:::\n",
      "utf8"
    );
    await run(process.execPath, [cli, "build"], { cwd });
    await run(process.execPath, [cli, "check"], { cwd });
    await run(process.execPath, [cli, "verify"], { cwd });
    assert.match(await readFile(join(cwd, "README.ja.md"), "utf8"), /日本語/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("kiritan CLI rejects an unknown argument", async () => {
  await assert.rejects(
    run(process.execPath, [cli, "build", "--locle", "ja"]),
    (error) => /Unknown argument: --locle/.test(error.stderr)
  );
});

test("kiritan CLI translates its help with --lang", async () => {
  const { stdout } = await run(process.execPath, [
    cli,
    "--help",
    "--lang",
    "ja",
  ]);
  assert.match(stdout, /ローカライズされたドキュメントをビルドする/);
});

/** Writes `files` into a fresh project inside the repo (so `import ... from "kiritan"` resolves), runs `body`, then removes it. */
async function withProject(files, body) {
  await mkdir(cacheDir, { recursive: true });
  const cwd = await mkdtemp(join(cacheDir, "kiritan-config-"));
  try {
    for (const [name, content] of Object.entries(files)) {
      await writeFile(join(cwd, name), content, "utf8");
    }
    await body(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

// *.kiritanconfig has no extension Node.js recognizes, and loads through jiti rather than Node.js's own ESM detection (22.7+), so none of this depends on the Node.js version.
test("kiritan loads a *.kiritanconfig cascade with imports and top-level await", async () => {
  await withProject(
    {
      "locales.ts": 'export const list: string[] = ["en", "ja"];\n',
      ".kiritanconfig": [
        'import { defineConfig } from "kiritan";',
        'import { list } from "./locales.ts";',
        'const glob = await Promise.resolve("x.md");',
        'export default defineConfig({ locales: { default: "en", list }, sources: [{ glob, strategy: "inline" }] });',
      ].join("\n"),
      "ci.kiritanconfig":
        "export default { check: { failOn: ['missing'] } };\n",
      "local.kiritanconfig":
        "module.exports = { naming: { template: '{base}.{locale}.{ext}' } };\n",
    },
    async (cwd) => {
      const config = await resolveConfig({ cwd, mode: "ci" });
      assert.deepEqual(config.locales.list, ["en", "ja"]);
      assert.equal(config.sources[0].glob, "x.md");
      assert.deepEqual(config.check.failOn, ["missing"]);
      assert.equal(config.naming.template, "{base}.{locale}.{ext}");

      const cjs = createRequire(import.meta.url)("kiritan");
      const fromCjs = await cjs.resolveConfig({ cwd });
      assert.deepEqual(fromCjs.locales.list, ["en", "ja"]);
    }
  );
});
