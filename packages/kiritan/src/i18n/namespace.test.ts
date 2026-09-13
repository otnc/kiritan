import { describe, expect, it } from "vitest";
import type { ResourceSourceConfig } from "../config/types.js";
import type { AggregatedResource } from "./aggregate.js";
import { deriveNamespace, resolveNamespace } from "./namespace.js";

describe("deriveNamespace", () => {
  it("uses the directory path with a leading src/ stripped", () => {
    expect(deriveNamespace("src/components/Button/Button.i18n.ts")).toBe(
      "components/Button"
    );
  });

  it("falls back to the basename (without .i18n/extension) when there's no other directory", () => {
    expect(deriveNamespace("common.i18n.ts")).toBe("common");
    expect(deriveNamespace("src/common.i18n.ts")).toBe("common");
  });

  it("strips a plain extension when there's no .i18n suffix", () => {
    expect(deriveNamespace("locales/common.json")).toBe("locales");
    expect(deriveNamespace("common.json")).toBe("common");
  });
});

describe("resolveNamespace", () => {
  const source: ResourceSourceConfig = {
    glob: "src/**/*.i18n.ts",
    strategy: "colocated",
  };

  function entry(
    key: string,
    overrides: Partial<ResourceSourceConfig> = {}
  ): AggregatedResource {
    return {
      key,
      resource: {},
      files: [key],
      source: { ...source, ...overrides },
    };
  }

  it("derives the namespace by default", () => {
    expect(
      resolveNamespace(entry("src/components/Button/Button.i18n.ts"))
    ).toBe("components/Button");
  });

  it("uses the source's custom namespace function when set", () => {
    const namespace = (filePath: string): string => `custom:${filePath}`;
    expect(
      resolveNamespace(
        entry("src/components/Button/Button.i18n.ts", { namespace })
      )
    ).toBe("custom:src/components/Button/Button.i18n.ts");
  });
});
