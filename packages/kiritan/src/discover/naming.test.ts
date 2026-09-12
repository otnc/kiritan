import { describe, expect, it } from "vitest";
import {
  resolveBase,
  resolveNamingOptions,
  resolveOutputPath,
} from "./naming.js";

describe("resolveBase", () => {
  it("splits dir/base/ext and strips the base suffix", () => {
    expect(resolveBase("README.base.md", ".base")).toEqual({
      dir: ".",
      base: "README",
      ext: "md",
    });
    expect(resolveBase("docs/guide.base.md", ".base")).toEqual({
      dir: "docs",
      base: "guide",
      ext: "md",
    });
  });
});

describe("resolveNamingOptions + resolveOutputPath", () => {
  const base = { dir: ".", base: "README", ext: "md" };

  it("uses the dot preset by default", () => {
    const naming = resolveNamingOptions(undefined);
    expect(resolveOutputPath(base, "en", "en", naming)).toBe("README.md");
    expect(resolveOutputPath(base, "ja", "en", naming)).toBe("README.ja.md");
  });

  it.each([
    ["dot", "README.ja.md"],
    ["dash", "README-ja.md"],
    ["prefix", "ja.README.md"],
    ["folder", "ja/README.md"],
  ] as const)(
    "resolves the %s preset for a non-default locale",
    (preset, expected) => {
      const naming = resolveNamingOptions({ preset });
      expect(resolveOutputPath(base, "ja", "en", naming)).toBe(expected);
    }
  );

  it.each([
    ["dot", "README.md"],
    ["dash", "README.md"],
    ["prefix", "README.md"],
    ["folder", "README.md"],
  ] as const)(
    "omits the locale token for the default locale under the %s preset",
    (preset, expected) => {
      const naming = resolveNamingOptions({ preset });
      expect(resolveOutputPath(base, "en", "en", naming)).toBe(expected);
    }
  );

  it("keeps the locale suffix for the default locale when omitDefaultLocaleSuffix is false", () => {
    const naming = resolveNamingOptions({ omitDefaultLocaleSuffix: false });
    expect(resolveOutputPath(base, "en", "en", naming)).toBe("README.en.md");
  });

  it("uses defaultTemplate for the default locale when given", () => {
    const naming = resolveNamingOptions({
      defaultTemplate: "{dir}/{base}.default.{ext}",
    });
    expect(resolveOutputPath(base, "en", "en", naming)).toBe(
      "README.default.md"
    );
  });

  it("prefers an explicit outputs override over the template", () => {
    const naming = resolveNamingOptions({
      outputs: { ja: "i18n/ja/README.md" },
    });
    expect(resolveOutputPath(base, "ja", "en", naming)).toBe(
      "i18n/ja/README.md"
    );
  });

  it("resolves output paths under a subdirectory", () => {
    const naming = resolveNamingOptions(undefined);
    const nested = { dir: "docs", base: "guide", ext: "md" };
    expect(resolveOutputPath(nested, "ja", "en", naming)).toBe(
      "docs/guide.ja.md"
    );
  });
});
