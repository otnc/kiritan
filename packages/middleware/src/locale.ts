export interface ParsedLocale {
  /** The language subtag, lower-case and canonical: `ja`, `he` (for the legacy `iw`), `nb`. */
  language: string;
  /** Title-case script subtag if one was written: `Hans`, `Hant`. */
  script?: string;
  /** Upper-case region subtag if one was written: `US`, `TW`. */
  region?: string;
}

/**
 * Splits a Kiritan locale (any BCP 47 tag: `ja`, `en-US`, `zh-Hant-TW`, `pt_BR`) into its parts using the platform's own `Intl.Locale`, so every provider maps codes from the same parsed pieces instead of each slicing strings by hand. A tag `Intl` rejects still yields its first subtag.
 */
export function parseLocale(locale: string): ParsedLocale {
  try {
    const parsed = new Intl.Locale(locale.replace(/_/g, "-"));
    return {
      language: parsed.language,
      script: parsed.script,
      region: parsed.region,
    };
  } catch {
    return { language: locale.toLowerCase().split(/[^a-z0-9]/)[0] };
  }
}

/**
 * Which Chinese script a locale means: an explicit script wins, otherwise the region decides (Taiwan, Hong Kong and Macao are Traditional), otherwise Simplified. `undefined` for a locale that isn't Chinese.
 */
export function chineseScript(locale: string): "Hans" | "Hant" | undefined {
  const { language, script, region } = parseLocale(locale);
  if (language !== "zh") return undefined;
  if (script) return script === "Hant" ? "Hant" : "Hans";
  return region && ["TW", "HK", "MO"].includes(region) ? "Hant" : "Hans";
}
