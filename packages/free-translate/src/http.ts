import { parseRetryAfter, type TranslatorOptions } from "@kiritan/middleware";
import { decode } from "html-entities";
import { createFetch, FetchError } from "ofetch";

/** Options every provider shares: the layer's tuning knobs, plus the transport. */
export interface CommonOptions extends Pick<
  TranslatorOptions,
  | "concurrency"
  | "minInterval"
  | "retry"
  | "cache"
  | "protect"
  | "onError"
  | "onSkip"
> {
  /** Per-request timeout in ms. Default: 30000. */
  timeout?: number;
  /** A custom `fetch`, for testing or a proxy. Default: the global `fetch`. */
  fetch?: typeof fetch;
  /** Per-locale overrides of the language code sent to the service. */
  languageCodes?: Record<string, string>;
}

/** A failure the layer's retry logic can read: `status` decides whether it is retried, `retryable: false` forces it not to be. */
export class ProviderError extends Error {
  /** How long the service asked us to wait, in ms; the layer's retry honors it. */
  readonly retryAfter?: number;

  constructor(
    message: string,
    readonly status?: number,
    readonly retryable?: boolean,
    options?: { cause?: unknown; retryAfter?: number }
  ) {
    super(message, options);
    this.name = "ProviderError";
    this.retryAfter = options?.retryAfter;
  }
}

export interface RequestInit2 {
  method?: "GET" | "POST";
  query?: Record<string, string | undefined>;
  body?: Record<string, unknown> | URLSearchParams;
  headers?: Record<string, string>;
}

/** One request through ofetch, without its own retry (the layer retries), with failures turned into a readable `ProviderError` that keeps the HTTP status. */
export async function send<T>(
  service: string,
  url: string,
  init: RequestInit2,
  common: CommonOptions
): Promise<T> {
  const request = createFetch({ fetch: common.fetch ?? globalThis.fetch });
  try {
    return await request<T>(url, {
      method: init.method ?? "GET",
      query: init.query,
      body: init.body,
      headers: init.headers,
      retry: 0,
      timeout: common.timeout ?? 30_000,
    });
  } catch (error) {
    if (error instanceof FetchError && error.status !== undefined) {
      const data: unknown = error.data;
      const detail =
        typeof data === "string"
          ? data
              .replace(/<[^>]*>/g, " ")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 200)
          : data
            ? JSON.stringify(data)
            : "";
      throw new ProviderError(
        `@kiritan/free-translate: ${service} responded ${error.status}${detail ? `: ${detail}` : ""}`,
        error.status,
        undefined,
        {
          cause: error,
          retryAfter: parseRetryAfter(
            error.response?.headers.get("retry-after")
          ),
        }
      );
    }
    throw new ProviderError(
      `@kiritan/free-translate: request to ${service} failed: ${error instanceof Error ? error.message : String(error)}`,
      undefined,
      undefined,
      { cause: error }
    );
  }
}

/**
 * The options a provider hands on to `createTranslator`, with unset ones dropped: spreading `{ concurrency: undefined }` over a provider's own default would silently erase it.
 */
export function tuning(common: CommonOptions): Partial<TranslatorOptions> {
  const picked: Partial<TranslatorOptions> = {};
  for (const key of [
    "concurrency",
    "minInterval",
    "retry",
    "cache",
    "protect",
    "onError",
    "onSkip",
  ] as const) {
    if (common[key] !== undefined) {
      (picked as Record<string, unknown>)[key] = common[key];
    }
  }
  return picked;
}

/** Decodes the entities a service may add to plain text (`&amp;`, `&#39;`, ...), in one pass so an escaped `&amp;#39;` stays `&#39;`. */
export function decodeEntities(text: string): string {
  return decode(text, { level: "xml" });
}

/** Applies a per-locale override if there is one, otherwise `fallback(locale)`. */
export function resolveCode(
  locale: string,
  overrides: Record<string, string> | undefined,
  fallback: (locale: string) => string
): string {
  return overrides && Object.hasOwn(overrides, locale)
    ? overrides[locale]
    : fallback(locale);
}
