import { describe, expect, it } from "vitest";
import { parseMarkdown, stringifyMarkdown } from "../directive/parse.js";
import { interpolateTree } from "./index.js";

describe("interpolateTree", () => {
  it("expands %{name} in prose text", () => {
    const tree = parseMarkdown("Current version: %{version}\n");
    const result = stringifyMarkdown(
      interpolateTree(tree, { version: "1.2.0" })
    );
    expect(result).toContain("Current version: 1.2.0");
  });

  it("leaves a front matter block untouched", () => {
    const tree = parseMarkdown("---\ntitle: v%{version}\n---\n\nv%{version}\n");
    const result = stringifyMarkdown(
      interpolateTree(tree, { version: "1.2.0" })
    );
    expect(result).toBe("---\ntitle: v%{version}\n---\n\nv1.2.0\n");
  });

  it("does not expand placeholders inside code blocks by default", () => {
    const tree = parseMarkdown("```\n%{version}\n```\n");
    const result = stringifyMarkdown(
      interpolateTree(tree, { version: "1.2.0" })
    );
    expect(result).toContain("%{version}");
  });

  it("does not expand placeholders inside inline code by default", () => {
    const tree = parseMarkdown("Use `%{version}` literally.\n");
    const result = stringifyMarkdown(
      interpolateTree(tree, { version: "1.2.0" })
    );
    expect(result).toContain("`%{version}`");
  });

  it("expands inside code blocks when skipCodeBlocks is false", () => {
    const tree = parseMarkdown("```\n%{version}\n```\n");
    const result = stringifyMarkdown(
      interpolateTree(tree, { version: "1.2.0" }, { skipCodeBlocks: false })
    );
    expect(result).toContain("1.2.0");
  });
});
