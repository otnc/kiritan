import { describe, expect, it, vi } from "vitest";
import {
  googleTranslate,
  googleTranslateBatch,
  protect,
  restore,
  toGoogleLanguage,
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
        return new Response("API key not valid", { status });
      }
      return Response.json({
        data: {
          translations: respond(body.q as string[]).map((translatedText) => ({
            translatedText,
          })),
        },
      });
    }
  );
  return { calls, fetch: impl as unknown as typeof fetch };
}

const ctx = (text: string, from = "en", to = "ja") => ({ text, from, to });
const next = async () => null;

describe("language codes", () => {
  it("sends a locale unchanged unless overridden", () => {
    expect(toGoogleLanguage("ja")).toBe("ja");
    expect(toGoogleLanguage("zh-TW")).toBe("zh-TW");
    expect(toGoogleLanguage("zh", { zh: "zh-CN" })).toBe("zh-CN");
  });
});

describe("placeholder protection", () => {
  it("wraps %{...} in translate=no and escapes everything else", () => {
    expect(protect("a < b & c: %{name} > 1")).toBe(
      'a &lt; b &amp; c: <span translate="no">%{name}</span> &gt; 1'
    );
  });

  it("round-trips through restore", () => {
    const text = "Hi %{name}, 1 < 2 & 3 > 2 %{a}%{b}";
    expect(restore(protect(text))).toBe(text);
  });

  it("decodes the extra entities Google escapes on its own", () => {
    expect(restore("it&#39;s &quot;fine&quot; &#x3053;")).toBe(
      'it\'s "fine" こ'
    );
  });
});

describe("googleTranslate()", () => {
  it("posts one authenticated request in Cloud Translation v2's documented shape", async () => {
    const { calls, fetch } = fakeFetch();
    const result = await googleTranslate({ apiKey: "secret", fetch })(
      ctx("Hello %{name}"),
      next
    );

    expect(result).toBe("T(Hello %{name})");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(
      "https://translation.googleapis.com/language/translate/v2"
    );
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.headers).toMatchObject({
      "X-goog-api-key": "secret",
      "Content-Type": "application/json",
    });
    expect(calls[0].body).toEqual({
      q: ['Hello <span translate="no">%{name}</span>'],
      source: "en",
      target: "ja",
      format: "html",
    });
  });

  it("honors baseUrl, languageCodes, and extraParams", async () => {
    const { calls, fetch } = fakeFetch();
    await googleTranslate({
      apiKey: "k",
      baseUrl: "https://proxy.example",
      languageCodes: { zh: "zh-CN" },
      extraParams: { model: "nmt" },
      fetch,
    })(ctx("Hello", "en", "zh"), next);

    expect(calls[0].url).toBe("https://proxy.example/language/translate/v2");
    expect(calls[0].body).toMatchObject({
      target: "zh-CN",
      model: "nmt",
    });
  });

  it("never lets extraParams override the fields the middleware depends on", async () => {
    const { calls, fetch } = fakeFetch();
    await googleTranslate({
      apiKey: "k",
      extraParams: { format: "text", q: ["x"], model: "nmt" },
      fetch,
    })(ctx("Hi %{a}"), next);

    expect(calls[0].body).toMatchObject({
      q: ['Hi <span translate="no">%{a}</span>'],
      format: "html",
      model: "nmt",
    });
  });

  it("round-trips source text that itself contains entity-like sequences", async () => {
    // The source has the literal characters &#39; and &amp;; they go out escaped and must come back as the same literal characters, not be decoded a second time.
    const { calls, fetch } = fakeFetch((texts) => texts);
    const source = "Type &#39; or &amp; literally";
    const result = await googleTranslate({ apiKey: "k", fetch })(
      ctx(source),
      next
    );
    expect(calls[0].body.q).toEqual(["Type &amp;#39; or &amp;amp; literally"]);
    expect(result).toBe(source);
  });

  it("un-escapes and un-wraps what Google returns", async () => {
    const { fetch } = fakeFetch(() => [
      '<span translate="no">%{name}</span> &lt;3 it&#39;s &amp; more',
    ]);
    const result = await googleTranslate({ apiKey: "k", fetch })(
      ctx("x"),
      next
    );
    expect(result).toBe("%{name} <3 it's & more");
  });

  it("throws a readable error on a non-OK response", async () => {
    const { fetch } = fakeFetch(undefined, 400);
    await expect(
      googleTranslate({ apiKey: "k", fetch })(ctx("Hi"), next)
    ).rejects.toThrow("Google responded 400: API key not valid");
  });

  it("throws if the number of translations doesn't match", async () => {
    const { fetch } = fakeFetch(() => []);
    await expect(
      googleTranslate({ apiKey: "k", fetch })(ctx("Hi"), next)
    ).rejects.toThrow("expected 1 translation(s), got 0");
  });
});

describe("googleTranslateBatch()", () => {
  const run = (
    options: Parameters<typeof googleTranslateBatch>[0],
    ctxs: ReturnType<typeof ctx>[]
  ) =>
    googleTranslateBatch(options).handle(ctxs, async () =>
      ctxs.map(() => null)
    );

  it("is a batch-form middleware", () => {
    expect(googleTranslateBatch({ apiKey: "k" }).batch).toBe(true);
  });

  it("sends contexts sharing a language pair in one request, keeping order", async () => {
    const { calls, fetch } = fakeFetch();
    const results = await run({ apiKey: "k", fetch }, [
      ctx("one"),
      ctx("two"),
      ctx("three"),
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0].body.q).toEqual(["one", "two", "three"]);
    expect(results).toEqual(["T(one)", "T(two)", "T(three)"]);
  });

  it("splits different language pairs into separate requests, keeping each result in place", async () => {
    const { calls, fetch } = fakeFetch();
    const results = await run({ apiKey: "k", fetch }, [
      ctx("a", "en", "ja"),
      ctx("b", "en", "fr"),
      ctx("c", "en", "ja"),
    ]);
    expect(calls.map((call) => call.body.target)).toEqual(["ja", "fr"]);
    expect(calls[0].body.q).toEqual(["a", "c"]);
    expect(results).toEqual(["T(a)", "T(b)", "T(c)"]);
  });

  it("chunks at 128 strings per request", async () => {
    const { calls, fetch } = fakeFetch();
    const many = Array.from({ length: 300 }, (_, i) => ctx(`t${i}`));
    const results = await run({ apiKey: "k", fetch }, many);

    expect(calls.map((call) => (call.body.q as string[]).length)).toEqual([
      128, 128, 44,
    ]);
    expect(results[0]).toBe("T(t0)");
    expect(results[299]).toBe("T(t299)");
  });

  it("chunks at 30k code points per request", async () => {
    const { calls, fetch } = fakeFetch();
    const big = "x".repeat(20_000);
    const results = await run({ apiKey: "k", fetch }, [
      ctx(big),
      ctx(big),
      ctx("small"),
    ]);

    expect(calls.map((call) => (call.body.q as string[]).length)).toEqual([
      1, 2,
    ]);
    expect(results).toEqual([`T(${big})`, `T(${big})`, "T(small)"]);
  });

  it("makes no request for no contexts", async () => {
    const { calls, fetch } = fakeFetch();
    expect(await run({ apiKey: "k", fetch }, [])).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});
