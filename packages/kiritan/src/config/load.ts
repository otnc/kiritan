import { existsSync } from "node:fs";
import { join } from "node:path";
import { createJiti } from "jiti";
import {
  DEFAULT_CHECK,
  DEFAULT_INTERPOLATION,
  DEFAULT_NAMING,
  DEFAULT_SWITCHER,
  DEFAULT_TRANSLATE,
  NAMING_PRESETS,
} from "./defaults.js";
import { mergeConfigs } from "./merge.js";
import type {
  KiritanConfig,
  KiritanUserConfig,
  NamingConfig,
} from "./types.js";

/** Every `*.kiritanconfig` cascade file loads through this, regardless of what's inside — Node itself refuses to `import()` a file whose trailing extension it doesn't recognize, and `kiritanconfig` isn't one. */
const jiti = createJiti(import.meta.url, {
  extensions: [
    ".js",
    ".mjs",
    ".cjs",
    ".ts",
    ".mts",
    ".cts",
    ".jsx",
    ".tsx",
    ".kiritanconfig",
  ],
});

function exists(path: string): string | undefined {
  return existsSync(path) ? path : undefined;
}

/**
 * Resolves the `*.kiritanconfig` cascade for `cwd`/`mode`, lowest priority first: `.kiritanconfig` (base), then `<mode>.kiritanconfig` if present, then `local.kiritanconfig`.
 */
export function resolveCascadePaths(cwd: string, mode?: string): string[] {
  const paths: string[] = [];

  const baseFile = exists(join(cwd, ".kiritanconfig"));
  if (baseFile) paths.push(baseFile);

  if (mode) {
    const modeFile = exists(join(cwd, `${mode}.kiritanconfig`));
    if (modeFile) paths.push(modeFile);
  }

  const localFile = exists(join(cwd, "local.kiritanconfig"));
  if (localFile) paths.push(localFile);

  return paths;
}

/** Loads one `*.kiritanconfig` file's default export (what `defineConfig(...)` returns). */
export async function loadConfigFile(path: string): Promise<KiritanUserConfig> {
  const mod = await jiti.import(path, { default: true });
  return mod as KiritanUserConfig;
}

function resolveNaming(naming: NamingConfig | undefined): NamingConfig {
  // `template` wins if set explicitly; otherwise a `preset` picks one of the chapter 3.3 shorthands; only then do we fall back to the plain default.
  const template =
    naming?.template ??
    (naming?.preset ? NAMING_PRESETS[naming.preset] : DEFAULT_NAMING.template);
  return {
    ...naming,
    template,
    omitDefaultLocaleSuffix:
      naming?.omitDefaultLocaleSuffix ?? DEFAULT_NAMING.omitDefaultLocaleSuffix,
    baseSuffix: naming?.baseSuffix ?? DEFAULT_NAMING.baseSuffix,
  };
}

/** Fills in the documented defaults (docs/DESIGN.md chapters 3.2/8/9) for whatever a layer left unset. */
export function applyDefaults(config: KiritanUserConfig): KiritanConfig {
  if (!config.locales || !config.sources) {
    throw new Error(
      'kiritan: no config found (or it\'s missing "locales"/"sources") — create a .kiritanconfig exporting defineConfig({ locales, sources, ... }). See docs/DESIGN.md chapter 3.'
    );
  }
  return {
    ...config,
    naming: resolveNaming(config.naming),
    interpolation: { ...DEFAULT_INTERPOLATION, ...config.interpolation },
    translate: { ...DEFAULT_TRANSLATE, ...config.translate },
    check: { ...DEFAULT_CHECK, ...config.check },
    switcher: { ...DEFAULT_SWITCHER, ...config.switcher },
  };
}

export interface ResolveConfigOptions {
  cwd?: string;
  mode?: string;
  /** Extra files layered on top, in order (from `--config`/`--overlay`). */
  overlays?: string[];
}

/**
 * Discovers and merges the `*.kiritanconfig` cascade for `cwd`/`mode`, applies any
 * `--config`/`--overlay` files on top, then fills in defaults.
 */
export async function resolveConfig(
  options: ResolveConfigOptions = {}
): Promise<KiritanConfig> {
  const cwd = options.cwd ?? process.cwd();
  const paths = [
    ...resolveCascadePaths(cwd, options.mode),
    ...(options.overlays ?? []),
  ];
  const layers = await Promise.all(paths.map(loadConfigFile));
  const merged = mergeConfigs<KiritanUserConfig>(
    ...layers
  ) as KiritanUserConfig;
  return applyDefaults(merged);
}
