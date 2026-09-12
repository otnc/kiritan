import { describe, expect, it } from "vitest";
import { parseMarkdown, stringifyMarkdown } from "./parse.js";

describe("stringifyMarkdown", () => {
  it("round-trips a GitHub alert block without escaping its marker", () => {
    const source = "> [!WARNING]\n>\n> Be careful.\n";
    const result = stringifyMarkdown(parseMarkdown(source));
    expect(result).toContain("> [!WARNING]");
    expect(result).not.toContain("\\[!WARNING]");
  });

  it.each(["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"])(
    "restores the %s marker",
    (type) => {
      const source = `> [!${type}]\n>\n> Text.\n`;
      const result = stringifyMarkdown(parseMarkdown(source));
      expect(result).toContain(`> [!${type}]`);
    }
  );

  it("restores the marker regardless of its casing", () => {
    const source = "> [!Warning]\n>\n> Text.\n";
    const result = stringifyMarkdown(parseMarkdown(source));
    expect(result).toContain("> [!Warning]");
    expect(result).not.toContain("\\[!Warning]");
  });

  it.each(["success", "gitlab-flag", "custom_type"])(
    "restores markers outside GitHub's fixed alert list, like %s",
    (type) => {
      const source = `> [!${type}]\n>\n> Text.\n`;
      const result = stringifyMarkdown(parseMarkdown(source));
      expect(result).toContain(`> [!${type}]`);
    }
  );
});
