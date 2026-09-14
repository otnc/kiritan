import type { KiritanConfig } from "./types.js";

/**
 * Resolves the locales a command should act on: every configured locale, or just the one requested via `--locale` (docs/DESIGN.md chapter 10).
 * `build`/`check`/`translate`/`extract` all loop over this instead of `config.locales.list` directly. `kiritan typegen` doesn't use this — it always aggregates every locale into one runtime module, so there's no meaningful way to restrict it to one.
 */
export function resolveTargetLocales(
  config: KiritanConfig,
  locale: string | undefined
): string[] {
  if (!locale) return config.locales.list;
  if (!config.locales.list.includes(locale)) {
    throw new Error(
      `kiritan: locale "${locale}" is not in locales.list (${config.locales.list.join(", ")})`
    );
  }
  return [locale];
}
