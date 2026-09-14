import { describe, expect, it } from "vitest";
import { computeFoldingRanges } from "../folding-core.cjs";

describe("computeFoldingRanges", () => {
  it("folds a simple :::kiritan{...} block", () => {
    const lines = [":::kiritan{locale=en}", "Hello", ":::"];
    expect(computeFoldingRanges(lines)).toEqual([{ startLine: 0, endLine: 2 }]);
  });

  it("ignores a leaf directive (no closing fence)", () => {
    const lines = ["::kiritan{switcher}", "Hello"];
    expect(computeFoldingRanges(lines)).toEqual([]);
  });

  it("ignores an unrelated directive", () => {
    const lines = [":::note", "Hello", ":::"];
    expect(computeFoldingRanges(lines)).toEqual([]);
  });

  it("closes a kiritan block against a matching-colon-count fence, skipping mismatched ones", () => {
    // The inner ":::note" (3 colons) closes with its own "::::" — wait, note
    // uses 3, so its close must also be exactly 3. The outer kiritan block
    // uses 4 colons specifically so it isn't closed by the inner note's fence.
    const lines = [
      "::::kiritan{locale=en}",
      ":::note",
      "aside",
      ":::",
      "Hello",
      "::::",
    ];
    expect(computeFoldingRanges(lines)).toEqual([{ startLine: 0, endLine: 5 }]);
  });

  it("handles multiple sibling blocks independently", () => {
    const lines = [
      ":::kiritan{locale=en}",
      "Hello",
      ":::",
      ":::kiritan{locale=ja}",
      "こんにちは",
      ":::",
    ];
    expect(computeFoldingRanges(lines)).toEqual([
      { startLine: 0, endLine: 2 },
      { startLine: 3, endLine: 5 },
    ]);
  });

  it("does not fold a block that never closes", () => {
    const lines = [":::kiritan{locale=en}", "Hello"];
    expect(computeFoldingRanges(lines)).toEqual([]);
  });
});
