import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { KiritanConfig } from "../config/types.js";
import { typegen } from "./typegen.js";

let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "kiritan-typegen-"));
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

describe("typegen", () => {
  it("merges colocated files into a namespaced data file and its type declaration", async () => {
    await mkdir(join(cwd, "src", "components", "Button"), { recursive: true });
    await writeFile(
      join(cwd, "src", "components", "Button", "Button.i18n.mjs"),
      "export default { submit: { en: 'Submit', ja: '送信' } };\n",
      "utf8"
    );
    const config = baseConfig({
      runtime: {
        sources: [{ glob: "src/**/*.i18n.mjs", strategy: "colocated" }],
      },
    });

    const result = await typegen(config, { cwd });
    expect(result.keyCount).toBe(1);
    expect(result.dataPath).toBe("kiritan.runtime.mjs");
    expect(result.typesPath).toBe("kiritan.runtime.d.ts");

    const data = await readFile(join(cwd, result.dataPath), "utf8");
    expect(data).toContain('"components/Button.submit"');
    expect(data).toContain('"en": "Submit"');

    const types = await readFile(join(cwd, result.typesPath), "utf8");
    expect(types).toContain(
      '"components/Button.submit": { "en": string; "ja": string; };'
    );
  });

  it("merges split files sharing a groupKey under one namespace", async () => {
    await mkdir(join(cwd, "src"), { recursive: true });
    await writeFile(
      join(cwd, "src", "common.en.i18n.mjs"),
      "export default { greeting: 'Hello' };\n",
      "utf8"
    );
    await writeFile(
      join(cwd, "src", "common.ja.i18n.mjs"),
      "export default { greeting: 'こんにちは' };\n",
      "utf8"
    );
    const config = baseConfig({
      runtime: {
        sources: [{ glob: "src/*.i18n.mjs", strategy: "split" }],
      },
    });

    const result = await typegen(config, { cwd });
    const data = await readFile(join(cwd, result.dataPath), "utf8");
    expect(data).toContain('"common.greeting"');
  });

  it("respects a custom output basename", async () => {
    const config = baseConfig({
      runtime: { sources: [], typegenOutput: "generated/kiritan" },
    });
    await mkdir(join(cwd, "generated"), { recursive: true });

    const result = await typegen(config, { cwd });
    expect(result.dataPath).toBe("generated/kiritan.mjs");
    expect(result.typesPath).toBe("generated/kiritan.d.ts");
  });

  it("honors a custom namespace function", async () => {
    await mkdir(join(cwd, "src"), { recursive: true });
    await writeFile(
      join(cwd, "src", "Button.i18n.mjs"),
      "export default { submit: { en: 'Submit', ja: '送信' } };\n",
      "utf8"
    );
    const config = baseConfig({
      runtime: {
        sources: [
          {
            glob: "src/**/*.i18n.mjs",
            strategy: "colocated",
            namespace: () => "custom",
          },
        ],
      },
    });

    const result = await typegen(config, { cwd });
    const data = await readFile(join(cwd, result.dataPath), "utf8");
    expect(data).toContain('"custom.submit"');
  });
});
