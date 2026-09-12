import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveCascadePaths, resolveConfig } from "./load.js";

const fixturesDir = fileURLToPath(
  new URL("./__fixtures__/cascade", import.meta.url)
);

describe("resolveCascadePaths", () => {
  it("finds the base and local files when no mode is given", () => {
    const paths = resolveCascadePaths(fixturesDir);
    expect(paths.map((p) => p.replace(/^.*[/\\]/, ""))).toEqual([
      ".kiritan.base.mjs",
      ".kiritan.local.mjs",
    ]);
  });

  it("includes the mode file when it exists", () => {
    const paths = resolveCascadePaths(fixturesDir, "dev");
    expect(paths.map((p) => p.replace(/^.*[/\\]/, ""))).toEqual([
      ".kiritan.base.mjs",
      ".kiritan.dev.mjs",
      ".kiritan.local.mjs",
    ]);
  });

  it("skips a mode file that doesn't exist", () => {
    const paths = resolveCascadePaths(fixturesDir, "staging");
    expect(paths.map((p) => p.replace(/^.*[/\\]/, ""))).toEqual([
      ".kiritan.base.mjs",
      ".kiritan.local.mjs",
    ]);
  });
});

describe("resolveConfig", () => {
  it("merges the cascade and fills in defaults", async () => {
    const config = await resolveConfig({ cwd: fixturesDir, mode: "dev" });

    expect(config.locales).toEqual({ default: "en", list: ["en", "ja"] });
    expect(config.sources).toEqual([
      { glob: "README.base.md", strategy: "inline" },
    ]);
    // base layer sets naming.preset: "dash"; applyDefaults resolves it to a template.
    expect(config.naming?.template).toBe("{dir}/{base}-{locale}.{ext}");
    // local layer's outputs are layered on top of the base's naming.
    expect(config.naming?.outputs).toEqual({ ja: "i18n/ja/README.md" });
    // dev layer turns auto-translate on; other translate defaults still apply.
    expect(config.translate).toEqual({ middlewares: [], auto: true });
    // untouched defaults still come through.
    expect(config.interpolation?.delimiters).toEqual(["%{", "}"]);
    expect(config.check?.failOn).toEqual([
      "missing",
      "stale",
      "i18n-key-mismatch",
    ]);
  });

  it("omits the mode layer when the mode doesn't match a file", async () => {
    const config = await resolveConfig({ cwd: fixturesDir, mode: "staging" });
    expect(config.translate?.auto).toBe(false);
  });
});
