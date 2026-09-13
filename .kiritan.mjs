export default {
  locales: { default: "en", list: ["en", "ja"] },
  // Outputs land at the repo root (README.md, CONTRIBUTING.md, ...) regardless of where the base file lives, since the template has no {dir} token.
  naming: { template: "{base}.{locale}.{ext}" },
  sources: [
    { glob: "base/README.base.md", strategy: "inline" },
    { glob: "base/CONTRIBUTING.base.md", strategy: "inline" },
    {
      glob: "base/DESIGN.base.md",
      strategy: "inline",
      naming: { template: "docs/{base}.{locale}.{ext}" },
    },
    {
      glob: "packages/kiritan/base/README.base.md",
      strategy: "inline",
      naming: { template: "packages/kiritan/{base}.{locale}.{ext}" },
    },
    {
      glob: "packages/runtime/base/README.base.md",
      strategy: "inline",
      naming: { template: "packages/runtime/{base}.{locale}.{ext}" },
    },
  ],
};
