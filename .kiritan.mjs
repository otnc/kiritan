export default {
  locales: { default: "en", list: ["en", "ja"] },
  sources: [
    { glob: "README.base.md", strategy: "inline" },
    { glob: "CONTRIBUTING.base.md", strategy: "inline" },
  ],
};
