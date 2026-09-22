import { describe, expect, it } from "vitest";
import {
  padAlertBlankLines,
  parseMarkdown,
  stringifyMarkdown,
} from "./parse.js";

describe("front matter", () => {
  const source = "---\ntitle: Hello %{name}\ntags: [a, b]\n---\n\n# Body\n";

  it("keeps a leading YAML block as one opaque node", () => {
    const tree = parseMarkdown(source);
    expect(tree.children[0]).toMatchObject({
      type: "yaml",
      value: "title: Hello %{name}\ntags: [a, b]",
    });
  });

  it("round-trips the block verbatim", () => {
    const result = stringifyMarkdown(parseMarkdown(source));
    expect(result).toBe(source);
  });
});

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

describe("padAlertBlankLines", () => {
  const alert = "> [!NOTE]\n>\n> Text.\n>\n> More.\n\nOutside.\n";

  it("puts the spaces on a bare > inside an alert, and only there", () => {
    expect(padAlertBlankLines(alert, 3)).toBe(
      "> [!NOTE]\n>   \n> Text.\n>   \n> More.\n\nOutside.\n"
    );
  });

  it("does nothing for 0 spaces", () => {
    expect(padAlertBlankLines(alert, 0)).toBe(alert);
  });

  it("leaves an ordinary blockquote alone", () => {
    const quote = "> a\n>\n> b\n";
    expect(padAlertBlankLines(quote, 3)).toBe(quote);
  });

  it("stops at the end of the alert and handles a second one", () => {
    const text = "> [!NOTE]\n>\n> a\n\n> quote\n>\n> b\n\n> [!TIP]\n>\n> c\n";
    expect(padAlertBlankLines(text, 3)).toBe(
      "> [!NOTE]\n>   \n> a\n\n> quote\n>\n> b\n\n> [!TIP]\n>   \n> c\n"
    );
  });

  it("does not touch blank lines inside a fenced code block in an alert", () => {
    const text = "> [!NOTE]\n>\n> ```\n> a\n>\n> b\n> ```\n>\n> end\n";
    expect(padAlertBlankLines(text, 3)).toBe(
      "> [!NOTE]\n>   \n> ```\n> a\n>\n> b\n> ```\n>   \n> end\n"
    );
  });

  it("keeps CRLF line endings", () => {
    expect(padAlertBlankLines("> [!NOTE]\r\n>\r\n> a\r\n", 3)).toBe(
      "> [!NOTE]\r\n>   \r\n> a\r\n"
    );
  });
});
