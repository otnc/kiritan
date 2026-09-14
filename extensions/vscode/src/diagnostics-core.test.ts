import { describe, expect, it } from "vitest";
import {
  findUndefinedVariables,
  mapCheckIssuesToPositions,
} from "../diagnostics-core.cjs";

describe("findUndefinedVariables", () => {
  it("flags a %{name} not in knownNames", () => {
    const lines = ["Hello, %{name}!"];
    const found = findUndefinedVariables(lines, [], undefined);
    expect(found).toEqual([
      { line: 0, startChar: 7, endChar: 14, name: "name" },
    ]);
  });

  it("does not flag a %{name} that is known", () => {
    const lines = ["Hello, %{name}!"];
    expect(findUndefinedVariables(lines, ["name"], undefined)).toEqual([]);
  });

  it("does not flag an escaped \\%{name}", () => {
    const lines = ["Use \\%{name} literally."];
    expect(findUndefinedVariables(lines, [], undefined)).toEqual([]);
  });

  it("skips the scan entirely for non-default delimiters", () => {
    const lines = ["Hello, %{name}!"];
    expect(findUndefinedVariables(lines, [], ["{{", "}}"])).toEqual([]);
  });

  it("does not flag %{name} inside a fenced code block", () => {
    const lines = ["```md", "Current version: %{version}", "```"];
    expect(findUndefinedVariables(lines, [], undefined)).toEqual([]);
  });

  it("resumes scanning once a fence closes", () => {
    const lines = ["```", "%{fenced}", "```", "%{real}"];
    const found = findUndefinedVariables(lines, [], undefined);
    expect(found.map((f) => f.name)).toEqual(["real"]);
  });

  it("does not flag %{name} inside an inline code span", () => {
    const lines = ["Use `%{name}` for interpolation."];
    expect(findUndefinedVariables(lines, [], undefined)).toEqual([]);
  });

  it("still flags a real %{name} on the same line as an inline code span", () => {
    const lines = ["Like `%{example}`, this %{real} one is live."];
    const found = findUndefinedVariables(lines, [], undefined);
    expect(found.map((f) => f.name)).toEqual(["real"]);
  });

  it("finds multiple occurrences across lines", () => {
    const lines = ["%{a} and %{b}", "%{a} again"];
    const found = findUndefinedVariables(lines, [], undefined);
    expect(found.map((f) => `${f.line}:${f.name}`)).toEqual([
      "0:a",
      "0:b",
      "1:a",
    ]);
  });
});

describe("mapCheckIssuesToPositions", () => {
  it("maps a catalog issue to its :::kiritan{#<id>} line", () => {
    const lines = [":::kiritan{#intro}", "Original.", ":::"];
    const issues = [
      {
        kind: "missing" as const,
        source: "README.base.md",
        locale: "ja",
        detail: 'catalog id "intro" has no translation',
        id: "intro",
      },
    ];
    const mapped = mapCheckIssuesToPositions(lines, issues, "README.base.md");
    expect(mapped).toEqual([
      { line: 0, startChar: 12, endChar: 17, issue: issues[0] },
    ]);
  });

  it("ignores issues for a different source file", () => {
    const lines = [":::kiritan{#intro}", "Original.", ":::"];
    const issues = [
      {
        kind: "missing" as const,
        source: "OTHER.base.md",
        locale: "ja",
        detail: "x",
        id: "intro",
      },
    ];
    expect(mapCheckIssuesToPositions(lines, issues, "README.base.md")).toEqual(
      []
    );
  });

  it("skips a catalog issue whose id isn't found in the document", () => {
    const lines = [":::kiritan{#other}", "x", ":::"];
    const issues = [
      {
        kind: "missing" as const,
        source: "README.base.md",
        locale: "ja",
        detail: "x",
        id: "intro",
      },
    ];
    expect(mapCheckIssuesToPositions(lines, issues, "README.base.md")).toEqual(
      []
    );
  });

  it("places a file-level (no id) issue on line 0", () => {
    const lines = ["English content.", "more text"];
    const issues = [
      {
        kind: "missing" as const,
        source: "README.base.md",
        locale: "ja",
        detail: 'sidecar file "README.ja.md" does not exist',
      },
    ];
    const mapped = mapCheckIssuesToPositions(lines, issues, "README.base.md");
    expect(mapped).toEqual([
      { line: 0, startChar: 0, endChar: 16, issue: issues[0] },
    ]);
  });
});
