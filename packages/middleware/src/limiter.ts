import PQueue from "p-queue";
import pRetry from "p-retry";

/** Runs at most `concurrency` tasks at once, and starts no more than one task per `minInterval` ms. */
export function createLimiter(options: {
  concurrency: number;
  minInterval: number;
}): <T>(task: () => Promise<T>) => Promise<T> {
  const queue = new PQueue({
    concurrency: options.concurrency,
    // `strict` makes the interval a rolling window, so starts really are spaced apart instead of bunching at a window's edge.
    ...(options.minInterval > 0
      ? { interval: options.minInterval, intervalCap: 1, strict: true }
      : {}),
  });
  return <T>(task: () => Promise<T>) => queue.add(task) as Promise<T>;
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

/** The longest a `Retry-After` is honored, so one bad header can't hang a run. */
const MAX_RETRY_AFTER = 60_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Retries `task` with exponential backoff (p-retry), honoring a server's `Retry-After` when the error carries it as `retryAfter` in ms. */
export function withRetry<T>(
  task: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const shouldRetry = options.shouldRetry ?? isRetryableError;
  return pRetry(task, {
    retries: options.retries ?? 2,
    minTimeout: options.delay ?? 500,
    factor: 2,
    randomize: false,
    shouldRetry: ({ error }) => shouldRetry(error),
    onFailedAttempt: async ({ error }) => {
      const asked = (error as { retryAfter?: unknown }).retryAfter;
      // Waited on top of the backoff, so the total is at least what the server asked for.
      if (typeof asked === "number" && asked > 0) {
        await sleep(Math.min(asked, MAX_RETRY_AFTER));
      }
    },
  });
}
