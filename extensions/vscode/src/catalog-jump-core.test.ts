import { describe, expect, it } from "vitest";
import {
  baseNameFor,
  escapeRegExp,
  findKeyOffset,
  idAt,
} from "../catalog-jump-core.cjs";

describe("idAt", () => {
  it("extracts the id from a :::kiritan{#<id>} line when the position is over it", () => {
    const line = ":::kiritan{#usage-intro}";
    const idStart = line.indexOf("#usage-intro") + 1;
    expect(idAt(line, idStart)).toBe("usage-intro");
  });

  it("returns undefined when the position is outside the id", () => {
    const line = ":::kiritan{#usage-intro}";
    expect(idAt(line, 0)).toBeUndefined();
  });

  it("returns undefined for a non-catalog directive line", () => {
    expect(idAt(":::kiritan{locale=en}", 5)).toBeUndefined();
  });
});

describe("baseNameFor", () => {
  it("strips .base.md", () => {
    expect(baseNameFor("README.base.md")).toBe("README");
  });

  it("strips a plain .md", () => {
    expect(baseNameFor("README.md")).toBe("README");
  });
});

describe("findKeyOffset", () => {
  it("finds the offset of a matching catalog key", () => {
    const text = '{\n  "usage-intro": { "text": "Usage" }\n}';
    const offset = findKeyOffset(text, "usage-intro");
    expect(offset).toBe(text.indexOf('"usage-intro"'));
  });

  it("returns undefined when the key isn't present", () => {
    expect(findKeyOffset("{}", "usage-intro")).toBeUndefined();
  });

  it("escapes regex-special characters in the id", () => {
    const text = '{ "a.b[c]": {} }';
    expect(findKeyOffset(text, "a.b[c]")).toBe(text.indexOf('"a.b[c]"'));
  });
});

describe("escapeRegExp", () => {
  it("escapes regex metacharacters", () => {
    expect(escapeRegExp("a.b*c")).toBe("a\\.b\\*c");
  });
});
