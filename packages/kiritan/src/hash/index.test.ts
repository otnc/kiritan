import { describe, expect, it } from "vitest";
import { extractHashComment, hashText, withHashComment } from "./index.js";

describe("hashText", () => {
  it("is deterministic for the same input", () => {
    expect(hashText("hello")).toBe(hashText("hello"));
  });

  it("differs for different input", () => {
    expect(hashText("hello")).not.toBe(hashText("goodbye"));
  });
});

describe("withHashComment / extractHashComment", () => {
  it("round-trips a hash through an appended comment", () => {
    const withHash = withHashComment("Some translated content.\n", "abc123");
    expect(extractHashComment(withHash)).toBe("abc123");
  });

  it("returns undefined when no hash comment is present", () => {
    expect(extractHashComment("Just plain content.\n")).toBeUndefined();
  });
});
