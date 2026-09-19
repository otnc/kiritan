import { describe, expect, it } from "vitest";
import type { KiritanConfig, Renderer, SourceConfig } from "../config/types.js";
import { markdownRenderer, resolveRenderer } from "./index.js";

const config = (renderers?: Record<string, Renderer>): KiritanConfig => ({
  locales: { default: "en", list: ["en", "ja"] },
  sources: [],
  plugins: renderers ? { renderers } : undefined,
});

const source = (overrides: Partial<SourceConfig> = {}): SourceConfig => ({
  glob: "**/*",
  strategy: "sidecar",
  ...overrides,
});

const customRenderer = (overrides: Partial<Renderer> = {}): Renderer => ({
  id: "custom",
  extensions: [".rst"],
  strategies: ["sidecar"],
  parse: () => ({ type: "root", children: [] }),
  stringify: () => "",
  ...overrides,
});

describe("resolveRenderer", () => {
  it("falls back to markdown for an unfamiliar extension", () => {
    expect(resolveRenderer(config(), source(), "docs/a.unknown")).toBe(
      markdownRenderer
    );
  });

  it("matches a built-in by extension, case-insensitively", () => {
    expect(resolveRenderer(config(), source(), "docs/A.MD")).toBe(
      markdownRenderer
    );
  });

  it("picks a plugin renderer by extension", () => {
    const custom = customRenderer();
    expect(resolveRenderer(config({ custom }), source(), "docs/a.rst")).toBe(
      custom
    );
  });

  it("lets a plugin renderer beat a built-in on the same extension", () => {
    const custom = customRenderer({ extensions: [".md"] });
    expect(resolveRenderer(config({ custom }), source(), "docs/a.md")).toBe(
      custom
    );
  });

  it("uses an explicit renderer id over the extension", () => {
    const custom = customRenderer();
    expect(
      resolveRenderer(
        config({ custom }),
        source({ renderer: "custom" }),
        "docs/a.md"
      )
    ).toBe(custom);
  });

  it("throws for an explicit renderer id that isn't registered", () => {
    expect(() =>
      resolveRenderer(config(), source({ renderer: "nope" }), "a.md")
    ).toThrow(/renderer "nope".*isn't registered/);
  });

  it("rejects a built-in strategy the renderer doesn't support", () => {
    const custom = customRenderer();
    expect(() =>
      resolveRenderer(
        config({ custom }),
        source({ strategy: "inline" }),
        "docs/a.rst"
      )
    ).toThrow(/"custom" renderer doesn't support the "inline" strategy/);
  });

  it("doesn't check a custom plugin store strategy against the renderer", () => {
    const custom = customRenderer();
    expect(
      resolveRenderer(
        config({ custom }),
        source({ strategy: "my-store" }),
        "docs/a.rst"
      )
    ).toBe(custom);
  });
});
