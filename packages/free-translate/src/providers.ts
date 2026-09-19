import {
  chineseScript,
  createTranslator,
  parseLocale,
  type TranslatorMiddleware,
} from "@kiritan/middleware";
import {
  decodeEntities,
  ProviderError,
  resolveCode,
  send,
  tuning,
  type CommonOptions,
} from "./http.js";

const bytes = (text: string) => Buffer.byteLength(text, "utf8");

/**
 * The service's code for a Kiritan locale, parsed with `Intl.Locale` so any BCP 47 tag works (`en-US` -> `en`): the bare language, except Chinese, which the service names by script (`chinese.hans` for Simplified, `chinese.hant` for Traditional; `zh-Hant`, `zh-TW`, `zh-HK` are all Traditional).
 */
function toCode(
  locale: string,
  chinese: { hans: string; hant: string } = { hans: "zh-CN", hant: "zh-TW" }
): string {
  const { language } = parseLocale(locale);
  if (language !== "zh") return language;
  return chineseScript(locale) === "Hant" ? chinese.hant : chinese.hans;
}

// ───────────────────────────── MyMemory ─────────────────────────────

export interface MyMemoryOptions extends CommonOptions {
  /**
   * A contact email. Sent as `de`, which raises the free daily allowance (about 5,000 characters anonymously, about 50,000 with an email, per MyMemory's docs). It isn't verified.
   */
  email?: string;
  /** Default: `https://api.mymemory.translated.net`. */
  baseUrl?: string;
}

interface MyMemoryResponse {
  responseData?: { translatedText?: string };
  responseStatus?: number | string;
  responseDetails?: string;
  quotaFinished?: boolean | null;
}

/** MyMemory's own limit is 500 *bytes* per query; a little headroom for the tokens' length. */
const MYMEMORY_MAX_BYTES = 480;

/**
 * [MyMemory](https://mymemory.translated.net/doc/spec.php): a translation memory plus machine translation, free without a key within a daily allowance. Its results come from a mix of human-contributed memory and MT, so quality varies.
 * Limits enforced here: 500 bytes per request (a longer text is split at paragraph boundaries and rejoined), one request at a time with 300 ms between them.
 * Never fails silently: MyMemory reports errors as HTTP 200 with the message in `translatedText`, so this checks `responseStatus` and throws.
 */
export function myMemory(options: MyMemoryOptions = {}): TranslatorMiddleware {
  const baseUrl = options.baseUrl ?? "https://api.mymemory.translated.net";
  const code = (locale: string) =>
    resolveCode(locale, options.languageCodes, (l) => toCode(l));

  return createTranslator({
    name: "mymemory",
    measure: bytes,
    maxChars: MYMEMORY_MAX_BYTES,
    concurrency: 1,
    minInterval: 300,
    ...tuning(options),
    async translate(text, { from, to }) {
      const body = await send<MyMemoryResponse>(
        "MyMemory",
        `${baseUrl}/get`,
        {
          query: {
            q: text,
            langpair: `${code(from)}|${code(to)}`,
            de: options.email,
          },
        },
        options
      );
      const status = Number(body.responseStatus);
      if (status !== 200) {
        const detail =
          body.responseDetails || body.responseData?.translatedText || "";
        const quota =
          body.quotaFinished || /QUOTA|ALL AVAILABLE FREE/i.test(detail);
        throw new ProviderError(
          `@kiritan/free-translate: MyMemory responded ${status}: ${detail}${
            quota
              ? " (the free daily allowance is used up; pass `email` for a larger one, or try again tomorrow)"
              : ""
          }`,
          status,
          // Bad language codes, over-length and used-up quota won't clear on a retry; only a server-side error might.
          status >= 500
        );
      }
      const translated = body.responseData?.translatedText;
      if (typeof translated !== "string" || translated === "") {
        throw new ProviderError(
          "@kiritan/free-translate: MyMemory returned no translation",
          status,
          false
        );
      }
      return decodeEntities(translated);
    },
  });
}

// ───────────────────────── Google (keyless) ─────────────────────────

export interface GoogleFreeOptions extends CommonOptions {
  /** Default: `https://clients5.google.com`. */
  baseUrl?: string;
}

const GOOGLE_LANGUAGES = new Set(
  (
    "af sq am ar hy az eu be bn bs bg ca ceb zh-CN zh-TW co hr cs da nl en eo et fi fr fy gl ka de el gu ht ha haw " +
    "iw he hi hmn hu is ig id ga it ja jv kn kk km rw ko ku ky lo la lv lt lb mk mg ms ml mt mi mr mn my ne no ny " +
    "or ps fa pl pt pa ro ru sm gd sr st sn sd si sk sl so es su sw sv tl tg ta tt te th tr tk uk ur ug uz vi cy " +
    "xh yi yo zu"
  ).split(" ")
);

function toGoogleCode(locale: string): string {
  const code = toCode(locale);
  const mapped =
    code === "nb" || code === "nn" ? "no" : code === "fil" ? "tl" : code;
  if (!GOOGLE_LANGUAGES.has(mapped)) {
    // Google's endpoint answers an unknown language with the original text and no error, which would look like a successful (untranslated) run.
    throw new ProviderError(
      `@kiritan/free-translate: "${locale}" isn't a language code Google Translate accepts (mapped to "${mapped}"); pass \`languageCodes: { ${JSON.stringify(locale)}: "<code>" }\` to override`,
      undefined,
      false
    );
  }
  return mapped;
}

/**
 * Google Translate through the keyless endpoint its own Chrome dictionary extension uses (`clients5.google.com`, `client=dict-chrome-ex`). **Unofficial**: it isn't a documented API, has no SLA or quota guarantee, and using it may be against Google's terms; Google can throttle or block it (a CAPTCHA page comes back as HTTP 429), and it can change or disappear without notice. Fine for occasional documentation runs, not for anything you depend on. For a supported service, use `@kiritan/google-translate` with an API key.
 * Several texts go out in one POST, throttled to two at a time with 500 ms between requests, and a run is retried on 429/5xx. An unknown language code throws instead of returning the source unchanged.
 */
export function googleFree(
  options: GoogleFreeOptions = {}
): TranslatorMiddleware {
  const baseUrl = options.baseUrl ?? "https://clients5.google.com";
  const code = (locale: string) =>
    resolveCode(locale, options.languageCodes, toGoogleCode);

  return createTranslator({
    name: "google-free",
    maxChars: 4000,
    maxBatchChars: 4000,
    maxBatchSize: 20,
    concurrency: 2,
    minInterval: 500,
    ...tuning(options),
    async translateBatch(texts, { from, to }) {
      const form = new URLSearchParams();
      for (const text of texts) form.append("q", text);
      const body = await send<unknown>(
        "Google Translate (keyless)",
        `${baseUrl}/translate_a/t`,
        {
          method: "POST",
          query: { client: "dict-chrome-ex", sl: code(from), tl: code(to) },
          body: form,
        },
        options
      );
      // One string per text; with a detected source language it's `[text, lang]` pairs instead.
      const list = Array.isArray(body) ? body : [];
      const results = list.map((entry) =>
        Array.isArray(entry) ? entry[0] : entry
      );
      if (
        results.length !== texts.length ||
        results.some((entry) => typeof entry !== "string")
      ) {
        throw new ProviderError(
          `@kiritan/free-translate: Google Translate (keyless) returned an unexpected response (${texts.length} text(s) sent, ${results.length} back); the endpoint may have changed`,
          undefined,
          false
        );
      }
      return results as string[];
    },
  });
}
