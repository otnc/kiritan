import { describe, expect, it } from "vitest";
import { findKeyMismatches } from "./mismatch.js";

describe("findKeyMismatches", () => {
  it("reports no mismatches when every key has every locale", () => {
    const resource = { submit: { en: "Submit", ja: "送信" } };
    expect(findKeyMismatches(resource, ["en", "ja"])).toEqual([]);
  });

  it("reports a missing locale for a key", () => {
    const resource = { submit: { en: "Submit" } };
    expect(findKeyMismatches(resource, ["en", "ja"])).toEqual([
      { key: "submit", missingLocales: ["ja"] },
    ]);
  });

  it("checks every key independently", () => {
    const resource = {
      submit: { en: "Submit", ja: "送信" },
      cancel: { en: "Cancel" },
    };
    expect(findKeyMismatches(resource, ["en", "ja"])).toEqual([
      { key: "cancel", missingLocales: ["ja"] },
    ]);
  });
});
