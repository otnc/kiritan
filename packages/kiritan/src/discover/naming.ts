import { basename, dirname, extname } from "node:path";
import { DEFAULT_NAMING, NAMING_PRESETS } from "../config/defaults.js";
import type { NamingConfig } from "../config/types.js";

export interface ResolvedBase {
  dir: string;
  base: string;
  ext: string;
}

/** Splits `docs/README.base.md` into `{ dir: "docs", base: "README", ext: "md" }`. */
export function resolveBase(
  sourcePath: string,
  baseSuffix: string
): ResolvedBase {
  const dir = dirname(sourcePath);
  const ext = extname(sourcePath).slice(1);
  let base = basename(sourcePath, extname(sourcePath));
  if (base.endsWith(baseSuffix)) {
    base = base.slice(0, -baseSuffix.length);
  }
  return { dir, base, ext };
}

export interface NamingResolution {
  template: string;
  defaultTemplate?: string;
  omitDefaultLocaleSuffix: boolean;
  outputs?: Record<string, string>;
}

/** Resolves `preset`/`template` (docs/DESIGN.md chapter 3.3) into the final options used by `resolveOutputPath`. */
export function resolveNamingOptions(
  naming: NamingConfig | undefined
): NamingResolution {
  const template =
    naming?.template ??
    (naming?.preset ? NAMING_PRESETS[naming.preset] : DEFAULT_NAMING.template);
  return {
    template,
    defaultTemplate: naming?.defaultTemplate,
    omitDefaultLocaleSuffix:
      naming?.omitDefaultLocaleSuffix ?? DEFAULT_NAMING.omitDefaultLocaleSuffix,
    outputs: naming?.outputs,
  };
}

function applyTemplate(
  template: string,
  tokens: Record<string, string>
): string {
  return template.replace(
    /\{(\w+)\}/g,
    (match, key: string) => tokens[key] ?? match
  );
}

// A filename-joining separator (".", "-", "_") right before `{locale}` is "owned" by it (e.g. "base.{locale}") and safe to remove together with it.
// A "/" right before it is a structural path separator (e.g. "{dir}/{locale}.base") that must stay, so we fall back to stripping the token's trailing separator instead — which also covers the "folder" preset's "{locale}/".
const FILENAME_SEPARATOR = "[.\\-_]";
const BEFORE_LOCALE = new RegExp(`${FILENAME_SEPARATOR}\\{locale\\}`);
const AFTER_LOCALE = new RegExp(`\\{locale\\}(?:${FILENAME_SEPARATOR}|/)`);

/** Best-effort removal of the `{locale}` token (and its adjoining separator) for the default locale. */
function stripLocaleToken(template: string): string {
  if (BEFORE_LOCALE.test(template)) return template.replace(BEFORE_LOCALE, "");
  if (AFTER_LOCALE.test(template)) return template.replace(AFTER_LOCALE, "");
  return template.replace(/\{locale\}/, "");
}

/** Computes the output path (relative to cwd) for one locale of one source file. */
export function resolveOutputPath(
  resolvedBase: ResolvedBase,
  locale: string,
  defaultLocale: string,
  naming: NamingResolution
): string {
  if (naming.outputs?.[locale]) {
    return naming.outputs[locale];
  }

  let template = naming.template;
  if (locale === defaultLocale) {
    if (naming.defaultTemplate) {
      template = naming.defaultTemplate;
    } else if (naming.omitDefaultLocaleSuffix) {
      template = stripLocaleToken(template);
    }
  }

  const dir = resolvedBase.dir === "" ? "." : resolvedBase.dir;
  const path = applyTemplate(template, {
    dir,
    base: resolvedBase.base,
    ext: resolvedBase.ext,
    locale,
  });
  return path.replace(/^\.\//, "");
}
