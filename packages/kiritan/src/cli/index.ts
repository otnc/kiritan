import { defineCommand } from "citty";
import { resolveConfig } from "../config/index.js";
import { build } from "../pipeline/build.js";
import { check } from "../pipeline/check.js";

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

export const main = defineCommand({
  meta: {
    name: "kiritan",
    description:
      "In addition to standard scopes, an internationalization (i18n) utility for Markdown and other plain text documents",
  },
  subCommands: {
    build: buildCommand,
    check: checkCommand,
  },
});
