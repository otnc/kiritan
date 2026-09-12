import { describe, expect, it } from "vitest";
import { parseMarkdown, stringifyMarkdown } from "../directive/parse.js";
import { renderForLocale } from "../directive/render.js";
import {
  buildSwitcherLinks,
  ensureSwitcherMarker,
  renderSwitcherNodes,
  resolveLabel,
} from "./index.js";

describe("resolveLabel", () => {
  it("uses Intl.DisplayNames' autonym by default", () => {
    expect(resolveLabel("en", undefined)).toBe("English");
    expect(resolveLabel("ja", undefined)).toBe("日本語");
  });

  it("prefers an explicit label override", () => {
    expect(resolveLabel("en", { en: "English (US)" })).toBe("English (US)");
  });

  it("returns false when the locale is excluded", () => {
    expect(resolveLabel("es", { es: false })).toBe(false);
  });
});

describe("buildSwitcherLinks", () => {
  const outputPathFor = (locale: string) =>
    locale === "en" ? "README.md" : `README.${locale}.md`;

  it("builds relative hrefs and marks the current locale", () => {
    const links = buildSwitcherLinks({
      locales: ["en", "ja"],
      currentLocale: "en",
      currentOutputPath: "README.md",
      outputPathFor,
    });
    expect(links).toEqual([
      { locale: "en", label: "English", href: "README.md", isCurrent: true },
      { locale: "ja", label: "日本語", href: "README.ja.md", isCurrent: false },
    ]);
  });

  it("excludes locales whose label resolves to false", () => {
    const links = buildSwitcherLinks({
      locales: ["en", "ja", "es"],
      currentLocale: "en",
      currentOutputPath: "README.md",
      outputPathFor,
      labels: { es: false },
    });
    expect(links.map((l) => l.locale)).toEqual(["en", "ja"]);
  });

  it("computes hrefs relative to a nested output path", () => {
    const links = buildSwitcherLinks({
      locales: ["en", "ja"],
      currentLocale: "ja",
      currentOutputPath: "ja/README.md",
      outputPathFor: (locale) =>
        locale === "en" ? "README.md" : "ja/README.md",
    });
    expect(links.find((l) => l.locale === "en")?.href).toBe("../README.md");
  });
});

describe("renderSwitcherNodes", () => {
  it("renders the current locale in bold and others as links, separated", () => {
    const nodes = renderSwitcherNodes(
      [
        { locale: "en", label: "English", href: "README.md", isCurrent: true },
        {
          locale: "ja",
          label: "日本語",
          href: "README.ja.md",
          isCurrent: false,
        },
      ],
      { separator: " | ", currentLocaleLink: false }
    );
    const markdown = stringifyMarkdown({ type: "root", children: nodes });
    expect(markdown.trim()).toBe("**English** | [日本語](README.ja.md)");
  });

  it("links the current locale too when currentLocaleLink is true", () => {
    const nodes = renderSwitcherNodes(
      [{ locale: "en", label: "English", href: "README.md", isCurrent: true }],
      { separator: " | ", currentLocaleLink: true }
    );
    const markdown = stringifyMarkdown({ type: "root", children: nodes });
    expect(markdown.trim()).toBe("[English](README.md)");
  });
});

describe("ensureSwitcherMarker", () => {
  it("inserts a marker after the first heading when enabled and none exists", () => {
    const tree = parseMarkdown("# Title\n\nBody.\n");
    const withMarker = ensureSwitcherMarker(tree, {
      enabled: true,
      position: "after-heading",
    });
    const rendered = stringifyMarkdown(
      renderForLocale(withMarker, {
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
    expect(rendered.indexOf("SWITCHER")).toBeGreaterThan(
      rendered.indexOf("Title")
    );
    expect(rendered.indexOf("SWITCHER")).toBeLessThan(rendered.indexOf("Body"));
  });

  it("does nothing when disabled and no explicit marker exists", () => {
    const tree = parseMarkdown("# Title\n\nBody.\n");
    const result = ensureSwitcherMarker(tree, { enabled: false });
    expect(result).toBe(tree);
  });

  it("leaves an explicit marker's position untouched even when enabled is false", () => {
    const tree = parseMarkdown(
      "# Title\n\nBody.\n\n::kiritan{switcher}\n\nFooter.\n"
    );
    const result = ensureSwitcherMarker(tree, { enabled: false });
    const rendered = stringifyMarkdown(
      renderForLocale(result, {
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
    expect(rendered.indexOf("SWITCHER")).toBeGreaterThan(
      rendered.indexOf("Body")
    );
    expect(rendered.indexOf("SWITCHER")).toBeLessThan(
      rendered.indexOf("Footer")
    );
  });
});
