import { describe, expect, it } from "vitest";
import { interpolate } from "./interpolate.js";

describe("interpolate", () => {
  it("substitutes %{name} placeholders", () => {
    expect(
      interpolate("Current version: %{version}", { version: "1.2.0" })
    ).toBe("Current version: 1.2.0");
  });

  it("accepts numbers", () => {
    expect(interpolate("%{count} items", { count: 3 })).toBe("3 items");
  });

  it("keeps unknown placeholders by default", () => {
    expect(interpolate("Hello %{name}", {})).toBe("Hello %{name}");
  });

  it("empties unknown placeholders when onMissing is 'empty'", () => {
    expect(interpolate("Hello %{name}!", {}, { onMissing: "empty" })).toBe(
      "Hello !"
    );
  });

  it("throws on unknown placeholders when onMissing is 'error'", () => {
    expect(() =>
      interpolate("Hello %{name}", {}, { onMissing: "error" })
    ).toThrow(/name/);
  });

  it("unescapes \\%{...} without substituting it", () => {
    expect(interpolate("Use \\%{literal} as-is", { literal: "nope" })).toBe(
      "Use %{literal} as-is"
    );
  });

  it("supports custom delimiters", () => {
    expect(
      interpolate(
        "Hello <<name>>",
        { name: "World" },
        { delimiters: ["<<", ">>"] }
      )
    ).toBe("Hello World");
  });
});
