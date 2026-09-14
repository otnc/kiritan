import { describe, expect, it } from "vitest";
import { resolveCliLanguage } from "./locale.js";

describe("resolveCliLanguage", () => {
  it("defaults to en with no --lang and no relevant env vars", () => {
    expect(resolveCliLanguage([], {})).toBe("en");
  });

  it("reads an explicit --lang <value>", () => {
    expect(resolveCliLanguage(["build", "--lang", "ja"], {})).toBe("ja");
  });

  it("reads an explicit --lang=<value>", () => {
    expect(resolveCliLanguage(["build", "--lang=ja"], {})).toBe("ja");
  });

  it("falls back to en for an explicit but unsupported --lang, ignoring env vars", () => {
    expect(resolveCliLanguage(["--lang", "fr"], { LANG: "ja_JP.UTF-8" })).toBe(
      "en"
    );
  });

  it("falls back to KIRITAN_LANG when no --lang flag is given", () => {
    expect(resolveCliLanguage([], { KIRITAN_LANG: "ja" })).toBe("ja");
  });

  it("falls back to LC_ALL, then LC_MESSAGES, then LANG, in that order", () => {
    expect(
      resolveCliLanguage([], {
        LC_ALL: "ja_JP.UTF-8",
        LC_MESSAGES: "en_US.UTF-8",
        LANG: "en_US.UTF-8",
      })
    ).toBe("ja");
    expect(
      resolveCliLanguage([], {
        LC_MESSAGES: "ja_JP.UTF-8",
        LANG: "en_US.UTF-8",
      })
    ).toBe("ja");
    expect(resolveCliLanguage([], { LANG: "ja_JP.UTF-8" })).toBe("ja");
  });

  it("parses the language subtag out of a full POSIX locale string", () => {
    expect(resolveCliLanguage([], { LANG: "ja_JP.UTF-8" })).toBe("ja");
    expect(resolveCliLanguage([], { LANG: "en_US.UTF-8" })).toBe("en");
  });

  it("falls back to en for an unsupported env var value", () => {
    expect(resolveCliLanguage([], { LANG: "fr_FR.UTF-8" })).toBe("en");
  });
});
