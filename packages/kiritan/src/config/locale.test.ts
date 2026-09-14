import { describe, expect, it } from "vitest";
import type { KiritanConfig } from "./types.js";
import { resolveTargetLocales } from "./locale.js";

function baseConfig(): KiritanConfig {
  return { locales: { default: "en", list: ["en", "ja", "fr"] }, sources: [] };
}

describe("resolveTargetLocales", () => {
  it("returns every configured locale when no locale is requested", () => {
    expect(resolveTargetLocales(baseConfig(), undefined)).toEqual([
      "en",
      "ja",
      "fr",
    ]);
  });

  it("returns only the requested locale when it's configured", () => {
    expect(resolveTargetLocales(baseConfig(), "ja")).toEqual(["ja"]);
  });

  it("throws for a locale that isn't in locales.list", () => {
    expect(() => resolveTargetLocales(baseConfig(), "de")).toThrow(
      /locale "de" is not in locales\.list \(en, ja, fr\)/
    );
  });
});
