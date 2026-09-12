import { describe, expect, it } from "vitest";
import { parseMarkdown, stringifyMarkdown } from "./parse.js";
import {
  collectCatalogIds,
  collectLocaleBlocks,
  renderForLocale,
} from "./render.js";

describe("renderForLocale", () => {
  it("keeps only the matching locale block and drops the rest", () => {
    const source = [
      "# Title",
      "",
      "Shared intro.",
      "",
      ":::kiritan{locale=en}",
      "## Usage",
      "English text.",
      ":::",
      "",
      ":::kiritan{locale=ja}",
      "## 使い方",
      "日本語のテキスト。",
      ":::",
      "",
      "Shared footer.",
      "",
    ].join("\n");

    const tree = parseMarkdown(source);

    const en = stringifyMarkdown(
      renderForLocale(tree, { targetLocale: "en", defaultLocale: "en" })
    );
    expect(en).toContain("## Usage");
    expect(en).toContain("English text.");
    expect(en).not.toContain("使い方");
    expect(en).toContain("Shared intro.");
    expect(en).toContain("Shared footer.");

    const ja = stringifyMarkdown(
      renderForLocale(tree, { targetLocale: "ja", defaultLocale: "en" })
    );
    expect(ja).toContain("## 使い方");
    expect(ja).not.toContain("Usage");
    expect(ja).toContain("Shared intro.");
  });

  it("resolves a catalog id from the default locale's own content", () => {
    const source = [
      ":::kiritan{#usage-intro}",
      "## Usage",
      "Original text.",
      ":::",
    ].join("\n");
    const tree = parseMarkdown(source);

    const rendered = stringifyMarkdown(
      renderForLocale(tree, { targetLocale: "en", defaultLocale: "en" })
    );
    expect(rendered).toContain("Original text.");
  });

  it("resolves a catalog id from resolveCatalogText for a non-default locale", () => {
    const source = [
      ":::kiritan{#usage-intro}",
      "## Usage",
      "Original text.",
      ":::",
    ].join("\n");
    const tree = parseMarkdown(source);

    const rendered = stringifyMarkdown(
      renderForLocale(tree, {
        targetLocale: "ja",
        defaultLocale: "en",
        resolveCatalogText: (id) =>
          id === "usage-intro" ? "## 使い方\n翻訳済みテキスト。" : undefined,
      })
    );
    expect(rendered).toContain("翻訳済みテキスト。");
    expect(rendered).not.toContain("Original text.");
  });

  it("falls back to the default locale's text and marks it, when a catalog translation is missing", () => {
    const source = [":::kiritan{#usage-intro}", "Original text.", ":::"].join(
      "\n"
    );
    const tree = parseMarkdown(source);

    const fallbacks: string[] = [];
    const rendered = stringifyMarkdown(
      renderForLocale(tree, {
        targetLocale: "ja",
        defaultLocale: "en",
        onFallback: (_kind, key) => fallbacks.push(key),
      })
    );

    expect(rendered).toContain("Original text.");
    expect(rendered).toContain("kiritan:untranslated (source: en)");
    expect(fallbacks).toEqual(["usage-intro"]);
  });

  it("replaces a switcher leaf directive with the provided nodes", () => {
    const source = ["# Title", "", "::kiritan{switcher}", "", "Body."].join(
      "\n"
    );
    const tree = parseMarkdown(source);

    const rendered = stringifyMarkdown(
      renderForLocale(tree, {
        targetLocale: "en",
        defaultLocale: "en",
        renderSwitcher: () => [
          {
            type: "paragraph",
            children: [{ type: "text", value: "SWITCHER" }],
          } as never,
        ],
      })
    );
    expect(rendered).toContain("SWITCHER");
  });

  it("throws on a :::kiritan directive without locale or #id", () => {
    const tree = parseMarkdown([":::kiritan", "oops", ":::"].join("\n"));
    expect(() =>
      renderForLocale(tree, { targetLocale: "en", defaultLocale: "en" })
    ).toThrow(/locale.*#<id>/);
  });
});

describe("collectLocaleBlocks / collectCatalogIds", () => {
  it("finds every locale and id used in the document", () => {
    const tree = parseMarkdown(
      [
        ":::kiritan{locale=en}",
        "a",
        ":::",
        ":::kiritan{locale=ja}",
        "b",
        ":::",
        ":::kiritan{#some-id}",
        "c",
        ":::",
      ].join("\n")
    );
    expect(collectLocaleBlocks(tree)).toEqual(new Set(["en", "ja"]));
    expect(collectCatalogIds(tree)).toEqual(new Set(["some-id"]));
  });
});
