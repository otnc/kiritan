import type {
  BatchTranslateMiddleware,
  TranslateContext,
  TranslateMiddleware,
} from "../config/types.js";

type MiddlewareEntry = TranslateMiddleware | BatchTranslateMiddleware;

function isBatchMiddleware(
  entry: MiddlewareEntry
): entry is BatchTranslateMiddleware {
  return typeof entry === "object" && entry !== null && entry.batch === true;
}

interface MiddlewareGroup {
  kind: "single" | "batch";
  middlewares: MiddlewareEntry[];
}

/** Consecutive single-form middlewares become one group; each batch-form middleware is its own group (docs/DESIGN.md 7.1章). */
function groupMiddlewares(middlewares: MiddlewareEntry[]): MiddlewareGroup[] {
  const groups: MiddlewareGroup[] = [];
  for (const middleware of middlewares) {
    if (isBatchMiddleware(middleware)) {
      groups.push({ kind: "batch", middlewares: [middleware] });
      continue;
    }
    const last = groups.at(-1);
    if (last?.kind === "single") {
      last.middlewares.push(middleware);
    } else {
      groups.push({ kind: "single", middlewares: [middleware] });
    }
  }
  return groups;
}

async function runSingleChain(
  middlewares: TranslateMiddleware[],
  ctx: TranslateContext
): Promise<string | null> {
  let called = -1;
  async function dispatch(index: number): Promise<string | null> {
    if (index <= called) {
      throw new Error(
        "kiritan: a translate middleware's next() was called more than once"
      );
    }
    called = index;
    const middleware = middlewares[index];
    if (!middleware) return null;
    return middleware(ctx, () => dispatch(index + 1));
  }
  return dispatch(0);
}

/**
 * Runs `middlewares` over every context, grouped per `groupMiddlewares`.
 * Each group only sees the contexts still unresolved after the previous one; the first group to resolve a context wins.
 */
export async function runTranslateMiddlewares(
  middlewares: MiddlewareEntry[],
  contexts: TranslateContext[]
): Promise<Array<string | null>> {
  const groups = groupMiddlewares(middlewares);
  const results: Array<string | null> = new Array(contexts.length).fill(null);
  let pending = contexts.map((ctx, index) => ({ ctx, index }));

  for (const group of groups) {
    if (pending.length === 0) break;

    if (group.kind === "single") {
      const chain = group.middlewares as TranslateMiddleware[];
      const stillPending: typeof pending = [];
      for (const item of pending) {
        const result = await runSingleChain(chain, item.ctx);
        if (result !== null) {
          results[item.index] = result;
        } else {
          stillPending.push(item);
        }
      }
      pending = stillPending;
      continue;
    }

    const batch = group.middlewares[0] as BatchTranslateMiddleware;
    const batchResults = await batch.handle(
      pending.map((item) => item.ctx),
      async () => pending.map(() => null)
    );
    const stillPending: typeof pending = [];
    pending.forEach((item, position) => {
      const result = batchResults[position] ?? null;
      if (result !== null) {
        results[item.index] = result;
      } else {
        stillPending.push(item);
      }
    });
    pending = stillPending;
  }

  return results;
}
