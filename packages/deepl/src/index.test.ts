import { describe, expect, it, vi } from "vitest";
import {
  deepl,
  deeplBatch,
  protect,
  restore,
  toDeepLSource,
  toDeepLTarget,
} from "./index.js";

interface Captured {
  url: string;
  init: RequestInit;
  body: Record<string, unknown>;
}

/** A fake `fetch` that records each request and answers with `respond(texts)`. */
function fakeFetch(
  respond: (texts: string[]) => string[] = (texts) =>
    texts.map((text) => `T(${text})`),
  status = 200
) {
  const calls: Captured[] = [];
  const impl = vi.fn(
    async (url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      calls.push({ url: String(url), init: init ?? {}, body });
      if (status !== 200) {
        return new Response("quota exceeded", { status });
      }
      return Response.json({
        translations: respond(body.text as string[]).map((text) => ({ text })),
      });
    }
  );
  return { calls, fetch: impl as unknown as typeof fetch };
}

const ctx = (text: string, from = "en", to = "ja") => ({ text, from, to });
const next = async () => null;

describe("language codes", () => {
  it("uppercases a target and gives EN/PT their required regional variant", () => {
    expect(toDeepLTarget("ja")).toBe("JA");
    expect(toDeepLTarget("zh-Hans")).toBe("ZH-HANS");
    expect(toDeepLTarget("en")).toBe("EN-US");
    expect(toDeepLTarget("pt")).toBe("PT-BR");
  });

  it("lets a per-locale override win", () => {
    expect(toDeepLTarget("en", { en: "EN-GB" })).toBe("EN-GB");
  });

  it("strips the region from a source", () => {
    expect(toDeepLSource("en-GB")).toBe("EN");
    expect(toDeepLSource("ja")).toBe("JA");
  });
});

describe("placeholder protection", () => {
  it("wraps %{...} in an ignored tag and escapes everything else", () => {
    expect(protect("a < b & c: %{name} > 1")).toBe(
      "a &lt; b &amp; c: <x>%{name}</x> &gt; 1"
    );
  });

  it("round-trips through restore", () => {
    const text = "Hi %{name}, 1 < 2 & 3 > 2 %{a}%{b}";
    expect(restore(protect(text))).toBe(text);
  });

  it("leaves text without placeholders as plain escaped text", () => {
    expect(protect("plain")).toBe("plain");
  });
});

describe("deepl()", () => {
  it("posts one authenticated request in DeepL's documented shape", async () => {
    const { calls, fetch } = fakeFetch();
    const middleware = deepl({ apiKey: "secret", fetch });

    const result = await middleware(ctx("Hello %{name}"), next);

    expect(result).toBe("T(Hello %{name})");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.deepl.com/v2/translate");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.headers).toMatchObject({
      Authorization: "DeepL-Auth-Key secret",
      "Content-Type": "application/json",
    });
    expect(calls[0].body).toEqual({
      text: ["Hello <x>%{name}</x>"],
      source_lang: "EN",
      target_lang: "JA",
      tag_handling: "xml",
      ignore_tags: ["x"],
    });
  });

  it("uses the free endpoint for a key ending in :fx", async () => {
    const { calls, fetch } = fakeFetch();
    await deepl({ apiKey: "abc:fx", fetch })(ctx("Hi"), next);
    expect(calls[0].url).toBe("https://api-free.deepl.com/v2/translate");
  });

  it("honors baseUrl, targetLanguages, and extraParams", async () => {
    const { calls, fetch } = fakeFetch();
    await deepl({
      apiKey: "k",
      baseUrl: "https://proxy.example",
      targetLanguages: { en: "EN-GB" },
      extraParams: { formality: "prefer_less" },
      fetch,
    })(ctx("Bonjour", "fr", "en"), next);

    expect(calls[0].url).toBe("https://proxy.example/v2/translate");
    expect(calls[0].body).toMatchObject({
      source_lang: "FR",
      target_lang: "EN-GB",
      formality: "prefer_less",
    });
  });

  it("un-escapes and un-wraps what DeepL returns", async () => {
    const { fetch } = fakeFetch(() => ["<x>%{name}</x> &lt;3 &amp; more"]);
    const result = await deepl({ apiKey: "k", fetch })(ctx("x"), next);
    expect(result).toBe("%{name} <3 & more");
  });

  it("throws a readable error on a non-OK response", async () => {
    const { fetch } = fakeFetch(undefined, 456);
    await expect(
      deepl({ apiKey: "k", fetch })(ctx("Hi"), next)
    ).rejects.toThrow("DeepL responded 456: quota exceeded");
  });

  it("throws if the number of translations doesn't match", async () => {
    const { fetch } = fakeFetch(() => []);
    await expect(
      deepl({ apiKey: "k", fetch })(ctx("Hi"), next)
    ).rejects.toThrow("expected 1 translation(s), got 0");
  });
});

describe("deeplBatch()", () => {
  const run = (
    options: Parameters<typeof deeplBatch>[0],
    ctxs: ReturnType<typeof ctx>[]
  ) => deeplBatch(options).handle(ctxs, async () => ctxs.map(() => null));

  it("is a batch-form middleware", () => {
    expect(deeplBatch({ apiKey: "k" }).batch).toBe(true);
  });

  it("sends contexts sharing a language pair in one request, keeping order", async () => {
    const { calls, fetch } = fakeFetch();
    const results = await run({ apiKey: "k", fetch }, [
      ctx("one"),
      ctx("two"),
      ctx("three"),
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0].body.text).toEqual(["one", "two", "three"]);
    expect(results).toEqual(["T(one)", "T(two)", "T(three)"]);
  });

  it("splits different language pairs into separate requests, keeping each result in place", async () => {
    const { calls, fetch } = fakeFetch();
    const results = await run({ apiKey: "k", fetch }, [
      ctx("a", "en", "ja"),
      ctx("b", "en", "fr"),
      ctx("c", "en", "ja"),
    ]);
    expect(calls.map((call) => call.body.target_lang)).toEqual(["JA", "FR"]);
    expect(calls[0].body.text).toEqual(["a", "c"]);
    expect(results).toEqual(["T(a)", "T(b)", "T(c)"]);
  });

  it("chunks at DeepL's 50 texts per request", async () => {
    const { calls, fetch } = fakeFetch();
    const many = Array.from({ length: 120 }, (_, i) => ctx(`t${i}`));
    const results = await run({ apiKey: "k", fetch }, many);

    expect(calls.map((call) => (call.body.text as string[]).length)).toEqual([
      50, 50, 20,
    ]);
    expect(results[0]).toBe("T(t0)");
    expect(results[119]).toBe("T(t119)");
  });

  it("makes no request for no contexts", async () => {
    const { calls, fetch } = fakeFetch();
    expect(await run({ apiKey: "k", fetch }, [])).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});
