import { describe, expect, it } from "vitest";
import { splitLocaleFromPath } from "./locale-path.js";

const locales = ["en", "ja"];

describe("splitLocaleFromPath", () => {
  it("finds a dot-delimited locale segment (split strategy)", () => {
    expect(
      splitLocaleFromPath("src/components/Button/Button.en.i18n.ts", locales)
    ).toEqual({
      locale: "en",
      groupKey: "src/components/Button/Button.i18n.ts",
    });
  });

  it("finds a slash-delimited locale segment (centralized strategy)", () => {
    expect(splitLocaleFromPath("locales/en/common.json", locales)).toEqual({
      locale: "en",
      groupKey: "locales/common.json",
    });
  });

  it("groups two locales' sibling files under the same key", () => {
    const en = splitLocaleFromPath("Button.en.i18n.ts", locales);
    const ja = splitLocaleFromPath("Button.ja.i18n.ts", locales);
    expect(en?.groupKey).toBe(ja?.groupKey);
  });

  it("returns undefined when no segment matches a known locale", () => {
    expect(splitLocaleFromPath("src/Button.i18n.ts", locales)).toBeUndefined();
  });

  it("does not match a locale code that's only a substring of a segment", () => {
    expect(splitLocaleFromPath("src/entry.i18n.ts", locales)).toBeUndefined();
  });

  it("handles the locale as the very first path segment", () => {
    expect(splitLocaleFromPath("en/common.json", locales)).toEqual({
      locale: "en",
      groupKey: "common.json",
    });
  });
});
