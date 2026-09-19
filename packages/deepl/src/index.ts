/**
 * The slice of Kiritan's `TranslateContext` this package reads. Declared here instead of imported from `kiritan` so the package has no dependency on it at all — a middleware is just a function, and these shapes are structurally compatible with `translate.middlewares`.
 */
export interface TranslateContextLike {
  text: string;
  from: string;
  to: string;
}

export type DeepLMiddleware = (
  ctx: TranslateContextLike,
  next: () => Promise<string | null>
) => Promise<string | null>;

export interface DeepLBatchMiddleware {
  batch: true;
  handle: (
    ctxs: TranslateContextLike[],
    next: () => Promise<(string | null)[]>
  ) => Promise<(string | null)[]>;
}

export interface DeepLOptions {
  /** Your DeepL API authentication key. */
  apiKey: string;
  /** Overrides the endpoint. Default: the free API for a key ending in `:fx`, otherwise the Pro API. */
  baseUrl?: string;
  /** Per-locale overrides of the DeepL language code sent as `target_lang`, e.g. `{ en: "EN-GB" }`. */
  targetLanguages?: Record<string, string>;
  /** Extra fields merged into the request body, e.g. `{ formality: "prefer_less" }`. */
  extraParams?: Record<string, unknown>;
  /** For testing or a custom transport. Default: the global `fetch`. */
  fetch?: typeof fetch;
}

const FREE_URL = "https://api-free.deepl.com";
const PRO_URL = "https://api.deepl.com";
/** DeepL accepts at most 50 texts per request. */
const MAX_TEXTS_PER_REQUEST = 50;
/** ...and a request body of at most 128 KiB; this leaves headroom for the other fields. */
const MAX_BODY_BYTES = 120 * 1024;

// DeepL's `target_lang` has no bare EN/PT — it wants the regional variant. Everything else is just the uppercased Kiritan locale.
const DEFAULT_TARGET_OVERRIDES: Record<string, string> = {
  EN: "EN-US",
  PT: "PT-BR",
};

/** `ja` -> `JA`, `zh-Hans` -> `ZH-HANS`; `en`/`pt` get the regional variant DeepL requires for a target. */
export function toDeepLTarget(
  locale: string,
  overrides: Record<string, string> = {}
): string {
  if (Object.hasOwn(overrides, locale)) return overrides[locale];
  const upper = locale.toUpperCase();
  return DEFAULT_TARGET_OVERRIDES[upper] ?? upper;
}

/** DeepL's `source_lang` doesn't take a regional variant: `en-GB` -> `EN`. */
export function toDeepLSource(locale: string): string {
  return locale.split("-")[0].toUpperCase();
}

// `%{name}` placeholders must come back untouched, so each is wrapped in a tag DeepL is told to leave alone (`tag_handling: xml` + `ignore_tags`). That means the rest of the text has to be valid XML going in, and be un-escaped coming out.
const PLACEHOLDER = /%\{[^}]*\}/g;
const KEEP_TAG = "x";

function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function unescapeXml(text: string): string {
  return text
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

/** Wraps every `%{...}` in `<x>...</x>` and XML-escapes everything else. */
export function protect(text: string): string {
  let result = "";
  let last = 0;
  for (const match of text.matchAll(PLACEHOLDER)) {
    result += escapeXml(text.slice(last, match.index));
    result += `<${KEEP_TAG}>${escapeXml(match[0])}</${KEEP_TAG}>`;
    last = match.index + match[0].length;
  }
  return result + escapeXml(text.slice(last));
}

/** The inverse of `protect`. */
export function restore(text: string): string {
  return unescapeXml(
    text.replaceAll(`<${KEEP_TAG}>`, "").replaceAll(`</${KEEP_TAG}>`, "")
  );
}

interface DeepLResponse {
  translations?: Array<{ text: string }>;
}

async function requestTranslations(
  options: DeepLOptions,
  texts: string[],
  from: string,
  to: string
): Promise<string[]> {
  const baseUrl =
    options.baseUrl ?? (options.apiKey.endsWith(":fx") ? FREE_URL : PRO_URL);
  const doFetch = options.fetch ?? fetch;
  const response = await doFetch(`${baseUrl}/v2/translate`, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    // `extraParams` goes first so it can add fields but never override the ones placeholder protection and response ordering depend on.
    body: JSON.stringify({
      ...options.extraParams,
      text: texts.map(protect),
      source_lang: toDeepLSource(from),
      target_lang: toDeepLTarget(to, options.targetLanguages),
      tag_handling: "xml",
      ignore_tags: [KEEP_TAG],
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `@kiritan/deepl: DeepL responded ${response.status}${detail ? `: ${detail}` : ""}`
    );
  }
  const body = (await response.json()) as DeepLResponse;
  if (body.translations?.length !== texts.length) {
    throw new Error(
      `@kiritan/deepl: expected ${texts.length} translation(s), got ${body.translations?.length ?? 0}`
    );
  }
  return body.translations.map((entry) => restore(entry.text));
}

/**
 * A single-form `translate.middlewares` entry that translates every context it sees through DeepL, one request each.
 * `%{name}` placeholders come back unchanged.
 */
export function deepl(options: DeepLOptions): DeepLMiddleware {
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

/** Splits `indexes` into runs within DeepL's per-request text count and body size (measured on the escaped, JSON-encoded text, which is what actually goes out). A single text over the size limit still goes out alone, for DeepL to reject with its own error. */
function chunkIndexes(
  indexes: number[],
  ctxs: TranslateContextLike[]
): number[][] {
  const chunks: number[][] = [];
  let current: number[] = [];
  let bytes = 0;
  for (const index of indexes) {
    const size = Buffer.byteLength(JSON.stringify(protect(ctxs[index].text)));
    if (
      current.length > 0 &&
      (current.length >= MAX_TEXTS_PER_REQUEST || bytes + size > MAX_BODY_BYTES)
    ) {
      chunks.push(current);
      current = [];
      bytes = 0;
    }
    current.push(index);
    bytes += size;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/**
 * A batch-form `translate.middlewares` entry: contexts sharing a language pair go out together, up to DeepL's 50 texts / 128 KiB per request, instead of one request each. Prefer this for a catalog with many segments.
 */
export function deeplBatch(options: DeepLOptions): DeepLBatchMiddleware {
  return {
    batch: true,
    handle: async (ctxs) => {
      const results: (string | null)[] = new Array(ctxs.length).fill(null);
      const groups = new Map<string, number[]>();
      ctxs.forEach((ctx, index) => {
        const key = `${ctx.from}\u0000${ctx.to}`;
        groups.set(key, [...(groups.get(key) ?? []), index]);
      });

      for (const indexes of groups.values()) {
        for (const chunk of chunkIndexes(indexes, ctxs)) {
          const { from, to } = ctxs[chunk[0]];
          const translated = await requestTranslations(
            options,
            chunk.map((index) => ctxs[index].text),
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
