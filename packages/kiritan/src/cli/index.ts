import { defineCommand } from "citty";
import { resolveConfig } from "../config/index.js";
import { build } from "../pipeline/build.js";
import { check } from "../pipeline/check.js";
import { extract } from "../pipeline/extract.js";
import { translate } from "../pipeline/translate.js";
import { typegen } from "../pipeline/typegen.js";

const configArgs = {
  mode: {
    type: "string",
    description: "Config mode layer to apply (.kiritan.<mode>.*)",
  },
  config: {
    type: "string",
    description: "Extra config file layered on top of the cascade",
  },
} as const;

const buildCommand = defineCommand({
  meta: {
    name: "build",
    description: "Build localized documents from every configured source",
  },
  args: configArgs,
  async run({ args }) {
    const config = await resolveConfig({
      mode: args.mode,
      overlays: args.config ? [args.config] : undefined,
    });
    const result = await build(config);
    for (const path of result.written) {
      console.log(`wrote ${path}`);
    }
  },
});

const checkCommand = defineCommand({
  meta: {
    name: "check",
    description: "Check for missing/machine-translated content (CI-friendly)",
  },
  args: configArgs,
  async run({ args }) {
    const config = await resolveConfig({
      mode: args.mode,
      overlays: args.config ? [args.config] : undefined,
    });
    const result = await check(config);
    for (const issue of result.issues) {
      console.log(
        `[${issue.kind}] ${issue.source} (${issue.locale}): ${issue.detail}`
      );
    }
    if (result.issues.length === 0) {
      console.log("kiritan check: no issues found");
    }
    if (result.failed) {
      process.exitCode = 1;
    }
  },
});

const translateCommand = defineCommand({
  meta: {
    name: "translate",
    description: "Fill in missing translations via translate.middlewares",
  },
  args: configArgs,
  async run({ args }) {
    const config = await resolveConfig({
      mode: args.mode,
      overlays: args.config ? [args.config] : undefined,
    });
    const result = await translate(config);
    for (const entry of result.translated) {
      console.log(`[${entry.locale}] ${entry.source}: ${entry.detail}`);
    }
    if (result.translated.length === 0) {
      console.log("kiritan translate: nothing to do");
    }
  },
});

const extractCommand = defineCommand({
  meta: {
    name: "extract",
    description: "Scaffold catalog files with any new ids from the base file",
  },
  args: configArgs,
  async run({ args }) {
    const config = await resolveConfig({
      mode: args.mode,
      overlays: args.config ? [args.config] : undefined,
    });
    const result = await extract(config);
    for (const change of result.changes) {
      console.log(`[${change.locale}] ${change.source}: ${change.detail}`);
    }
    if (result.changes.length === 0) {
      console.log("kiritan extract: nothing to do");
    }
  },
});

const typegenCommand = defineCommand({
  meta: {
    name: "typegen",
    description: "Generate types for an aggregated runtime.sources t() call",
  },
  args: configArgs,
  async run({ args }) {
    const config = await resolveConfig({
      mode: args.mode,
      overlays: args.config ? [args.config] : undefined,
    });
    const result = await typegen(config);
    console.log(
      `wrote ${result.dataPath} and ${result.typesPath} (${result.keyCount} keys)`
    );
  },
});

export const main = defineCommand({
  meta: {
    name: "kiritan",
    description:
      "In addition to standard scopes, an internationalization (i18n) utility for Markdown and other plain text documents",
  },
  subCommands: {
    build: buildCommand,
    check: checkCommand,
    translate: translateCommand,
    extract: extractCommand,
    typegen: typegenCommand,
  },
});
