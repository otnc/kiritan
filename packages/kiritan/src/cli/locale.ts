const SUPPORTED_LANGUAGES = ["en", "ja"] as const;

export type CliLanguage = (typeof SUPPORTED_LANGUAGES)[number];

function normalize(candidate: string | undefined): CliLanguage | undefined {
  if (!candidate) return undefined;
  const tag = candidate.split(/[_.]/)[0]?.toLowerCase();
  return SUPPORTED_LANGUAGES.find((language) => language === tag);
}

/** The raw `--lang`/`--lang=<value>` value from argv, or `undefined` if the flag wasn't passed at all — distinct from an unsupported value, which still returns that raw string here so the caller can tell "not given" apart from "given, but not en/ja". */
function explicitLangArg(argv: string[]): string | undefined {
  const index = argv.indexOf("--lang");
  if (index !== -1) return argv[index + 1];
  const inline = argv.find((arg) => arg.startsWith("--lang="));
  return inline?.slice("--lang=".length);
}

/**
 * Picks the CLI's own display language (as opposed to `--locale`, which picks which *document* locale a build/check/translate/extract run acts on): an explicit `--lang`, then the usual POSIX locale env vars, then "en". Read directly from argv/env rather than through the arg parser itself, since the language has to be known *before* yargs builds its command tree — the descriptions passed into it are already-resolved translated strings, not lazy callbacks.
 * An explicit but unsupported `--lang` (e.g. `--lang fr`) falls through to "en" here rather than to the env vars, so the command tree is at least buildable — yargs's own `choices` validation on the `--lang` option is what actually reports the bad value back to the user.
 */
export function resolveCliLanguage(
  argv: string[],
  env: NodeJS.ProcessEnv
): CliLanguage {
  const explicit = explicitLangArg(argv);
  if (explicit !== undefined) return normalize(explicit) ?? "en";

  return (
    normalize(env.KIRITAN_LANG) ??
    normalize(env.LC_ALL) ??
    normalize(env.LC_MESSAGES) ??
    normalize(env.LANG) ??
    "en"
  );
}

export { SUPPORTED_LANGUAGES };
