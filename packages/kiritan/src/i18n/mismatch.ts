import type { ResourceModule } from "@kiritan/runtime";

export interface KeyMismatch {
  key: string;
  missingLocales: string[];
}

/** Which keys in `resource` are missing one or more of `locales` (docs/DESIGN.md 9.7章). */
export function findKeyMismatches(
  resource: ResourceModule,
  locales: string[]
): KeyMismatch[] {
  const mismatches: KeyMismatch[] = [];
  for (const [key, localeMap] of Object.entries(resource)) {
    const missingLocales = locales.filter((locale) => !(locale in localeMap));
    if (missingLocales.length > 0) {
      mismatches.push({ key, missingLocales });
    }
  }
  return mismatches;
}
