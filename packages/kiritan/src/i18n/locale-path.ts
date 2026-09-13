export interface LocalePathSplit {
  locale: string;
  /** `path` with the locale segment (and one adjoining `/` or `.`) removed — shared by every locale's sibling file. */
  groupKey: string;
}

/**
 * Finds a `/`- or `.`-delimited segment of `path` that matches one of `locales`, e.g. the "en" in `Button.en.i18n.ts` (`split`) or `locales/en/common.json` (`centralized`).
 * Returns `undefined` if no segment matches.
 */
export function splitLocaleFromPath(
  path: string,
  locales: string[]
): LocalePathSplit | undefined {
  const parts = path.split(/([/.])/);

  for (let i = 0; i < parts.length; i += 2) {
    const locale = parts[i];
    if (!locale || !locales.includes(locale)) continue;

    const rest = [...parts];
    if (i + 1 < rest.length) {
      rest.splice(i, 2);
    } else if (i - 1 >= 0) {
      rest.splice(i - 1, 2);
    } else {
      rest.splice(i, 1);
    }
    return { locale, groupKey: rest.join("") };
  }

  return undefined;
}
