import { interpolate, type InterpolationParams } from "./interpolate.js";

/** A single translatable value, keyed by locale (e.g. `{ en: "Submit", ja: "送信" }`). */
export type LocaleMap = Record<string, string>;

/**
 * The shape every resource format (colocated/split/centralized/embedded, see docs/DESIGN.md 9章) is normalized to before reaching `createT`.
 */
export type ResourceModule = Record<string, LocaleMap>;

export interface CreateTOptions {
  locale?: string;
  fallbackLocale?: string;
}

export interface T<R extends ResourceModule> {
  t<K extends keyof R & string>(key: K, params?: InterpolationParams): string;
  readonly locale: string;
  setLocale(locale: string): void;
}

function firstLocale(resources: ResourceModule): string | undefined {
  for (const localeMap of Object.values(resources)) {
    const [locale] = Object.keys(localeMap);
    if (locale) return locale;
  }
  return undefined;
}

/**
 * Creates a minimal `t(key, params)` runtime out of a `ResourceModule`. Key completion/typo-checking comes for free from TypeScript inferring `R` from a plain resource object/module (docs/DESIGN.md 9.2章) — no codegen step is needed for direct usage.
 */
export function createT<R extends ResourceModule>(
  resources: R,
  options: CreateTOptions = {}
): T<R> {
  let locale =
    options.locale ?? options.fallbackLocale ?? firstLocale(resources) ?? "en";

  function resolve(key: string): string | undefined {
    const localeMap = resources[key];
    if (!localeMap) return undefined;
    return (
      localeMap[locale] ??
      (options.fallbackLocale ? localeMap[options.fallbackLocale] : undefined)
    );
  }

  function t<K extends keyof R & string>(
    key: K,
    params?: InterpolationParams
  ): string {
    const template = resolve(key) ?? key;
    return interpolate(template, params, { onMissing: "keep" });
  }

  return {
    t,
    get locale() {
      return locale;
    },
    setLocale(next: string) {
      locale = next;
    },
  };
}
