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

const CONFIG_EXTENSIONS = ["mjs", "cjs", "js", "mts", "cts", "ts"] as const;

function candidateFiles(cwd: string, baseName: string): string[] {
  return CONFIG_EXTENSIONS.map((ext) => join(cwd, `${baseName}.${ext}`));
}

function firstExisting(paths: string[]): string | undefined {
  return paths.find((path) => existsSync(path));
}

/**
 * Resolves the `.kiritan.*` cascade for `cwd`/`mode`, lowest priority first: base (or plain `.kiritan.*`), then `.kiritan.<mode>.*` if present, then `.kiritan.local.*`.
 */
export function resolveCascadePaths(cwd: string, mode?: string): string[] {
  const paths: string[] = [];

  const baseFile = firstExisting([
    ...candidateFiles(cwd, ".kiritan.base"),
    ...candidateFiles(cwd, ".kiritan"),
  ]);
  if (baseFile) paths.push(baseFile);

  if (mode) {
    const modeFile = firstExisting(candidateFiles(cwd, `.kiritan.${mode}`));
    if (modeFile) paths.push(modeFile);
  }

  const localFile = firstExisting(candidateFiles(cwd, ".kiritan.local"));
  if (localFile) paths.push(localFile);

  return paths;
}

const jiti = createJiti(import.meta.url);

/** Loads one `.kiritan.*` file's default export (what `defineConfig(...)` returns). */
export async function loadConfigFile(path: string): Promise<KiritanUserConfig> {
  const mod = await jiti.import(path, { default: true });
  return mod as KiritanUserConfig;
}

function resolveNaming(naming: NamingConfig | undefined): NamingConfig {
  // `template` wins if set explicitly; otherwise a `preset` picks one of the 3.3章 shorthands; only then do we fall back to the plain default.
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

/** Fills in the documented defaults (docs/DESIGN.md 3.2/8/9章) for whatever a layer left unset. */
export function applyDefaults(config: KiritanUserConfig): KiritanConfig {
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
 * Discovers and merges the `.kiritan.*` cascade for `cwd`/`mode`, applies any
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
