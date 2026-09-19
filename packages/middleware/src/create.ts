import { cacheKey, createMemoryCache, type CacheStore } from "./cache.js";
import { createLimiter, withRetry, type RetryOptions } from "./limiter.js";
import {
  defaultProtectPatterns,
  isOnlyTokens,
  mask,
  unmask,
} from "./protect.js";
import { joinChunks, splitText, type Chunk } from "./split.js";

/** The slice of Kiritan's `TranslateContext` a middleware reads. Structurally compatible, so this package needs no dependency on `kiritan`. */
export interface TranslateContextLike {
  text: string;
  from: string;
  to: string;
}

/** The pair a provider is asked to translate between. */
export interface LanguagePair {
  from: string;
  to: string;
}

export interface TranslatorMiddleware {
  batch: true;
  handle: (
    ctxs: TranslateContextLike[],
    next: () => Promise<(string | null)[]>
  ) => Promise<(string | null)[]>;
}

export interface TranslatorOptions {
  /** Identifies the provider in the cache key, so two providers never share cached results. */
  name: string;
  /** Translate one text. Give this or `translateBatch`. */
  translate?: (text: string, pair: LanguagePair) => Promise<string>;
  /**
   * Translate several texts in one request; must return one result per input, in order. Prefer this when the provider accepts many texts at once — it means far fewer requests.
   */
  translateBatch?: (texts: string[], pair: LanguagePair) => Promise<string[]>;
  /** The most characters the provider accepts in one text. Longer texts are split at paragraph boundaries and joined back. Default: no limit. */
  maxChars?: number;
  /** How `maxChars`/`maxBatchChars` are counted. Default: string length. Pass a byte counter for a provider that limits bytes, e.g. `(t) => Buffer.byteLength(t)`. */
  measure?: (text: string) => number;
  /** The most texts per `translateBatch` call. Default: 50. */
  maxBatchSize?: number;
  /** The most total characters per `translateBatch` call. Default: no limit. */
  maxBatchChars?: number;
  /** Requests in flight at once. Default: 4. */
  concurrency?: number;
  /** The least time between two requests starting, in ms. Default: 0. */
  minInterval?: number;
  /** Retries for a failed request (default 2, exponential backoff). `false` turns them off. */
  retry?: RetryOptions | false;
  /**
   * What to keep out of the engine's hands: code, URLs, HTML, front matter, Kiritan directives and `%{name}` by default. `false` sends everything as-is; an array replaces the default patterns.
   */
  protect?: false | RegExp[];
  /** Remembers finished translations. Default: in memory for this run. `false` disables it. */
  cache?: false | CacheStore;
  /**
   * What to do when one text fails after its retries: `"throw"` (default) stops `kiritan translate`, `"skip"` leaves that text to the next middleware in the chain (and reports it to `onSkip`).
   */
  onError?: "throw" | "skip";
  onSkip?: (error: unknown, ctx: TranslateContextLike) => void;
}

interface Job {
  key: string;
  text: string;
  pair: LanguagePair;
}

interface Plan {
  ctx: TranslateContextLike;
  cacheId: string;
  cached?: string;
  spans: string[];
  masked: string;
  chunks: Chunk[];
  jobs: Job[];
}

/**
 * Turns "a function that translates text" into a complete Kiritan translate middleware. The provider only supplies `translate` or `translateBatch`; this layer adds everything a real run needs and a bare function doesn't have:
 *  - protecting code, URLs, HTML, front matter, directives and `%{name}` from the engine, and refusing to write a result that lost any of them;
 *  - splitting texts over the provider's length limit, and grouping small ones into batches;
 *  - concurrency, request spacing and retries;
 *  - caching, so an unchanged text is never translated twice.
 * The returned value goes straight into `translate.middlewares`.
 */
export function createTranslator(
  options: TranslatorOptions
): TranslatorMiddleware {
  if (!options.translate && !options.translateBatch) {
    throw new Error(
      "@kiritan/middleware: createTranslator needs `translate` or `translateBatch`"
    );
  }
  const patterns =
    options.protect === false
      ? []
      : (options.protect ?? defaultProtectPatterns);
  const cache =
    options.cache === false
      ? undefined
      : (options.cache ?? createMemoryCache());
  const limit = createLimiter({
    concurrency: options.concurrency ?? 4,
    minInterval: options.minInterval ?? 0,
  });
  const retry =
    options.retry === false ? { retries: 0 } : (options.retry ?? {});
  const maxBatchSize = options.maxBatchSize ?? 50;
  const maxChars = options.maxChars ?? Number.MAX_SAFE_INTEGER;
  const measure = options.measure ?? ((text: string) => text.length);

  const call = <T>(task: () => Promise<T>) =>
    limit(() => withRetry(task, retry));

  /** Sends `jobs` to the provider, batched and rate-limited. Returns every result that came back, plus the first failure if any request failed — a partial result is still worth keeping. */
  async function send(
    jobs: Job[]
  ): Promise<{ out: Map<string, string>; error?: unknown }> {
    const out = new Map<string, string>();
    const groups = new Map<string, Job[]>();
    for (const job of jobs) {
      const groupKey = `${job.pair.from}\u0000${job.pair.to}`;
      groups.set(groupKey, [...(groups.get(groupKey) ?? []), job]);
    }

    const tasks: Array<Promise<void>> = [];
    for (const group of groups.values()) {
      const pair = group[0].pair;

      if (!options.translateBatch) {
        for (const job of group) {
          tasks.push(
            call(() => options.translate!(job.text, pair)).then((result) => {
              out.set(job.key, result);
            })
          );
        }
        continue;
      }

      let current: Job[] = [];
      let chars = 0;
      const flush = () => {
        if (current.length === 0) return;
        const batch = current;
        current = [];
        chars = 0;
        tasks.push(
          call(() =>
            options.translateBatch!(
              batch.map((job) => job.text),
              pair
            )
          ).then((results) => {
            if (results.length !== batch.length) {
              throw new Error(
                `@kiritan/middleware: "${options.name}" returned ${results.length} result(s) for ${batch.length} text(s)`
              );
            }
            batch.forEach((job, i) => out.set(job.key, results[i]));
          })
        );
      };
      for (const job of group) {
        const overChars =
          options.maxBatchChars !== undefined &&
          chars + measure(job.text) > options.maxBatchChars;
        if (
          current.length > 0 &&
          (current.length >= maxBatchSize || overChars)
        ) {
          flush();
        }
        current.push(job);
        chars += measure(job.text);
      }
      flush();
    }

    const settled = await Promise.allSettled(tasks);
    const failure = settled.find(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    );
    return failure ? { out, error: failure.reason } : { out };
  }

  return {
    batch: true,
    async handle(ctxs) {
      const plans: Plan[] = await Promise.all(
        ctxs.map(async (ctx): Promise<Plan> => {
          const cacheId = cacheKey([options.name, ctx.from, ctx.to, ctx.text]);
          const cached = cache ? await cache.get(cacheId) : undefined;
          const { text: masked, spans } = mask(ctx.text, patterns);
          const chunks = isOnlyTokens(masked)
            ? []
            : splitText(masked, maxChars, measure);
          const jobs = chunks.map((chunk): Job => ({
            key: cacheKey([ctx.from, ctx.to, chunk.text]),
            text: chunk.text,
            pair: { from: ctx.from, to: ctx.to },
          }));
          return { ctx, cacheId, cached, spans, masked, chunks, jobs };
        })
      );

      // Identical chunk texts (common across segments) are sent once.
      const unique = new Map<string, Job>();
      for (const plan of plans) {
        if (plan.cached !== undefined) continue;
        for (const job of plan.jobs) unique.set(job.key, job);
      }

      const first = await send([...unique.values()]);
      const results = first.out;
      const firstError = first.error;

      const output: (string | null)[] = [];
      for (const plan of plans) {
        if (plan.cached !== undefined) {
          output.push(plan.cached);
          continue;
        }
        try {
          let missing = plan.jobs.filter((job) => !results.has(job.key));
          if (missing.length > 0) {
            if (options.onError !== "skip") throw firstError;
            // A failed batch may have been sunk by a single bad text; try this text's jobs on their own.
            const own = await send(missing);
            for (const [key, value] of own.out) results.set(key, value);
            missing = plan.jobs.filter((job) => !results.has(job.key));
            if (missing.length > 0) throw own.error;
          }
          const translated = plan.jobs.map((job) => results.get(job.key) ?? "");
          const joined =
            plan.chunks.length === 0
              ? plan.masked
              : joinChunks(plan.chunks, translated, plan.masked);
          const final = unmask(joined, plan.spans);
          if (cache) await cache.set(plan.cacheId, final);
          output.push(final);
        } catch (error) {
          if (options.onError !== "skip") throw error;
          options.onSkip?.(error, plan.ctx);
          output.push(null);
        }
      }
      return output;
    },
  };
}
