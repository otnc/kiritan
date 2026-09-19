import {
  createTranslator,
  type TranslatorMiddleware,
  type TranslatorOptions,
} from "@kiritan/middleware";
import { createFetch, FetchError } from "ofetch";

export type GoogleTranslateMiddleware = TranslatorMiddleware;

/** Tuning shared with every `@kiritan/middleware`-based provider. */
type Tuning = Pick<
  TranslatorOptions,
  "concurrency" | "minInterval" | "cache" | "protect" | "onError" | "onSkip"
>;

export interface GoogleTranslateOptions extends Tuning {
  /** A Google Cloud API key with the Cloud Translation API enabled. */
  apiKey: string;
  /** Overrides the endpoint. Default: `https://translation.googleapis.com`. */
  baseUrl?: string;
  /** Per-locale overrides of the language code sent as `source`/`target`, e.g. `{ zh: "zh-CN" }`. A locale not listed is sent as-is. */
  languageCodes?: Record<string, string>;
  /** Extra fields merged into the request body, e.g. `{ model: "nmt" }`. They can add fields but never override the ones this middleware depends on. */
  extraParams?: Record<string, unknown>;
  /** How many times to retry a failed request (network errors, 408/409/425/429/5xx) before giving up. Default: 2. */
  retry?: number;
  /** Delay before the first retry, in ms (doubled each time). Default: 500. */
  retryDelay?: number;
  /** Per-request timeout, in ms. Default: 30000. */
  timeout?: number;
  /** For testing or a custom transport. Default: the global `fetch`. */
  fetch?: typeof fetch;
}

const DEFAULT_BASE_URL = "https://translation.googleapis.com";
/** The Basic (v2) API takes at most 128 strings, and about 30k code points in total, per request. */
const MAX_TEXTS_PER_REQUEST = 128;
/** One text and one request's texts, in code points of what is actually sent; headroom under 30k. */
const MAX_TEXT_CODE_POINTS = 25_000;
const MAX_BATCH_CODE_POINTS = 28_000;

/** A locale's language code as Google expects it: the override if one is given, otherwise the locale unchanged. */
export function toGoogleLanguage(
  locale: string,
  overrides: Record<string, string> = {}
): string {
  return Object.hasOwn(overrides, locale) ? overrides[locale] : locale;
}

// `@kiritan/middleware` swaps everything that must stay verbatim (code, URLs, front matter, `%{name}`, ...) for `[[N]]` tokens before this sees the text. Google leaves `translate="no"` elements alone when `format` is `html`, so each token is wrapped in one; the rest of the text has to be valid HTML going in, and is un-escaped coming out.
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
const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

function unescapeHtml(text: string): string {
  return text.replace(
    /&(?:#x([0-9a-f]+)|#(\d+)|[a-z]+);/gi,
    (whole, hex: string | undefined, dec: string | undefined) => {
      if (hex) return String.fromCodePoint(Number.parseInt(hex, 16));
      if (dec) return String.fromCodePoint(Number.parseInt(dec, 10));
      return ENTITIES[whole.toLowerCase()] ?? whole;
    }
  );
}

/** Escapes the text as HTML and wraps every `[[N]]` token in a `translate="no"` span. */
export function encode(text: string): string {
  return escapeHtml(text).replace(
    /\[\[(\d+)\]\]/g,
    `${KEEP_OPEN}[[$1]]${KEEP_CLOSE}`
  );
}

/** The inverse of `encode`. */
export function decode(text: string): string {
  return unescapeHtml(
    text.replace(/<span\s+translate="no">/gi, "").replace(/<\/span>/gi, "")
  );
}

interface GoogleResponse {
  data?: { translations?: Array<{ translatedText: string }> };
}

/** A failure the layer's retry logic can read, and that says what Google said. */
class GoogleError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = "GoogleError";
  }
}

function describeError(error: unknown): Error {
  if (error instanceof FetchError && error.status !== undefined) {
    const data: unknown = error.data;
    const detail =
      typeof data === "string" ? data : data ? JSON.stringify(data) : "";
    return new GoogleError(
      `@kiritan/google-translate: Google responded ${error.status}${detail ? `: ${detail}` : ""}`,
      error.status,
      { cause: error }
    );
  }
  return new GoogleError(
    `@kiritan/google-translate: request to Google failed: ${error instanceof Error ? error.message : String(error)}`,
    undefined,
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
        // The layer retries; ofetch must not retry underneath it.
        retry: 0,
        timeout: options.timeout ?? 30_000,
        // `extraParams` goes first so it can add fields but never override the ones placeholder protection and response ordering depend on.
        body: {
          ...options.extraParams,
          q: texts,
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
    throw new GoogleError(
      `@kiritan/google-translate: expected ${texts.length} translation(s), got ${translations?.length ?? 0}`
    );
  }
  return translations.map((entry) => entry.translatedText);
}

/** The size of a text as it will actually be sent: HTML-wrapped and escaped, in code points. */
const wireCodePoints = (text: string) => [...encode(text)].length;

function create(
  options: GoogleTranslateOptions,
  batched: boolean
): TranslatorMiddleware {
  const common: TranslatorOptions = {
    name: "google-translate",
    wire: { encode, decode },
    measure: wireCodePoints,
    maxChars: MAX_TEXT_CODE_POINTS,
    maxBatchChars: MAX_BATCH_CODE_POINTS,
    maxBatchSize: batched ? MAX_TEXTS_PER_REQUEST : 1,
    retry: { retries: options.retry ?? 2, delay: options.retryDelay ?? 500 },
    concurrency: options.concurrency,
    minInterval: options.minInterval,
    cache: options.cache,
    protect: options.protect,
    onError: options.onError,
    onSkip: options.onSkip,
    async translateBatch(texts, { from, to }) {
      return requestTranslations(options, texts, from, to);
    },
  };
  // Unset tuning must not overwrite the layer's own defaults.
  for (const key of Object.keys(common) as Array<keyof TranslatorOptions>) {
    if (common[key] === undefined) delete common[key];
  }
  return createTranslator(common);
}

/**
 * A `translate.middlewares` entry that translates through Google Cloud Translation (Basic, v2), one request per text.
 * Built on `@kiritan/middleware`, so code blocks, inline code, URLs, link destinations, HTML, front matter, `:::kiritan` lines and `%{name}` come back untouched (and a result that lost one is refused), a text over Google's size limit is split at paragraph boundaries and rejoined, and requests are retried on 429/5xx.
 */
export function googleTranslate(
  options: GoogleTranslateOptions
): GoogleTranslateMiddleware {
  return create(options, false);
}

/**
 * The same, but texts sharing a language pair go out together — up to 128 strings / about 30k code points per request. Prefer this for a catalog with many segments.
 */
export function googleTranslateBatch(
  options: GoogleTranslateOptions
): GoogleTranslateMiddleware {
  return create(options, true);
}
