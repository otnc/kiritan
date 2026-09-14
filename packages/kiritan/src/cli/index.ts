import { defineCommand } from "citty";
import { resolveConfig } from "../config/index.js";
import { build } from "../pipeline/build.js";
import { check, resolveInterpolationVariableNames } from "../pipeline/check.js";
import { extract } from "../pipeline/extract.js";
import { init } from "../pipeline/init.js";
import { translate } from "../pipeline/translate.js";
import { typegen } from "../pipeline/typegen.js";

const configArgs = {
  mode: {
    type: "string",
    description: "Config mode layer to apply (<mode>.kiritanconfig)",
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
    description:
      "Check for missing/stale/machine-translated content (CI-friendly)",
  },
  args: {
    ...configArgs,
    json: {
      type: "boolean",
      description:
        "Print machine-readable JSON instead (for editor tooling) — includes interpolationVariableNames and delimiters alongside the usual issues/failed",
    },
  },
  async run({ args }) {
    const config = await resolveConfig({
      mode: args.mode,
      overlays: args.config ? [args.config] : undefined,
    });
    const result = await check(config);

    if (args.json) {
      console.log(
        JSON.stringify({
          ...result,
          interpolationVariableNames: resolveInterpolationVariableNames(config),
          delimiters: config.interpolation?.delimiters ?? ["%{", "}"],
        })
      );
      if (result.failed) process.exitCode = 1;
      return;
    }

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
    description: "Fill in missing/stale translations via translate.middlewares",
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

const initCommand = defineCommand({
  meta: {
    name: "init",
    description:
      "Scaffold .kiritanconfig, base/README.base.md, and a .gitignore entry for local.kiritanconfig",
  },
  args: {
    force: {
      type: "boolean",
      description: "Overwrite files that already exist",
    },
  },
  async run({ args }) {
    const result = await init({ force: args.force });
    for (const path of result.created) {
      console.log(`created ${path}`);
    }
    for (const path of result.skipped) {
      console.log(`skipped ${path} (already exists)`);
    }
  },
});

export const main = defineCommand({
  meta: {
    name: "kiritan",
    description:
      "In addition to standard scopes, an internationalization (i18n) utility for Markdown and other plain text documents",
  },
  subCommands: {
    init: initCommand,
    build: buildCommand,
    check: checkCommand,
    translate: translateCommand,
    extract: extractCommand,
    typegen: typegenCommand,
  },
});
