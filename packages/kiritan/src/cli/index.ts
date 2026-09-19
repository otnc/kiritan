import { createT, type T } from "@kiritan/runtime";
import yargs, { type Argv } from "yargs";
import { resolveConfig } from "../config/index.js";
import { build } from "../pipeline/build.js";
import { check, resolveInterpolationVariableNames } from "../pipeline/check.js";
import { extract } from "../pipeline/extract.js";
import { init } from "../pipeline/init.js";
import { translate } from "../pipeline/translate.js";
import { typegen } from "../pipeline/typegen.js";
import { verify } from "../pipeline/verify.js";
import messages from "./messages.i18n.js";
import { SUPPORTED_LANGUAGES, type CliLanguage } from "./locale.js";

export { resolveCliLanguage } from "./locale.js";
export type { CliLanguage } from "./locale.js";

interface ConfigArgs {
  mode?: string;
  config?: string;
}

async function resolveConfigFromArgs(args: ConfigArgs) {
  return resolveConfig({
    mode: args.mode,
    overlays: args.config ? [args.config] : undefined,
  });
}

type Translate = T<typeof messages>["t"];

/** Every command except `init` shares these two — layered onto a command's own options via `{ ...configOptions(t) }`. */
function configOptions(t: Translate) {
  return {
    mode: { type: "string", describe: t("option.mode") },
    config: { type: "string", describe: t("option.config") },
  } as const;
}

/** `build`/`check`/`translate`/`extract` share this; `typegen` doesn't, since it always aggregates every locale into one runtime module. */
function localeOption(t: Translate) {
  return {
    locale: { type: "string", describe: t("option.locale") },
  } as const;
}

export interface CreateCliOptions {
  /** Default: true. Set to false in tests so an error or --help doesn't call process.exit(). */
  exitProcess?: boolean;
}

/**
 * Builds the yargs CLI, already fully translated for `lang` — command/option descriptions have to be resolved strings by the time they reach `.command()`/`.options()`, so the display language must be known before this is called (see `resolveCliLanguage`). `yargs.locale(lang)` separately covers everything yargs renders on its own (USAGE/Options/Commands labels, "Missing required argument", "Unknown argument", etc.) via its own bundled locale files — this only has to supply the strings that are actually ours.
 */
export function createCli(
  lang: CliLanguage,
  options: CreateCliOptions = {}
): Argv {
  const { t } = createT(messages, { locale: lang, fallbackLocale: "en" });

  return yargs()
    .locale(lang)
    .scriptName("kiritan")
    .exitProcess(options.exitProcess ?? true)
    .option("lang", {
      type: "string",
      choices: SUPPORTED_LANGUAGES,
      describe: t("option.lang"),
    })
    .command(
      "init",
      t("command.init.describe"),
      (y) =>
        y.options({
          force: { type: "boolean", describe: t("option.force") },
        }),
      async (args) => {
        const result = await init({ force: args.force });
        for (const path of result.created) {
          console.log(t("output.init.created", { path }));
        }
        for (const path of result.skipped) {
          console.log(t("output.init.skipped", { path }));
        }
      }
    )
    .command(
      "build",
      t("command.build.describe"),
      (y) => y.options({ ...configOptions(t), ...localeOption(t) }),
      async (args) => {
        const config = await resolveConfigFromArgs(args);
        const result = await build(config, { locale: args.locale });
        for (const path of result.written) {
          console.log(t("output.wrote", { path }));
        }
      }
    )
    .command(
      "check",
      t("command.check.describe"),
      (y) =>
        y.options({
          ...configOptions(t),
          ...localeOption(t),
          json: { type: "boolean", describe: t("option.json") },
        }),
      async (args) => {
        const config = await resolveConfigFromArgs(args);
        const result = await check(config, { locale: args.locale });

        if (args.json) {
          console.log(
            JSON.stringify({
              ...result,
              interpolationVariableNames:
                resolveInterpolationVariableNames(config),
              delimiters: config.interpolation?.delimiters ?? ["%{", "}"],
            })
          );
          if (result.failed) process.exitCode = 1;
          return;
        }

        for (const issue of result.issues) {
          console.log(
            t("output.check.issue", {
              kind: issue.kind,
              source: issue.source,
              locale: issue.locale,
              detail: issue.detail,
            })
          );
        }
        if (result.issues.length === 0) {
          console.log(t("output.check.noIssues"));
        }
        if (result.failed) {
          process.exitCode = 1;
        }
      }
    )
    .command(
      "verify",
      t("command.verify.describe"),
      (y) =>
        y.options({
          ...configOptions(t),
          ...localeOption(t),
          json: { type: "boolean", describe: t("option.json") },
        }),
      async (args) => {
        const config = await resolveConfigFromArgs(args);
        const result = await verify(config, { locale: args.locale });

        if (args.json) {
          console.log(JSON.stringify(result));
          if (result.failed) process.exitCode = 1;
          return;
        }

        for (const entry of result.entries) {
          if (entry.status === "ok") continue;
          console.log(
            t("output.verify.entry", {
              status: entry.status,
              path: entry.path,
              locale: entry.locale,
              source: entry.source,
              expected: entry.expectedHash,
              actual: entry.actualHash ?? "-",
            })
          );
        }
        if (result.failed) {
          process.exitCode = 1;
        } else {
          console.log(
            t("output.verify.allOk", { count: result.entries.length })
          );
        }
      }
    )
    .command(
      "translate",
      t("command.translate.describe"),
      (y) => y.options({ ...configOptions(t), ...localeOption(t) }),
      async (args) => {
        const config = await resolveConfigFromArgs(args);
        const result = await translate(config, { locale: args.locale });
        for (const entry of result.translated) {
          console.log(
            t("output.translate.entry", {
              locale: entry.locale,
              source: entry.source,
              detail: entry.detail,
            })
          );
        }
        if (result.autoDisabled.length > 0) {
          console.log(
            t("output.translate.autoOff", { count: result.autoDisabled.length })
          );
        }
        if (result.translated.length === 0) {
          console.log(t("output.translate.none"));
        }
      }
    )
    .command(
      "extract",
      t("command.extract.describe"),
      (y) => y.options({ ...configOptions(t), ...localeOption(t) }),
      async (args) => {
        const config = await resolveConfigFromArgs(args);
        const result = await extract(config, { locale: args.locale });
        for (const change of result.changes) {
          console.log(
            t("output.extract.entry", {
              locale: change.locale,
              source: change.source,
              detail: change.detail,
            })
          );
        }
        if (result.changes.length === 0) {
          console.log(t("output.extract.none"));
        }
      }
    )
    .command(
      "typegen",
      t("command.typegen.describe"),
      (y) => y.options(configOptions(t)),
      async (args) => {
        const config = await resolveConfigFromArgs(args);
        const result = await typegen(config);
        console.log(
          t("output.typegen.wrote", {
            dataPath: result.dataPath,
            typesPath: result.typesPath,
            keyCount: result.keyCount,
          })
        );
      }
    )
    .demandCommand(1)
    .strict()
    .help();
}
