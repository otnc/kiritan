import { createFetch, FetchError } from "ofetch";

/**
 * The slice of Kiritan's `TranslateContext` this package reads. Declared here instead of imported from `kiritan` so the package has no dependency on it at all — a middleware is just a function, and these shapes are structurally compatible with `translate.middlewares`.
 */
export interface TranslateContextLike {
  text: string;
  from: string;
  to: string;
}

export type GoogleTranslateMiddleware = (
  ctx: TranslateContextLike,
  next: () => Promise<string | null>
) => Promise<string | null>;

export interface GoogleTranslateBatchMiddleware {
  batch: true;
  handle: (
    ctxs: TranslateContextLike[],
    next: () => Promise<(string | null)[]>
  ) => Promise<(string | null)[]>;
}

export interface GoogleTranslateOptions {
  /** A Google Cloud API key with the Cloud Translation API enabled. */
  apiKey: string;
  /** Overrides the endpoint. Default: `https://translation.googleapis.com`. */
  baseUrl?: string;
  /** Per-locale overrides of the language code sent as `source`/`target`, e.g. `{ zh: "zh-CN" }`. A locale not listed is sent as-is. */
  languageCodes?: Record<string, string>;
  /** Extra fields merged into the request body, e.g. `{ model: "nmt" }`. */
  extraParams?: Record<string, unknown>;
  /** How many times to retry a failed request (network errors, 408/409/425/429/5xx) before giving up. Default: 2. */
  retry?: number;
  /** Delay between retries, in ms. Default: 500. */
  retryDelay?: number;
  /** Per-request timeout, in ms. Default: 30000. */
  timeout?: number;
  /** For testing or a custom transport. Default: the global `fetch`. */
  fetch?: typeof fetch;
}

const DEFAULT_BASE_URL = "https://translation.googleapis.com";
/** The Basic (v2) API takes at most 128 strings, and roughly 30k code points, per request. */
const MAX_TEXTS_PER_REQUEST = 128;
const MAX_CODE_POINTS_PER_REQUEST = 30_000;

/** A locale's language code as Google expects it: the override if one is given, otherwise the locale unchanged. */
export function toGoogleLanguage(
  locale: string,
  overrides: Record<string, string> = {}
): string {
  return Object.hasOwn(overrides, locale) ? overrides[locale] : locale;
}

// `%{name}` placeholders must come back untouched, so each is wrapped in `<span translate="no">` (which Google honors when `format` is `html`). That means the rest of the text has to be valid HTML going in, and be un-escaped coming out.
const PLACEHOLDER = /%\{[^}]*\}/g;
const KEEP_OPEN = '<span translate="no">';
const KEEP_CLOSE = "</span>";

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

// Entities are decoded in a single pass. Decoding again after `&amp;` would corrupt literal text: a source containing `&#39;` is sent as `&amp;#39;`, and has to come back as `&#39;`, not as an apostrophe.
// Google's responses HTML-escape more than what was sent in (an apostrophe comes back as `&#39;`, for instance), so this decodes the named entities that can appear plus any numeric one.
function unescapeHtml(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_match, decimal: string) =>
      String.fromCodePoint(Number.parseInt(decimal, 10))
    )
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

/** Wraps every `%{...}` in `<span translate="no">` and HTML-escapes everything else. */
export function protect(text: string): string {
  let result = "";
  let last = 0;
  for (const match of text.matchAll(PLACEHOLDER)) {
    result += escapeHtml(text.slice(last, match.index));
    result += `${KEEP_OPEN}${escapeHtml(match[0])}${KEEP_CLOSE}`;
    last = match.index + match[0].length;
  }
  return result + escapeHtml(text.slice(last));
}

/** The inverse of `protect`. */
export function restore(text: string): string {
  return unescapeHtml(
    text.replaceAll(KEEP_OPEN, "").replaceAll(KEEP_CLOSE, "")
  );
}

interface GoogleResponse {
  data?: { translations?: Array<{ translatedText: string }> };
}

/** Turns an ofetch failure into a readable error carrying the HTTP status and the service's own message. */
function describeError(error: unknown): Error {
  if (error instanceof FetchError && error.status !== undefined) {
    const data: unknown = error.data;
    const detail =
      typeof data === "string" ? data : data ? JSON.stringify(data) : "";
    return new Error(
      `@kiritan/google-translate: Google responded ${error.status}${detail ? `: ${detail}` : ""}`,
      { cause: error }
    );
  }
  return new Error(
    `@kiritan/google-translate: request to Google failed: ${error instanceof Error ? error.message : String(error)}`,
    { cause: error }
  );
}

async function requestTranslations(
  options: GoogleTranslateOptions,
  texts: string[],
  from: string,
  to: string
): Promise<string[]> {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const request = createFetch({ fetch: options.fetch ?? globalThis.fetch });
  let response: GoogleResponse;
  try {
    response = await request<GoogleResponse>(
      `${baseUrl}/language/translate/v2`,
      {
        method: "POST",
        headers: { "X-goog-api-key": options.apiKey },
        retry: options.retry ?? 2,
        retryDelay: options.retryDelay ?? 500,
        timeout: options.timeout ?? 30_000,
        // `extraParams` goes first so it can add fields but never override the ones placeholder protection and response ordering depend on.
        body: {
          ...options.extraParams,
          q: texts.map(protect),
          source: toGoogleLanguage(from, options.languageCodes),
          target: toGoogleLanguage(to, options.languageCodes),
          format: "html",
        },
      }
    );
  } catch (error) {
    throw describeError(error);
  }
  const translations = response.data?.translations;
  if (translations?.length !== texts.length) {
    throw new Error(
      `@kiritan/google-translate: expected ${texts.length} translation(s), got ${translations?.length ?? 0}`
    );
  }
  return translations.map((entry) => restore(entry.translatedText));
}

/**
 * A single-form `translate.middlewares` entry that translates every context it sees through Google Cloud Translation (Basic, v2), one request each.
 * `%{name}` placeholders come back unchanged.
 */
export function googleTranslate(
  options: GoogleTranslateOptions
): GoogleTranslateMiddleware {
  return async (ctx) => {
    const [translated] = await requestTranslations(
      options,
      [ctx.text],
      ctx.from,
      ctx.to
    );
    return translated;
  };
}

/** Splits `indexes` into runs that stay within the per-request count and code-point limits. A single text over the code-point limit still goes out alone, for Google to reject with its own error. */
function chunkIndexes(indexes: number[], texts: string[]): number[][] {
  const chunks: number[][] = [];
  let current: number[] = [];
  let codePoints = 0;
  for (const index of indexes) {
    const size = [...protect(texts[index])].length;
    if (
      current.length > 0 &&
      (current.length >= MAX_TEXTS_PER_REQUEST ||
        codePoints + size > MAX_CODE_POINTS_PER_REQUEST)
    ) {
      chunks.push(current);
      current = [];
      codePoints = 0;
    }
    current.push(index);
    codePoints += size;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/**
 * A batch-form `translate.middlewares` entry: contexts sharing a language pair go out together, up to 128 strings / 30k code points per request, instead of one request each. Prefer this for a catalog with many segments.
 */
export function googleTranslateBatch(
  options: GoogleTranslateOptions
): GoogleTranslateBatchMiddleware {
  return {
    batch: true,
    handle: async (ctxs) => {
      const results: (string | null)[] = new Array(ctxs.length).fill(null);
      const groups = new Map<string, number[]>();
      ctxs.forEach((ctx, index) => {
        const key = `${ctx.from}\u0000${ctx.to}`;
        groups.set(key, [...(groups.get(key) ?? []), index]);
      });
      const texts = ctxs.map((ctx) => ctx.text);

      for (const indexes of groups.values()) {
        for (const chunk of chunkIndexes(indexes, texts)) {
          const { from, to } = ctxs[chunk[0]];
          const translated = await requestTranslations(
            options,
            chunk.map((index) => texts[index]),
            from,
            to
          );
          chunk.forEach((index, position) => {
            results[index] = translated[position];
          });
        }
      }
      return results;
    },
  };
}
