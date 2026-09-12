import { describe, expect, it } from "vitest";
import { deepMerge, mergeArray, mergeConfigs } from "./merge.js";

describe("deepMerge", () => {
  it("merges nested plain objects key by key", () => {
    expect(deepMerge({ a: { x: 1, y: 2 }, b: 1 }, { a: { y: 3 } })).toEqual({
      a: { x: 1, y: 3 },
      b: 1,
    });
  });

  it("replaces arrays by default", () => {
    expect(deepMerge({ list: [1, 2] }, { list: [3] })).toEqual({ list: [3] });
  });

  it("concatenates arrays wrapped in mergeArray", () => {
    expect(deepMerge({ list: [1, 2] }, { list: mergeArray([3]) })).toEqual({
      list: [1, 2, 3],
    });
  });

  it("leaves base untouched when override is undefined", () => {
    expect(deepMerge({ a: 1 }, undefined)).toEqual({ a: 1 });
  });

  it("lets a primitive override replace the base value", () => {
    expect(deepMerge({ a: { nested: true } }, { a: "flat" })).toEqual({
      a: "flat",
    });
  });
});

interface Sample {
  naming: { template: string };
  translate: { auto: boolean };
}

describe("mergeConfigs", () => {
  it("merges layers left to right, later layers winning", () => {
    const result = mergeConfigs<Sample>(
      { naming: { template: "a" }, translate: { auto: false } },
      { naming: { template: "b" } },
      { translate: { auto: true } }
    );
    expect(result).toEqual({
      naming: { template: "b" },
      translate: { auto: true },
    });
  });

  it("skips undefined layers", () => {
    expect(
      mergeConfigs<{ a: number; b: number }>({ a: 1 }, undefined, { b: 2 })
    ).toEqual({
      a: 1,
      b: 2,
    });
  });
});
