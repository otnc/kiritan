import { createT, type T } from "@kiritan/runtime";
import {
  defineCommand,
  runCommand,
  showUsage,
  type ArgsDef,
  type CommandDef,
} from "citty";
import packageJson from "../../package.json" with { type: "json" };
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

/** Accepted both before and after the command name (`kiritan --lang ja build` / `kiritan build --lang ja`), so every command declares it too. */
function langOption(t: Translate) {
  return {
    lang: {
      type: "enum",
      options: [...SUPPORTED_LANGUAGES],
      description: t("option.lang"),
    },
  } satisfies ArgsDef;
}

/** Every command except `init` shares these two. */
function configOptions(t: Translate) {
  return {
    mode: { type: "string", description: t("option.mode") },
    config: { type: "string", description: t("option.config") },
  } satisfies ArgsDef;
}

/** `build`/`check`/`translate`/`extract` share this; `typegen` doesn't, since it always aggregates every locale into one runtime module. */
function localeOption(t: Translate) {
  return {
    locale: { type: "string", description: t("option.locale") },
  } satisfies ArgsDef;
}

function jsonOption(t: Translate) {
  return {
    json: { type: "boolean", description: t("option.json") },
  } satisfies ArgsDef;
}

class UsageError extends Error {}

/** The first argument `argsDef` doesn't declare, if any. citty itself accepts anything, so a typo like `--locle ja` would otherwise be silently ignored. No command takes a positional or a short flag, so either one is unknown too. */
function findUnknownArgument(
  rawArgs: string[],
  argsDef: ArgsDef
): string | undefined {
  for (let index = 0; index < rawArgs.length; index++) {
    const token = rawArgs[index]!;
    if (!token.startsWith("--")) return token;
    const [name = "", inlineValue] = token.slice(2).split(/=(.*)/s);
    const negated = name.startsWith("no-") ? argsDef[name.slice(3)] : undefined;
    const def = Object.hasOwn(argsDef, name)
      ? argsDef[name]
      : negated?.type === "boolean"
        ? negated
        : undefined;
    if (!def) return token;
    if (def.type !== "boolean" && inlineValue === undefined) index++;
  }
  return undefined;
}

/** `defineCommand`, plus a `setup` that rejects arguments the command doesn't declare. */
function defineStrictCommand<const A extends ArgsDef>(
  def: CommandDef<A> & { args: A }
): CommandDef<A> {
  return defineCommand({
    ...def,
    setup({ rawArgs }) {
      const unknown = findUnknownArgument(rawArgs, def.args);
      if (unknown !== undefined) {
        throw new UsageError(`Unknown argument: ${unknown}`);
      }
    },
  });
}

function createCommands(t: Translate) {
  return {
    init: defineStrictCommand({
      meta: { name: "init", description: t("command.init.describe") },
      args: {
        ...langOption(t),
        force: { type: "boolean", description: t("option.force") },
      },
      async run({ args }) {
        const result = await init({ force: args.force });
        for (const path of result.created) {
          console.log(t("output.init.created", { path }));
        }
        for (const path of result.skipped) {
          console.log(t("output.init.skipped", { path }));
        }
      },
    }),
    build: defineStrictCommand({
      meta: { name: "build", description: t("command.build.describe") },
      args: { ...langOption(t), ...configOptions(t), ...localeOption(t) },
      async run({ args }) {
        const config = await resolveConfigFromArgs(args);
        const result = await build(config, { locale: args.locale });
        for (const path of result.written) {
          console.log(t("output.wrote", { path }));
        }
      },
    }),
    check: defineStrictCommand({
      meta: { name: "check", description: t("command.check.describe") },
      args: {
        ...langOption(t),
        ...configOptions(t),
        ...localeOption(t),
        ...jsonOption(t),
      },
      async run({ args }) {
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
      },
    }),
    verify: defineStrictCommand({
      meta: { name: "verify", description: t("command.verify.describe") },
      args: {
        ...langOption(t),
        ...configOptions(t),
        ...localeOption(t),
        ...jsonOption(t),
      },
      async run({ args }) {
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
      },
    }),
    translate: defineStrictCommand({
      meta: { name: "translate", description: t("command.translate.describe") },
      args: { ...langOption(t), ...configOptions(t), ...localeOption(t) },
      async run({ args }) {
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
      },
    }),
    extract: defineStrictCommand({
      meta: { name: "extract", description: t("command.extract.describe") },
      args: { ...langOption(t), ...configOptions(t), ...localeOption(t) },
      async run({ args }) {
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
      },
    }),
    typegen: defineStrictCommand({
      meta: { name: "typegen", description: t("command.typegen.describe") },
      args: { ...langOption(t), ...configOptions(t) },
      async run({ args }) {
        const config = await resolveConfigFromArgs(args);
        const result = await typegen(config);
        console.log(
          t("output.typegen.wrote", {
            dataPath: result.dataPath,
            typesPath: result.typesPath,
            keyCount: result.keyCount,
          })
        );
      },
    }),
  };
}

export interface Cli {
  /** Runs one invocation. A usage error prints the relevant `--help` plus the message to stderr and sets `process.exitCode` to 1; any other error is rethrown. */
  run(rawArgs: string[]): Promise<void>;
}

/**
 * Builds the CLI for `lang`. The descriptions and output lines come from messages.i18n.ts, so `lang` has to be known before this is called (see `resolveCliLanguage`). citty's own help labels (`USAGE`, `OPTIONS`, ...) and argument errors stay in English.
 */
export function createCli(lang: CliLanguage): Cli {
  const { t } = createT(messages, { locale: lang, fallbackLocale: "en" });
  const subCommands = createCommands(t);
  const main = defineCommand({
    meta: {
      name: "kiritan",
      version: packageJson.version,
      description: t("description"),
    },
    args: langOption(t),
    subCommands,
  });

  /** Prints the `--help` of the first argument naming a command, else of the top level. */
  async function showHelp(rawArgs: string[]) {
    const name = rawArgs.find((arg): arg is keyof typeof subCommands =>
      Object.hasOwn(subCommands, arg)
    );
    // A command's usage only reads its parent's meta (for "kiritan build" and the version).
    if (name)
      await showUsage(subCommands[name] as CommandDef, { meta: main.meta });
    else await showUsage(main);
  }

  return {
    async run(rawArgs) {
      if (rawArgs.includes("--help") || rawArgs.includes("-h")) {
        await showHelp(rawArgs);
        return;
      }
      if (rawArgs.length === 1 && rawArgs[0] === "--version") {
        console.log(packageJson.version);
        return;
      }
      try {
        await runCommand(main, { rawArgs });
      } catch (error) {
        // citty doesn't export its CLIError class, only names it.
        const isUsageError =
          error instanceof UsageError ||
          (error instanceof Error && error.name === "CLIError");
        if (!isUsageError) throw error;
        await showHelp(rawArgs);
        console.error(error.message);
        process.exitCode = 1;
      }
    },
  };
}
