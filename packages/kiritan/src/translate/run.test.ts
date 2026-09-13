import { describe, expect, it } from "vitest";
import type {
  BatchTranslateMiddleware,
  TranslateContext,
  TranslateMiddleware,
} from "../config/types.js";
import { runTranslateMiddlewares } from "./run.js";

function ctx(text: string, to = "ja"): TranslateContext {
  return { text, from: "en", to, source: { glob: "*.md", strategy: "inline" } };
}

describe("runTranslateMiddlewares", () => {
  it("returns null for every context when there are no middlewares", async () => {
    const results = await runTranslateMiddlewares([], [ctx("a"), ctx("b")]);
    expect(results).toEqual([null, null]);
  });

  it("resolves via a single-form middleware", async () => {
    const uppercase: TranslateMiddleware = async (c) => c.text.toUpperCase();
    const results = await runTranslateMiddlewares(
      [uppercase],
      [ctx("a"), ctx("b")]
    );
    expect(results).toEqual(["A", "B"]);
  });

  it("falls through to the next single-form middleware when the first defers via next()", async () => {
    const passOnB: TranslateMiddleware = async (c, next) =>
      c.text === "b" ? next() : `${c.text}!`;
    const catchAll: TranslateMiddleware = async (c) => `${c.text}?`;
    const results = await runTranslateMiddlewares(
      [passOnB, catchAll],
      [ctx("a"), ctx("b")]
    );
    expect(results).toEqual(["a!", "b?"]);
  });

  it("resolves via a batch-form middleware", async () => {
    const batch: BatchTranslateMiddleware = {
      batch: true,
      handle: async (ctxs) => ctxs.map((c) => `[${c.text}]`),
    };
    const results = await runTranslateMiddlewares(
      [batch],
      [ctx("a"), ctx("b")]
    );
    expect(results).toEqual(["[a]", "[b]"]);
  });

  it("only passes still-unresolved contexts to the next group", async () => {
    const resolveA: TranslateMiddleware = async (c) =>
      c.text === "a" ? "resolved-a" : null;
    const seen: string[] = [];
    const batch: BatchTranslateMiddleware = {
      batch: true,
      handle: async (ctxs) => {
        seen.push(...ctxs.map((c) => c.text));
        return ctxs.map((c) => `batch-${c.text}`);
      },
    };
    const results = await runTranslateMiddlewares(
      [resolveA, batch],
      [ctx("a"), ctx("b"), ctx("c")]
    );
    expect(seen).toEqual(["b", "c"]);
    expect(results).toEqual(["resolved-a", "batch-b", "batch-c"]);
  });

  it("leaves a context unresolved (null) when no group resolves it", async () => {
    const neverResolves: TranslateMiddleware = async (_c, next) => next();
    const results = await runTranslateMiddlewares([neverResolves], [ctx("a")]);
    expect(results).toEqual([null]);
  });

  it("stops calling further groups once every context is resolved", async () => {
    let batchCalled = false;
    const resolveAll: TranslateMiddleware = async (c) => `done-${c.text}`;
    const batch: BatchTranslateMiddleware = {
      batch: true,
      handle: async (ctxs) => {
        batchCalled = true;
        return ctxs.map(() => "unused");
      },
    };
    const results = await runTranslateMiddlewares(
      [resolveAll, batch],
      [ctx("a")]
    );
    expect(results).toEqual(["done-a"]);
    expect(batchCalled).toBe(false);
  });
});
