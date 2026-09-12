import { defineCommand } from "citty";
import { build } from "../pipeline/build.js";
import { resolveConfig } from "../config/index.js";

const buildCommand = defineCommand({
  meta: {
    name: "build",
    description: "Build localized documents from every configured source",
  },
  args: {
    mode: {
      type: "string",
      description: "Config mode layer to apply (.kiritan.<mode>.*)",
    },
    config: {
      type: "string",
      description: "Extra config file layered on top of the cascade",
    },
  },
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

export const main = defineCommand({
  meta: {
    name: "kiritan",
    description:
      "In addition to standard scopes, an internationalization (i18n) utility for Markdown and other plain text documents",
  },
  subCommands: {
    build: buildCommand,
  },
});
