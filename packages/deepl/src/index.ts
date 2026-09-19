import {
  chineseScript,
  createTranslator,
  parseLocale,
  parseRetryAfter,
  type TranslatorMiddleware,
  type TranslatorOptions,
} from "@kiritan/middleware";
import { createHash } from "node:crypto";
import {
  decode as decodeEntities,
  encode as encodeEntities,
} from "html-entities";
import { createFetch, FetchError } from "ofetch";

export type DeepLMiddleware = TranslatorMiddleware;

/** Tuning shared with every `@kiritan/middleware`-based provider. */
type Tuning = Pick<
  TranslatorOptions,
  "concurrency" | "minInterval" | "cache" | "protect" | "onError" | "onSkip"
>;

export interface DeepLOptions extends Tuning {
  /** Your DeepL API authentication key. */
  apiKey: string;
  /** Overrides the endpoint. Default: the free API for a key ending in `:fx`, otherwise the Pro API. */
  baseUrl?: string;
  /** Per-locale overrides of the DeepL language code sent as `target_lang`, e.g. `{ en: "EN-GB" }`. */
  targetLanguages?: Record<string, string>;
  /** Extra fields merged into the request body, e.g. `{ formality: "prefer_less" }`. They can add fields but never override the ones this middleware depends on. */
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

const FREE_URL = "https://api-free.deepl.com";
const PRO_URL = "https://api.deepl.com";
/** DeepL accepts at most 50 texts per request, in a body of at most 128 KiB. */
const MAX_TEXTS_PER_REQUEST = 50;
/** One text and one request's texts, in bytes of the JSON that is actually sent; headroom under 128 KiB for the other fields. */
const MAX_TEXT_BYTES = 100 * 1024;
const MAX_BATCH_BYTES = 120 * 1024;

/**
 * The DeepL `target_lang` for a Kiritan locale, parsed with `Intl.Locale` so any BCP 47 tag works (`ja`, `en-US`, `zh-Hant-TW`, `pt_BR`).
 * DeepL has no bare `EN`/`PT` as a target, only a regional variant (British English if the locale says GB, else American; European Portuguese if PT, else Brazilian); Chinese is `ZH-HANS`/`ZH-HANT` by script; Norwegian is always `NB`; anything else is the upper-cased language. `overrides` (matched on the exact locale) win.
 */
export function toDeepLTarget(
  locale: string,
  overrides: Record<string, string> = {}
): string {
  if (Object.hasOwn(overrides, locale)) return overrides[locale];
  const { language, region } = parseLocale(locale);
  switch (language) {
    case "en":
      return region === "GB" ? "EN-GB" : "EN-US";
    case "pt":
      return region === "PT" ? "PT-PT" : "PT-BR";
    case "zh":
      return chineseScript(locale) === "Hant" ? "ZH-HANT" : "ZH-HANS";
    case "no":
    case "nb":
    case "nn":
      return "NB";
    default:
      return language.toUpperCase();
  }
}

/** DeepL's `source_lang` takes no regional variant or script: `en-GB` -> `EN`, `zh-Hant` -> `ZH`, `no` -> `NB`. */
export function toDeepLSource(locale: string): string {
  const { language } = parseLocale(locale);
  return (
    language === "no" || language === "nn" ? "nb" : language
  ).toUpperCase();
}

// `@kiritan/middleware` swaps everything that must stay verbatim (code, URLs, front matter, `%{name}`, ...) for `[[N]]` tokens before this sees the text. DeepL is told to leave an XML tag alone (`tag_handling: xml` + `ignore_tags`), so each token is wrapped in one; the rest of the text has to be valid XML going in, and is un-escaped coming out.
const KEEP_TAG = "x";

/** Escapes the text as XML and wraps every `[[N]]` token in the ignored tag. */
export function encode(text: string): string {
  return encodeEntities(text, { mode: "specialChars" }).replace(
    /\[\[(\d+)\]\]/g,
    `<${KEEP_TAG}>[[$1]]</${KEEP_TAG}>`
  );
}

/** The inverse of `encode`. */
export function decode(text: string): string {
  return decodeEntities(text.replace(new RegExp(`</?${KEEP_TAG}>`, "gi"), ""), {
    level: "xml",
  });
}

interface DeepLResponse {
  translations?: Array<{ text: string }>;
}

/** A failure the layer's retry logic can read, and that says what DeepL said. */
class DeepLError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** How long DeepL asked us to wait, in ms; the layer's retry honors it. */
    readonly retryAfter?: number,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.name = "DeepLError";
  }
}

function describeError(error: unknown): Error {
  if (error instanceof FetchError && error.status !== undefined) {
    const data: unknown = error.data;
    const detail =
      typeof data === "string" ? data : data ? JSON.stringify(data) : "";
    return new DeepLError(
      `@kiritan/deepl: DeepL responded ${error.status}${detail ? `: ${detail}` : ""}`,
      error.status,
      parseRetryAfter(error.response?.headers.get("retry-after")),
      { cause: error }
    );
  }
  return new DeepLError(
    `@kiritan/deepl: request to DeepL failed: ${error instanceof Error ? error.message : String(error)}`,
    undefined,
    undefined,
    { cause: error }
  );
}

async function requestTranslations(
  options: DeepLOptions,
  texts: string[],
  from: string,
  to: string
): Promise<string[]> {
  const baseUrl =
    options.baseUrl ?? (options.apiKey.endsWith(":fx") ? FREE_URL : PRO_URL);
  const request = createFetch({ fetch: options.fetch ?? globalThis.fetch });
  let body: DeepLResponse;
  try {
    body = await request<DeepLResponse>(`${baseUrl}/v2/translate`, {
      method: "POST",
      headers: { Authorization: `DeepL-Auth-Key ${options.apiKey}` },
      // The layer retries; ofetch must not retry underneath it.
      retry: 0,
      timeout: options.timeout ?? 30_000,
      // `extraParams` goes first so it can add fields but never override the ones placeholder protection and response ordering depend on.
      body: {
        ...options.extraParams,
        text: texts,
        source_lang: toDeepLSource(from),
        target_lang: toDeepLTarget(to, options.targetLanguages),
        tag_handling: "xml",
        ignore_tags: [KEEP_TAG],
      },
    });
  } catch (error) {
    throw describeError(error);
  }
  if (body.translations?.length !== texts.length) {
    throw new DeepLError(
      `@kiritan/deepl: expected ${texts.length} translation(s), got ${body.translations?.length ?? 0}`
    );
  }
  return body.translations.map((entry) => entry.text);
}

/** The size of a text as it will actually be sent: XML-wrapped and JSON-encoded, in UTF-8 bytes. */
const wireBytes = (text: string) =>
  Buffer.byteLength(JSON.stringify(encode(text)), "utf8");

function create(options: DeepLOptions, batched: boolean): TranslatorMiddleware {
  const common: TranslatorOptions = {
    // Everything that changes what DeepL returns is part of the cache key, so editing `formality` or a target mapping never serves a stale translation from a persistent cache.
    name: `deepl:${createHash("sha1")
      .update(
        JSON.stringify([
          options.extraParams ?? {},
          options.targetLanguages ?? {},
        ])
      )
      .digest("hex")
      .slice(0, 12)}`,
    wire: { encode, decode },
    measure: wireBytes,
    maxChars: MAX_TEXT_BYTES,
    maxBatchChars: MAX_BATCH_BYTES,
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
 * A `translate.middlewares` entry that translates through DeepL, one request per text.
 * Built on `@kiritan/middleware`, so code blocks, inline code, URLs, link destinations, HTML, front matter, `:::kiritan` lines and `%{name}` come back untouched (and a result that lost one is refused), a text over DeepL's size limit is split at paragraph boundaries and rejoined, and requests are retried on 429/5xx.
 */
export function deepl(options: DeepLOptions): DeepLMiddleware {
  return create(options, false);
}

/**
 * The same, but texts sharing a language pair go out together — up to DeepL's 50 texts / 128 KiB per request. Prefer this for a catalog with many segments.
 */
export function deeplBatch(options: DeepLOptions): DeepLMiddleware {
  return create(options, true);
}
