// Runs the built dist/ of every published package on the oldest Node.js versions engines.node allows (18, 20), where vitest itself can't run. Kept to node:test and plain .mjs so nothing here needs a newer Node.js than the packages do.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
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

test("kiritan CLI localizes yargs's own messages", async () => {
  await assert.rejects(
    run(process.execPath, [cli, "--lang", "ja", "nope"]),
    (error) => /不明|引数/.test(error.stderr)
  );
});
