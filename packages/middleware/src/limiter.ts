import { retry, Semaphore } from "es-toolkit";
import { RateLimiter } from "limiter";

/** Runs at most `concurrency` tasks at once, and starts no more than one task per `minInterval` ms. */
export function createLimiter(options: {
  concurrency: number;
  minInterval: number;
}): <T>(task: () => Promise<T>) => Promise<T> {
  const slots = new Semaphore(options.concurrency);
  const spacing =
    options.minInterval > 0
      ? new RateLimiter({ tokensPerInterval: 1, interval: options.minInterval })
      : undefined;

  return async <T>(task: () => Promise<T>): Promise<T> => {
    await slots.acquire();
    try {
      await spacing?.removeTokens(1);
      return await task();
    } finally {
      slots.release();
    }
  };
}

export interface RetryOptions {
  /** How many times to retry after the first attempt. Default: 2. */
  retries?: number;
  /** Delay before the first retry, doubled each time, in ms. Default: 500. */
  delay?: number;
  /** Whether a failure is worth retrying. Default: `isRetryableError`. */
  shouldRetry?: (error: unknown) => boolean;
}

/**
 * A network failure (no HTTP status) or a status that usually clears up on its own: 408/409/425/429/5xx. Reads `status` (or `statusCode`) off the error, which is where ofetch, undici and most HTTP clients put it. An error with `retryable: false` is never retried.
 */
export function isRetryableError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return true;
  const e = error as {
    status?: unknown;
    statusCode?: unknown;
    retryable?: unknown;
  };
  if (e.retryable === false) return false;
  const status = typeof e.status === "number" ? e.status : e.statusCode;
  if (typeof status !== "number") return true;
  return [408, 409, 425, 429].includes(status) || status >= 500;
}

/**
 * A `Retry-After` header value (delay in seconds, or an HTTP date) as milliseconds from now, or `undefined` if it's absent or unreadable. Put the result on the thrown error as `retryAfter` and `withRetry` waits at least that long.
 */
export function parseRetryAfter(
  value: string | null | undefined
): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

/** The longest a `Retry-After` is honored, so one bad header can't hang a run. */
const MAX_RETRY_AFTER = 60_000;

/** Retries `task` with exponential backoff, waiting at least as long as a server's `Retry-After` when the error carries it as `retryAfter` in ms. */
export function withRetry<T>(
  task: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const shouldRetry = options.shouldRetry ?? isRetryableError;
  const base = options.delay ?? 500;
  return retry(task, {
    retries: options.retries ?? 2,
    shouldRetry: (error) => shouldRetry(error),
    delay: (attempts, error) => {
      const asked = (error as { retryAfter?: unknown } | null)?.retryAfter;
      const requested =
        typeof asked === "number" ? Math.min(asked, MAX_RETRY_AFTER) : 0;
      return Math.max(base * 2 ** attempts, requested);
    },
  });
}
