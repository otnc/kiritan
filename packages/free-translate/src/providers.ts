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

// ───────────────────────── LibreTranslate ─────────────────────────

export interface LibreTranslateOptions extends CommonOptions {
  /** The server's URL, e.g. `http://localhost:5000`. Required: the public libretranslate.com instance now needs a paid key, so this is meant for a server you host. */
  baseUrl: string;
  /** Only if your server was started with `--api-keys`. */
  apiKey?: string;
}

/**
 * [LibreTranslate](https://libretranslate.com/), the open-source engine, on a server you run yourself (no key needed unless you turn `--api-keys` on). Several texts go in one request via the API's array form of `q`.
 * Its language codes are its own (`en`, `ja`, `zh-Hans`, ...); the Kiritan locale is sent as-is, with `zh-CN`/`zh-Hans`-style names normalised to `zh`. Override with `languageCodes`.
 */
export function libreTranslate(
  options: LibreTranslateOptions
): TranslatorMiddleware {
  if (!options.baseUrl) {
    throw new Error(
      "@kiritan/free-translate: libreTranslate needs a `baseUrl`"
    );
  }
  const base = options.baseUrl.replace(/\/+$/, "");
  const code = (locale: string) =>
    resolveCode(locale, options.languageCodes, (l) =>
      toCode(l, { hans: "zh", hant: "zt" })
    );

  return createTranslator({
    name: "libretranslate",
    maxBatchSize: 50,
    concurrency: 4,
    ...tuning(options),
    async translateBatch(texts, { from, to }) {
      const body = await send<{
        translatedText?: string | string[];
        error?: string;
      }>(
        "LibreTranslate",
        `${base}/translate`,
        {
          method: "POST",
          body: {
            q: texts,
            source: code(from),
            target: code(to),
            format: "text",
            ...(options.apiKey ? { api_key: options.apiKey } : {}),
          },
        },
        options
      );
      const translated = body.translatedText;
      const list = Array.isArray(translated)
        ? translated
        : translated === undefined
          ? []
          : [translated];
      if (list.length !== texts.length) {
        throw new ProviderError(
          `@kiritan/free-translate: LibreTranslate returned ${list.length} result(s) for ${texts.length} text(s)${body.error ? `: ${body.error}` : ""}`,
          undefined,
          false
        );
      }
      return list;
    },
  });
}

// ───────────────────── Google Apps Script (self-hosted) ─────────────────────

export interface AppsScriptOptions extends CommonOptions {
  /** The deployed web app's URL: `https://script.google.com/macros/s/<id>/exec`. */
  url: string;
  /**
   * A shared secret, sent as `secret` and checked by the script. A web app deployed for "Anyone" answers whoever finds its URL, so this is what keeps it from being a free translation service for the world (and from spending your quota).
   */
  secret?: string;
}

/**
 * Translates through a small Google Apps Script web app that *you* deploy from your own Google account, using Apps Script's built-in `LanguageApp.translate` (Google Translate). No API key or billing is involved, and the quota is your own account's. The README has the script to paste in.
 * The request is a JSON POST `{ secret, source, target, q: [texts] }` and the script answers `{ translations: [texts] }` (or `{ error }`). Apps Script replies through a redirect, which `fetch` follows. Language codes are Google's, mapped the same way as `googleFree`.
 * If the response isn't JSON, the deployment is usually not set to "Anyone" (Google answers with a sign-in page), and that is what the error says.
 */
export function appsScript(options: AppsScriptOptions): TranslatorMiddleware {
  if (!options.url) {
    throw new Error("@kiritan/free-translate: appsScript needs a `url`");
  }
  const code = (locale: string) =>
    resolveCode(locale, options.languageCodes, toGoogleCode);

  return createTranslator({
    name: "apps-script",
    // Each text is one `LanguageApp.translate` call inside a script that has a runtime limit per request, so batches stay modest.
    maxChars: 5000,
    maxBatchChars: 20_000,
    maxBatchSize: 20,
    concurrency: 2,
    minInterval: 200,
    ...tuning(options),
    async translateBatch(texts, { from, to }) {
      const body = await send<{
        translations?: unknown;
        error?: unknown;
      }>(
        "Google Apps Script",
        options.url,
        {
          method: "POST",
          body: {
            ...(options.secret !== undefined ? { secret: options.secret } : {}),
            source: code(from),
            target: code(to),
            q: texts,
          },
        },
        options
      );

      if (typeof body !== "object" || body === null) {
        throw new ProviderError(
          '@kiritan/free-translate: the Apps Script URL didn\'t return JSON. Check the deployment: "Execute as" should be you and "Who has access" should be "Anyone" (otherwise Google answers with a sign-in page), and re-deploy after editing the script',
          undefined,
          false
        );
      }
      if (body.error !== undefined) {
        throw new ProviderError(
          `@kiritan/free-translate: the Apps Script reported: ${String(body.error)}`,
          undefined,
          false
        );
      }
      const list = body.translations;
      if (
        !Array.isArray(list) ||
        list.length !== texts.length ||
        list.some((entry) => typeof entry !== "string")
      ) {
        throw new ProviderError(
          `@kiritan/free-translate: the Apps Script returned an unexpected response (${texts.length} text(s) sent); expected { "translations": [strings] }`,
          undefined,
          false
        );
      }
      return list as string[];
    },
  });
}
