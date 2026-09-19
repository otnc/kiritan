/** Runs at most `concurrency` tasks at once, and starts no two tasks less than `minInterval` ms apart. */
export function createLimiter(options: {
  concurrency: number;
  minInterval: number;
}): <T>(task: () => Promise<T>) => Promise<T> {
  let active = 0;
  // Starts are serialised through one chain, and each waits until `minInterval` has passed since the previous one *actually* began — so timer jitter can't bunch two starts together.
  let gate: Promise<void> = Promise.resolve();
  let lastStart = 0;
  const waiting: Array<() => void> = [];

  const release = () => {
    active -= 1;
    waiting.shift()?.();
  };

  const waitForTurn = (): Promise<void> => {
    gate = gate.then(async () => {
      for (;;) {
        const wait = lastStart + options.minInterval - Date.now();
        if (wait <= 0) break;
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
      lastStart = Date.now();
    });
    return gate;
  };

  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= options.concurrency) {
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    active += 1;
    try {
      if (options.minInterval > 0) await waitForTurn();
      return await task();
    } finally {
      release();
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

export async function withRetry<T>(
  task: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const retries = options.retries ?? 2;
  const shouldRetry = options.shouldRetry ?? isRetryableError;
  let delay = options.delay ?? 500;
  for (let attempt = 0; ; attempt++) {
    try {
      return await task();
    } catch (error) {
      if (attempt >= retries || !shouldRetry(error)) throw error;
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
    }
  }
}
